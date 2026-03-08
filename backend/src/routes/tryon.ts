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

  const tag = `[${req.deviceId}]`;

  try {
    const selfieBuffer = await downloadToBuffer(selfieS3Key);
    const selfieBase64 = selfieBuffer.toString('base64');

    console.log(`${tag} Prepare → zone detection started`);
    const { usePhotoshoot } = await prepareTryOn(selfieBase64, productImageUrl);

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

// Step 2: Generate — actual image generation + S3 upload + DynamoDB save
tryonRouter.post('/tryon/generate', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { selfieS3Key, productImageUrl, sourceUrl, usePhotoshoot } = req.body;

  if (!selfieS3Key || !productImageUrl) {
    res.status(400).json({ error: 'selfieS3Key and productImageUrl are required' });
    return;
  }

  const tag = `[${req.deviceId}]`;

  try {
    const selfieBuffer = await downloadToBuffer(selfieS3Key);
    const selfieBase64 = selfieBuffer.toString('base64');
    const productBase64 = await downloadImageToBase64(productImageUrl);

    console.log(`${tag} Generate → ${usePhotoshoot ? 'PRO' : 'FLASH'} started`);
    const resultBase64 = await generateTryOn(selfieBase64, productBase64, !!usePhotoshoot);
    console.log(`${tag} Generate → image received, base64 length=${resultBase64.length}`);

    const sessionId = `ses_${Date.now()}`;
    const tryonS3Key = `${req.deviceId}/tryons/${sessionId}.png`;
    const resultBuffer = Buffer.from(resultBase64, 'base64');
    await uploadBuffer(tryonS3Key, resultBuffer, 'image/png');
    console.log(`${tag} Generate → uploaded to S3: ${tryonS3Key}`);

    const tryonImageUrl = await getReadUrl(tryonS3Key);
    console.log(`${tag} Generate → got read URL`);

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
    console.log(`${tag} Generate → saved to DynamoDB`);

    const durationMs = Date.now() - startTime;
    console.log(`${tag} Generate → done in ${durationMs}ms, session=${sessionId}`);
    res.json({
      sessionId,
      tryonImageUrl,
      tryonS3Key,
      model: usePhotoshoot ? 'pro' : 'flash',
      durationMs,
    });
  } catch (err: any) {
    console.error(`${tag} Generate ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Try-on generation failed' });
  }
});
