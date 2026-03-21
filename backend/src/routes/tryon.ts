import { Router, Request, Response } from 'express';
import { generateTryOnV2, downloadImageToBase64, ImageBlockedError, TimeoutError, withGeminiLimit, geminiConcurrency } from '../services/gemini';
import { classifyProduct, getPromptForCategory, getCachedClassification, cacheClassification, describeSelfie } from '../services/classifier';
import { uploadBuffer, cdnUrl } from '../services/s3';
import { putSession } from '../services/dynamo';
import sharp from 'sharp';
import crypto from 'crypto';

// C4: Reject early if too many requests are queued (prevent unbounded memory growth)
const MAX_QUEUED = 20;

export const tryonRouter = Router();

// H3: Max selfie base64 size — ~7MB base64 = ~5MB image
const MAX_SELFIE_BASE64_LEN = 7 * 1024 * 1024;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Selfie description — call once when selfie is set, cache on client
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
tryonRouter.post('/selfie-describe', async (req: Request, res: Response) => {
  const { selfieBase64 } = req.body;
  if (!selfieBase64) {
    res.status(400).json({ error: 'selfieBase64 is required' });
    return;
  }
  try {
    // Compress selfie for description only — don't need 5MB for a 1-line text description
    const fullBuffer = Buffer.from(selfieBase64, 'base64');
    const smallBuffer = await sharp(fullBuffer).resize(512).jpeg({ quality: 70 }).toBuffer();
    const smallBase64 = smallBuffer.toString('base64');
    console.log(`[selfie-describe] Compressed ${(selfieBase64.length / 1024).toFixed(0)}KB → ${(smallBase64.length / 1024).toFixed(0)}KB for description`);
    const description = await describeSelfie(smallBase64);
    res.json({ description });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V2 — Single-step try-on. No prepare, no zone detection.
// One call: selfie + product image → result.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
tryonRouter.post('/tryon/v2', async (req: Request, res: Response) => {
  // C4: Reject if server is overloaded
  const { queued } = geminiConcurrency();
  if (queued >= MAX_QUEUED) {
    res.status(503).json({ error: 'Server busy, try again in a moment' });
    return;
  }

  const startTime = Date.now();
  const { selfieBase64, productImageUrl, sourceUrl, selfieDescription } = req.body;
  const tag = `[${req.deviceId}]`;

  if (!selfieBase64) {
    res.status(400).json({ error: 'selfieBase64 is required' });
    return;
  }

  if (!productImageUrl) {
    res.status(400).json({ error: 'productImageUrl is required' });
    return;
  }

  if (typeof selfieBase64 === 'string' && selfieBase64.length > MAX_SELFIE_BASE64_LEN) {
    res.status(400).json({ error: 'Selfie too large' });
    return;
  }

  try {
    // Download product image
    const dlStart = Date.now();
    const productBase64 = await downloadImageToBase64(productImageUrl);
    console.log(`${tag} V2 → product download: ${Date.now() - dlStart}ms`);

    // Classify product → category-specific prompt
    const classStart = Date.now();
    let category = getCachedClassification(productImageUrl);
    if (category) {
      console.log(`${tag} V2 → category (cached): ${category}`);
    } else {
      category = await classifyProduct(productBase64);
      cacheClassification(productImageUrl, category);
      console.log(`${tag} V2 → category (classified): ${category} in ${Date.now() - classStart}ms`);
    }
    const prompt = getPromptForCategory(category, selfieDescription);

    // Generate with NB1 + category-specific prompt
    const genStart = Date.now();
    console.log(`${tag} V2 → productImageUrl=${productImageUrl}`);
    console.log(`${tag} V2 → generating with nb1, category=${category}`);
    const resultBase64 = await withGeminiLimit(() => generateTryOnV2(selfieBase64, productBase64, false, prompt));
    const genMs = Date.now() - genStart;
    console.log(`${tag} V2 → done: ${genMs}ms, base64 length=${resultBase64.length}`);

    const sessionId = `ses_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const tryonS3Key = `${req.deviceId}/tryons/${sessionId}.jpg`;
    const durationMs = Date.now() - startTime;

    res.json({
      sessionId,
      tryonS3Key,
      resultBase64,
      resultCdnUrl: cdnUrl(tryonS3Key),
      model: 'v2',
      durationMs,
    });

    // Background: S3 + DynamoDB
    (async () => {
      try {
        const pngBuffer = Buffer.from(resultBase64, 'base64');
        const resultBuffer = await sharp(pngBuffer).jpeg({ quality: 85 }).toBuffer();
        await uploadBuffer(tryonS3Key, resultBuffer, 'image/jpeg');
        console.log(`${tag} V2 → S3 upload (bg): done, jpg=${resultBuffer.length} → ${cdnUrl(tryonS3Key)}`);

        await putSession({
          deviceId: req.deviceId,
          sessionId,
          sourceUrl: sourceUrl || undefined,
          tryonS3Key,
          tryonCdnUrl: tryonS3Key,
          model: 'v2',
          createdAt: new Date().toISOString(),
        });
        console.log(`${tag} V2 → DynamoDB save (bg): done`);
      } catch (bgErr: any) {
        console.error(`${tag} V2 → background save FAILED: ${bgErr.message}`);
      }
    })();
  } catch (err: any) {
    const is503 = err.message?.includes('503') || err.message?.includes('UNAVAILABLE') || err.message?.includes('high demand');
    if (is503) {
      console.error(`${tag} V2 SERVER_BUSY:`, err.message);
      res.status(503).json({ error: 'SERVER_BUSY' });
    } else if (err instanceof TimeoutError) {
      console.error(`${tag} V2 TIMEOUT:`, err.message);
      res.status(504).json({ error: 'TIMEOUT' });
    } else if (err instanceof ImageBlockedError) {
      console.error(`${tag} V2 BLOCKED:`, err.reason);
      res.status(422).json({ error: 'IMAGE_BLOCKED' });
    } else {
      console.error(`${tag} V2 ERROR:`, err.message);
      res.status(500).json({ error: 'Try-on generation failed' });
    }
  }
});
