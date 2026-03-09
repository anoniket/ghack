import { Router, Request, Response } from 'express';
import { prepareTryOn, generateTryOn, generateTryOnV2, downloadImageToBase64 } from '../services/gemini';
import { uploadBuffer, cdnUrl } from '../services/s3';
import { putSession } from '../services/dynamo';

export const tryonRouter = Router();

// Server-side cache: prepare caches selfie + product base64 + dynamic prompt for generate (5 min TTL)
const prepareCache = new Map<string, { selfieBase64: string; productBase64: string; imageGenPrompt: string; ts: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of prepareCache) {
    if (now - val.ts > 5 * 60 * 1000) prepareCache.delete(key);
  }
}, 60 * 1000);

// Step 1: Zone detection — caches selfie + product base64 for step 2
tryonRouter.post('/tryon/prepare', async (req: Request, res: Response) => {
  const { selfieBase64, productImageUrl, retry } = req.body;

  if (!selfieBase64 || !productImageUrl) {
    res.status(400).json({ error: 'selfieBase64 and productImageUrl are required' });
    return;
  }

  const tag = `[${req.deviceId}]`;

  try {
    const t = Date.now();
    console.log(`${tag} Prepare → zone detection started`);
    const { usePhotoshoot, productBase64, productZone, reasoning, imageGenPrompt } = await prepareTryOn(selfieBase64, productImageUrl);
    console.log(`${tag} Prepare → zone detection: ${Date.now() - t}ms`);
    console.log(`${tag} Prepare → product_zone=${productZone}, zone_visible=${!usePhotoshoot}`);
    if (reasoning) console.log(`${tag} Prepare → reasoning: ${reasoning}`);
    if (imageGenPrompt) console.log(`${tag} Prepare → dynamic prompt: ${imageGenPrompt.slice(0, 150)}...`);

    // Cache for generate step — no need to re-upload or re-download
    prepareCache.set(req.deviceId, { selfieBase64, productBase64, imageGenPrompt, ts: Date.now() });

    const finalUsePhotoshoot = retry ? true : usePhotoshoot;
    console.log(`${tag} Prepare → model=${finalUsePhotoshoot ? 'PRO' : 'FLASH'} (zone=${usePhotoshoot ? 'hidden' : 'visible'}, retry=${!!retry})`);

    res.json({
      usePhotoshoot: finalUsePhotoshoot,
      model: finalUsePhotoshoot ? 'pro' : 'flash',
      estimatedDuration: finalUsePhotoshoot ? 40000 : 17000,
    });
  } catch (err: any) {
    console.error(`${tag} Prepare ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Prepare failed' });
  }
});

// Step 2: Generate — uses cached selfie+product from prepare, returns base64 immediately
tryonRouter.post('/tryon/generate', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { selfieS3Key, productImageUrl, sourceUrl, usePhotoshoot } = req.body;

  const tag = `[${req.deviceId}]`;

  // Use cached data from prepare step
  const cached = prepareCache.get(req.deviceId);
  prepareCache.delete(req.deviceId);

  if (!cached && !productImageUrl) {
    res.status(400).json({ error: 'No cached prepare data and no productImageUrl provided' });
    return;
  }

  try {
    const selfieBase64 = cached?.selfieBase64;
    if (!selfieBase64) {
      res.status(400).json({ error: 'No selfie data — call prepare first' });
      return;
    }

    let productBase64 = cached?.productBase64;
    if (!productBase64) {
      const pt = Date.now();
      productBase64 = await downloadImageToBase64(productImageUrl);
      console.log(`${tag} Generate → product image download (fallback): ${Date.now() - pt}ms`);
    }

    const dynamicPrompt = cached?.imageGenPrompt;
    const geminiStart = Date.now();
    console.log(`${tag} Generate → ${usePhotoshoot ? 'PRO' : 'FLASH'} started (dynamic prompt: ${dynamicPrompt ? 'yes' : 'no, using fallback'})`);
    const resultBase64 = await generateTryOn(selfieBase64, productBase64, !!usePhotoshoot, dynamicPrompt);
    const geminiMs = Date.now() - geminiStart;
    console.log(`${tag} Generate → Gemini API: ${geminiMs}ms, base64 length=${resultBase64.length}`);

    // Respond immediately with base64 — app can inject into WebView right away
    const sessionId = `ses_${Date.now()}`;
    const tryonS3Key = `${req.deviceId}/tryons/${sessionId}.png`;
    const durationMs = Date.now() - startTime;
    console.log(`${tag} Generate → responding with base64 in ${durationMs}ms, session=${sessionId}`);

    res.json({
      sessionId,
      tryonS3Key,
      resultBase64,
      model: usePhotoshoot ? 'pro' : 'flash',
      durationMs,
    });

    // Fire-and-forget: S3 upload + DynamoDB save in background
    (async () => {
      try {
        let bt = Date.now();
        const resultBuffer = Buffer.from(resultBase64, 'base64');
        await uploadBuffer(tryonS3Key, resultBuffer, 'image/png');
        console.log(`${tag} Generate → S3 upload (bg): ${Date.now() - bt}ms`);

        console.log(`${tag} Generate → sourceUrl=${sourceUrl || '(none)'}`);
        await putSession({
          deviceId: req.deviceId,
          sessionId,
          sourceUrl: sourceUrl || undefined,
          selfieS3Key,
          tryonS3Key,
          tryonCdnUrl: tryonS3Key,
          model: usePhotoshoot ? 'pro' : 'flash',
          createdAt: new Date().toISOString(),
        });
        console.log(`${tag} Generate → DynamoDB save (bg): done`);
      } catch (bgErr: any) {
        console.error(`${tag} Generate → background save FAILED: ${bgErr.message}`);
      }
    })();
  } catch (err: any) {
    console.error(`${tag} Generate ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Try-on generation failed' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V2 — Single-step try-on. No prepare, no zone detection.
// One call: selfie + product image → result.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
tryonRouter.post('/tryon/v2', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { selfieBase64, productImageUrl, selfieS3Key, sourceUrl } = req.body;
  const tag = `[${req.deviceId}]`;

  if (!selfieBase64 || !productImageUrl) {
    res.status(400).json({ error: 'selfieBase64 and productImageUrl are required' });
    return;
  }

  try {
    // Download product image
    const dlStart = Date.now();
    const productBase64 = await downloadImageToBase64(productImageUrl);
    console.log(`${tag} V2 → product download: ${Date.now() - dlStart}ms`);

    // Single Nano Banana 2 call — no zone detection, no thinking
    const genStart = Date.now();
    console.log(`${tag} V2 → generating with nano-banana-2`);
    const resultBase64 = await generateTryOnV2(selfieBase64, productBase64);
    const genMs = Date.now() - genStart;
    console.log(`${tag} V2 → done: ${genMs}ms, base64 length=${resultBase64.length}`);

    const sessionId = `ses_${Date.now()}`;
    const tryonS3Key = `${req.deviceId}/tryons/${sessionId}.png`;
    const durationMs = Date.now() - startTime;

    res.json({
      sessionId,
      tryonS3Key,
      resultBase64,
      model: 'v2',
      durationMs,
    });

    // Background: S3 + DynamoDB
    (async () => {
      try {
        const resultBuffer = Buffer.from(resultBase64, 'base64');
        await uploadBuffer(tryonS3Key, resultBuffer, 'image/png');
        console.log(`${tag} V2 → S3 upload (bg): done → ${cdnUrl(tryonS3Key)}`);

        await putSession({
          deviceId: req.deviceId,
          sessionId,
          sourceUrl: sourceUrl || undefined,
          selfieS3Key,
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
    console.error(`${tag} V2 ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'V2 try-on failed' });
  }
});
