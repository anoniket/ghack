import { Router, Request, Response } from 'express';
import { generateTryOnV2, downloadImageToBase64, ImageBlockedError, TimeoutError } from '../services/gemini';
import { classifyProduct, getPromptForCategory, describeSelfie } from '../services/classifier';
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
// Selfie cache — stores base64 per device, sent once during onboarding
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface SelfieCacheEntry {
  base64s: string[];
  updatedAt: number;
}
const selfieCache = new Map<string, SelfieCacheEntry>();
const SELFIE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour inactivity

// Cleanup stale entries every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of selfieCache) {
    if (now - entry.updatedAt > SELFIE_CACHE_TTL_MS) {
      selfieCache.delete(key);
      console.log(`[SelfieCache] Evicted ${key} (inactive ${Math.round((now - entry.updatedAt) / 60000)}min)`);
    }
  }
}, 10 * 60 * 1000);

// POST /tryon/selfie-cache — phone sends selfie base64s once, backend caches
tryonRouter.post('/tryon/selfie-cache', async (req: Request, res: Response) => {
  const { selfieBase64s } = req.body;
  const deviceId = req.userId;

  if (!Array.isArray(selfieBase64s)) {
    res.status(400).json({ error: 'selfieBase64s array required' });
    return;
  }
  if (selfieBase64s.length > 3) {
    res.status(400).json({ error: 'Maximum 3 selfies' });
    return;
  }

  // Empty array = clear cache (delete-all flow)
  if (selfieBase64s.length === 0) {
    selfieCache.delete(deviceId);
    console.log(`[${deviceId}] SelfieCache → CLEARED (delete-all, ${selfieCache.size} devices remain)`);
    res.json({ cached: false, count: 0 });
    return;
  }

  selfieCache.set(deviceId, { base64s: selfieBase64s, updatedAt: Date.now() });
  const totalKB = selfieBase64s.reduce((sum: number, s: string) => sum + s.length, 0) / 1024;
  console.log(`[${deviceId}] SelfieCache → STORED ${selfieBase64s.length} selfies (${totalKB.toFixed(0)}KB total, ${selfieCache.size} devices cached)`);
  res.json({ cached: true, count: selfieBase64s.length });
});

// GET /tryon/selfie-cache/status — phone checks if backend has cached selfies
tryonRouter.get('/tryon/selfie-cache/status', (req: Request, res: Response) => {
  const entry = selfieCache.get(req.userId);
  if (entry) {
    entry.updatedAt = Date.now(); // refresh TTL on check
    console.log(`[${req.userId}] SelfieCache → HIT (${entry.base64s.length} selfies cached)`);
    res.json({ cached: true, count: entry.base64s.length });
  } else {
    console.log(`[${req.userId}] SelfieCache → MISS (no cached selfies)`);
    res.json({ cached: false, count: 0 });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Selfie description — call once when selfie is set, cache on client
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
tryonRouter.post('/selfie-describe', async (req: Request, res: Response) => {
  const { selfieBase64 } = req.body;
  const tag = `[${req.userId}]`;
  if (!selfieBase64) {
    res.status(400).json({ error: 'selfieBase64 is required' });
    return;
  }
  try {
    console.log(`${tag} SelfieDescribe → received ${(selfieBase64.length / 1024).toFixed(0)}KB selfie`);
    // Compress selfie for description only — don't need 5MB for a 1-line text description
    const fullBuffer = Buffer.from(selfieBase64, 'base64');
    const smallBuffer = await sharp(fullBuffer).resize(512).jpeg({ quality: 70 }).toBuffer();
    const smallBase64 = smallBuffer.toString('base64');
    console.log(`${tag} SelfieDescribe → compressed to ${(smallBase64.length / 1024).toFixed(0)}KB, calling Gemini...`);
    const t0 = Date.now();
    const description = await describeSelfie(smallBase64);
    console.log(`${tag} SelfieDescribe → done in ${Date.now() - t0}ms: "${description}"`);
    res.json({ description });
  } catch (err: any) {
    console.error(`${tag} SelfieDescribe → ERROR: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V2 — Single-step try-on. No prepare, no zone detection.
// One call: selfie + product image → result.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
tryonRouter.post('/tryon/v2', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { productImageUrl, sourceUrl, selfieDescription, model: requestedModel } = req.body;
  const tag = `[${req.userId}]`;

  // Resolve selfies: cache first, then body, then backward compat
  let selfieBase64s: string[];
  const cacheEntry = selfieCache.get(req.userId);

  if (cacheEntry) {
    // Use cached selfies — zero upload overhead
    selfieBase64s = cacheEntry.base64s;
    cacheEntry.updatedAt = Date.now(); // refresh TTL
    console.log(`${tag} V2 → using cached selfies (${selfieBase64s.length} images)`);
  } else if (Array.isArray(req.body.selfieBase64s) && req.body.selfieBase64s.length > 0) {
    selfieBase64s = req.body.selfieBase64s;
    // Cache them for next time
    selfieCache.set(req.userId, { base64s: selfieBase64s, updatedAt: Date.now() });
    console.log(`${tag} V2 → selfies from body, now cached (${selfieBase64s.length} images)`);
  } else if (typeof req.body.selfieBase64 === 'string' && req.body.selfieBase64.length > 0) {
    selfieBase64s = [req.body.selfieBase64];
    selfieCache.set(req.userId, { base64s: selfieBase64s, updatedAt: Date.now() });
    console.log(`${tag} V2 → single selfie from body (backward compat), now cached`);
  } else {
    res.status(400).json({ error: 'No selfies available. Upload selfies first.' });
    return;
  }

  // Validate: at least 1, max 3
  if (selfieBase64s.length > 3) {
    res.status(400).json({ error: 'Maximum 3 selfie images allowed' });
    return;
  }

  if (!productImageUrl) {
    res.status(400).json({ error: 'productImageUrl is required' });
    return;
  }

  // Validate each selfie size
  for (const selfie of selfieBase64s) {
    if (typeof selfie !== 'string' || selfie.length > MAX_SELFIE_BASE64_LEN) {
      res.status(400).json({ error: 'Selfie too large' });
      return;
    }
  }

  try {
    // Download product image
    const dlStart = Date.now();
    const productBase64 = await downloadImageToBase64(productImageUrl);
    console.log(`${tag} V2 → product download: ${Date.now() - dlStart}ms`);

    // Classify product — fresh every time
    const classStart = Date.now();
    const { category, description: productDesc } = await classifyProduct(productBase64);
    console.log(`${tag} V2 → category: ${category}, product: ${productDesc}, in ${Date.now() - classStart}ms`);
    const prompt = getPromptForCategory(category, selfieDescription, productDesc, selfieBase64s.length);

    // Generate with selected model
    const usePro = requestedModel === 'pro';
    const useNb1 = requestedModel === 'nb1';
    const modelLabel = usePro ? 'pro' : useNb1 ? 'nb1' : 'nb2';
    const genStart = Date.now();
    console.log(`${tag} V2 → productImageUrl=${productImageUrl}`);
    console.log(`${tag} V2 → generating with ${modelLabel}, category=${category}, selfies=${selfieBase64s.length}`);
    const resultBase64 = await generateTryOnV2(selfieBase64s, productBase64, usePro, prompt, useNb1);
    const genMs = Date.now() - genStart;
    console.log(`${tag} V2 → done: ${genMs}ms, base64 length=${resultBase64.length}`);

    const sessionId = `ses_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const tryonS3Key = `${req.userId}/tryons/${sessionId}.jpg`;
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
          deviceId: req.userId,
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
