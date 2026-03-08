import { Router, Request, Response } from 'express';
import { prepareTryOn, generateTryOn, downloadImageToBase64 } from '../services/gemini';
import { downloadToBuffer, uploadBuffer, getReadUrl } from '../services/s3';
import { putSession } from '../services/dynamo';

export const tryonRouter = Router();

// Step 1: Zone detection — fast, returns which model will be used
tryonRouter.post('/tryon/prepare', async (req: Request, res: Response) => {
  const { selfieS3Key, productImageUrl, retry } = req.body;

  if (!selfieS3Key || !productImageUrl) {
    res.status(400).json({ error: 'selfieS3Key and productImageUrl are required' });
    return;
  }

  try {
    const selfieBuffer = await downloadToBuffer(selfieS3Key);
    const selfieBase64 = selfieBuffer.toString('base64');

    console.log(`🎭 [Prepare] Zone detection for device=${req.deviceId.substring(0,12)}...`);
    const { usePhotoshoot } = await prepareTryOn(selfieBase64, productImageUrl);

    const finalUsePhotoshoot = retry ? true : usePhotoshoot;
    console.log(`🎭 [Prepare] result→usePhotoshoot=${usePhotoshoot}, retry=${!!retry}, final→${finalUsePhotoshoot ? 'PRO' : 'FLASH'}`);

    res.json({
      usePhotoshoot: finalUsePhotoshoot,
      model: finalUsePhotoshoot ? 'pro' : 'flash',
      estimatedDuration: finalUsePhotoshoot ? 35000 : 12000,
    });
  } catch (err: any) {
    console.error('Prepare error:', err);
    res.status(500).json({ error: err.message || 'Prepare failed' });
  }
});

// Step 2: Generate — actual image generation + S3 upload + DynamoDB save
tryonRouter.post('/tryon/generate', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { selfieS3Key, productImageUrl, sourceUrl, usePhotoshoot } = req.body;

  if (!selfieS3Key || !productImageUrl) {
    res.status(400).json({ error: 'selfieS3Key and productImageUrl are required' });
    return;
  }

  try {
    // Download both images (no zone detection — already done in /prepare)
    const selfieBuffer = await downloadToBuffer(selfieS3Key);
    const selfieBase64 = selfieBuffer.toString('base64');
    const productBase64 = await downloadImageToBase64(productImageUrl);

    console.log(`🎨 [Generate] model=${usePhotoshoot ? 'PRO' : 'FLASH'} for device=${req.deviceId.substring(0,12)}...`);
    const resultBase64 = await generateTryOn(selfieBase64, productBase64, !!usePhotoshoot);

    // Upload result to S3
    const sessionId = `ses_${Date.now()}`;
    const tryonS3Key = `${req.deviceId}/tryons/${sessionId}.png`;
    const resultBuffer = Buffer.from(resultBase64, 'base64');
    await uploadBuffer(tryonS3Key, resultBuffer, 'image/png');

    const tryonImageUrl = await getReadUrl(tryonS3Key);

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

    const durationMs = Date.now() - startTime;
    res.json({
      sessionId,
      tryonImageUrl,
      tryonS3Key,
      model: usePhotoshoot ? 'pro' : 'flash',
      durationMs,
    });
  } catch (err: any) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message || 'Try-on generation failed' });
  }
});
