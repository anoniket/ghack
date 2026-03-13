import { Router, Request, Response } from 'express';
import { prepareTryOn, generateTryOn, generateTryOnV2, downloadImageToBase64, ImageBlockedError, TimeoutError, withGeminiLimit, geminiConcurrency } from '../services/gemini';
import { uploadBuffer, cdnUrl, downloadToBuffer } from '../services/s3';
import { putSession } from '../services/dynamo';
import sharp from 'sharp';
import crypto from 'crypto';

// NoSuchKey detection helper
function isSelfieNotFound(err: any): boolean {
  return err?.name === 'NoSuchKey' || err?.Code === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;
}

// C4: Reject early if too many requests are queued (prevent unbounded memory growth)
const MAX_QUEUED = 20;

export const tryonRouter = Router();

// Server-side cache: prepare caches selfie + product base64 + dynamic prompt for generate (5 min TTL)
// PERF-8: Bounded to 20 entries to prevent OOM (each entry holds 1-3MB selfie base64)
const MAX_PREPARE_CACHE = 20;
const prepareCache = new Map<string, { selfieBase64: string; productBase64: string; imageGenPrompt: string; ts: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of prepareCache) {
    if (now - val.ts > 5 * 60 * 1000) prepareCache.delete(key);
  }
}, 60 * 1000);

// H3: Max selfie base64 size — ~7MB base64 = ~5MB image
const MAX_SELFIE_BASE64_LEN = 7 * 1024 * 1024;

// Step 1: Zone detection — caches selfie + product base64 for step 2
tryonRouter.post('/tryon/prepare', async (req: Request, res: Response) => {
  const { queued } = geminiConcurrency();
  if (queued >= MAX_QUEUED) {
    res.status(503).json({ error: 'Server busy, try again in a moment' });
    return;
  }

  const { selfieBase64, productImageUrl, retry } = req.body;

  if (!selfieBase64 || !productImageUrl) {
    res.status(400).json({ error: 'selfieBase64 and productImageUrl are required' });
    return;
  }

  if (typeof selfieBase64 === 'string' && selfieBase64.length > MAX_SELFIE_BASE64_LEN) {
    res.status(400).json({ error: 'Selfie too large' });
    return;
  }

  const tag = `[${req.deviceId}]`;

  try {
    const t = Date.now();
    console.log(`${tag} Prepare → zone detection started`);
    const { usePhotoshoot, productBase64, productZone, reasoning, imageGenPrompt } = await withGeminiLimit(() => prepareTryOn(selfieBase64, productImageUrl));
    console.log(`${tag} Prepare → zone detection: ${Date.now() - t}ms`);
    console.log(`${tag} Prepare → product_zone=${productZone}, zone_visible=${!usePhotoshoot}`);
    if (reasoning) console.log(`${tag} Prepare → reasoning: ${reasoning.slice(0, 200)}`);
    if (imageGenPrompt) console.log(`${tag} Prepare → dynamic prompt: ${imageGenPrompt.slice(0, 150)}...`);

    // Cache for generate step — no need to re-upload or re-download
    // PERF-8/M11: Evict oldest by timestamp if at capacity
    if (!prepareCache.has(req.deviceId) && prepareCache.size >= MAX_PREPARE_CACHE) {
      let oldestKey: string | null = null;
      let oldestTs = Infinity;
      for (const [key, val] of prepareCache) {
        if (val.ts < oldestTs) { oldestTs = val.ts; oldestKey = key; }
      }
      if (oldestKey) prepareCache.delete(oldestKey);
    }
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
    // SEC-7: Generic error to client, details logged server-side only
    res.status(500).json({ error: 'Prepare failed' });
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
    const resultBase64 = await withGeminiLimit(() => generateTryOn(selfieBase64, productBase64, !!usePhotoshoot, dynamicPrompt));
    const geminiMs = Date.now() - geminiStart;
    console.log(`${tag} Generate → Gemini API: ${geminiMs}ms, base64 length=${resultBase64.length}`);

    // Respond immediately with base64 — app can inject into WebView right away
    const sessionId = `ses_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const tryonS3Key = `${req.deviceId}/tryons/${sessionId}.jpg`;
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
        const pngBuffer = Buffer.from(resultBase64, 'base64');
        const resultBuffer = await sharp(pngBuffer).jpeg({ quality: 85 }).toBuffer();
        await uploadBuffer(tryonS3Key, resultBuffer, 'image/jpeg');
        console.log(`${tag} Generate → S3 upload (bg): ${Date.now() - bt}ms, jpg=${resultBuffer.length}`);

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
    if (err instanceof TimeoutError) {
      console.error(`${tag} Generate TIMEOUT:`, err.message);
      res.status(504).json({ error: 'TIMEOUT' });
    } else if (err instanceof ImageBlockedError) {
      console.error(`${tag} Generate BLOCKED:`, err.reason);
      res.status(422).json({ error: 'IMAGE_BLOCKED' });
    } else {
      console.error(`${tag} Generate ERROR:`, err.message);
      res.status(500).json({ error: 'Try-on generation failed' });
    }
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
  const { selfieBase64: clientSelfieBase64, productImageUrl, selfieS3Key, sourceUrl, retry } = req.body;
  const tag = `[${req.deviceId}]`;
  const usePro = !!retry;

  // H5: IDOR check — selfieS3Key must belong to this device
  if (selfieS3Key && !selfieS3Key.startsWith(`${req.deviceId}/`)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (!selfieS3Key && !clientSelfieBase64) {
    res.status(400).json({ error: 'selfieS3Key or selfieBase64 is required' });
    return;
  }

  if (!productImageUrl) {
    res.status(400).json({ error: 'productImageUrl is required' });
    return;
  }

  if (typeof clientSelfieBase64 === 'string' && clientSelfieBase64.length > MAX_SELFIE_BASE64_LEN) {
    res.status(400).json({ error: 'Selfie too large' });
    return;
  }

  try {
    // C5/PERF-2: Download selfie from S3 (server-to-S3 is same datacenter, instant)
    // Falls back to client-sent base64 if S3 key not available
    let selfieBase64: string;
    if (selfieS3Key) {
      const s3Start = Date.now();
      try {
        const selfieBuffer = await downloadToBuffer(selfieS3Key);
        selfieBase64 = selfieBuffer.toString('base64');
        console.log(`${tag} V2 → selfie from S3: ${Date.now() - s3Start}ms, ${selfieBuffer.length} bytes`);
      } catch (s3Err: any) {
        if (isSelfieNotFound(s3Err)) {
          console.error(`${tag} V2 → selfie not found in S3: ${selfieS3Key}`);
          res.status(400).json({ error: 'SELFIE_NOT_FOUND' });
          return;
        }
        throw s3Err;
      }
    } else {
      console.log(`${tag} V2 → using client-sent selfie base64 (no S3 key)`);
      selfieBase64 = clientSelfieBase64;
    }

    // Download product image
    const dlStart = Date.now();
    const productBase64 = await downloadImageToBase64(productImageUrl);
    console.log(`${tag} V2 → product download: ${Date.now() - dlStart}ms`);

    // Generate — same prompt, pro model on retry
    const genStart = Date.now();
    const modelLabel = usePro ? 'pro' : 'nano-banana-2';
    console.log(`${tag} V2 → generating with ${modelLabel}${retry ? ' (retry)' : ''}`);
    const resultBase64 = await withGeminiLimit(() => generateTryOnV2(selfieBase64, productBase64, usePro));
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
      model: usePro ? 'v2-pro' : 'v2',
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
          selfieS3Key,
          tryonS3Key,
          tryonCdnUrl: tryonS3Key,
          model: usePro ? 'v2-pro' : 'v2',
          createdAt: new Date().toISOString(),
        });
        console.log(`${tag} V2 → DynamoDB save (bg): done`);
      } catch (bgErr: any) {
        console.error(`${tag} V2 → background save FAILED: ${bgErr.message}`);
      }
    })();
  } catch (err: any) {
    if (err instanceof TimeoutError) {
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
