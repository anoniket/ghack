import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { startVideoGeneration, getVideoJob } from '../services/gemini';
import { downloadToBuffer, uploadBuffer, getReadUrl } from '../services/s3';
import { updateSessionVideo } from '../services/dynamo';

export const videoRouter = Router();

videoRouter.post('/video', async (req: Request, res: Response) => {
  const { sessionId, tryonS3Key } = req.body;

  if (!tryonS3Key) {
    res.status(400).json({ error: 'tryonS3Key is required' });
    return;
  }

  // SEC-1: Validate S3 key belongs to this device (prevent IDOR)
  if (!tryonS3Key.startsWith(`${req.deviceId}/`)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const tag = `[${req.deviceId}]`;

  try {
    // ERR-17: S3 upload from try-on is fire-and-forget — object may not exist yet.
    // Retry up to 3 times with 1s backoff before giving up.
    let tryonBuffer: Buffer | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        tryonBuffer = await downloadToBuffer(tryonS3Key);
        break;
      } catch (dlErr: any) {
        if (attempt < 2 && (dlErr.name === 'NoSuchKey' || dlErr.Code === 'NoSuchKey')) {
          console.log(`${tag} Video → S3 not ready, retry ${attempt + 1}/3`);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        } else {
          throw dlErr;
        }
      }
    }
    if (!tryonBuffer) throw new Error('Try-on image not found in S3');
    const tryonBase64 = tryonBuffer.toString('base64');

    const jobId = uuid();
    console.log(`${tag} Video → job=${jobId} started`);

    // Fire and forget — but catch errors so they don't become unhandled rejections
    startVideoGeneration(
      jobId,
      tryonBase64,
      'outfit',
      async (videoBuffer: Buffer) => {
        try {
          const videoS3Key = `${req.deviceId}/videos/${jobId}.mp4`;
          await uploadBuffer(videoS3Key, videoBuffer, 'video/mp4');
          const videoReadUrl = await getReadUrl(videoS3Key);

          if (sessionId) {
            try {
              await updateSessionVideo(req.deviceId, sessionId, videoS3Key, videoS3Key);
            } catch (e) {
              console.error(`${tag} Video → job=${jobId} failed to update session: ${(e as any).message}`);
            }
          }

          console.log(`${tag} Video → job=${jobId} uploaded to S3`);
          return { s3Key: videoS3Key, cdnUrl: videoReadUrl };
        } catch (uploadErr: any) {
          console.error(`${tag} Video → job=${jobId} S3 upload FAILED: ${uploadErr.message}`);
          throw uploadErr;
        }
      },
      tag,
      req.deviceId
    ).catch((err) => {
      // This catches any unhandled rejection from the async fire-and-forget
      console.error(`${tag} Video → job=${jobId} unhandled error: ${err.message}`);
    });

    res.json({ jobId });
  } catch (err: any) {
    console.error(`${tag} Video ERROR:`, err.message);
    // SEC-7: Generic error to client, details logged server-side only
    res.status(500).json({ error: 'Failed to start video generation' });
  }
});

videoRouter.get('/video/:jobId', async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = getVideoJob(jobId);
  if (!job) {
    console.log(`[${req.deviceId}] Video → poll job=${jobId} not found`);
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  // SEC-9: Verify device owns this job
  if (job.deviceId && job.deviceId !== req.deviceId) {
    console.log(`[${req.deviceId}] Video → poll job=${jobId} access denied (owner=${job.deviceId})`);
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (job.status === 'failed') {
    console.log(`[${req.deviceId}] Video → poll job=${jobId} status=failed error=${job.error}`);
  }

  res.json({
    status: job.status,
    videoUrl: job.videoUrl,
    error: job.error,
  });
});
