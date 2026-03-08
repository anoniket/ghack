import { Router, Request, Response } from 'express';
import { prepareTryOn, generateTryOn, downloadImageToBase64 } from '../services/gemini';
import { uploadBuffer } from '../services/s3';
import { putSession } from '../services/dynamo';

export const tryonRouter = Router();

// Server-side cache: prepare caches selfie + product base64 for generate (5 min TTL)
const prepareCache = new Map<string, { selfieBase64: string; productBase64: string; ts: number }>();
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
    const { usePhotoshoot, productBase64 } = await prepareTryOn(selfieBase64, productImageUrl);
    console.log(`${tag} Prepare → zone detection: ${Date.now() - t}ms`);

    // Cache for generate step — no need to re-upload or re-download
    prepareCache.set(req.deviceId, { selfieBase64, productBase64, ts: Date.now() });

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
      let t = Date.now();
      productBase64 = await downloadImageToBase64(productImageUrl);
      console.log(`${tag} Generate → product image download (fallback): ${Date.now() - t}ms`);
    }

    t = Date.now();
    console.log(`${tag} Generate → ${usePhotoshoot ? 'PRO' : 'FLASH'} started`);
    const resultBase64 = await generateTryOn(selfieBase64, productBase64, !!usePhotoshoot);
    const geminiMs = Date.now() - t;
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
