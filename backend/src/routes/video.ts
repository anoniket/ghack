import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { startVideoGeneration, getVideoJob } from '../services/gemini';
import { downloadToBuffer, uploadBuffer, getReadUrl } from '../services/s3';
import { updateSessionVideo } from '../services/dynamo';
import { trackEvent } from '../services/analytics';

export const videoRouter = Router();

videoRouter.post('/video', async (req: Request, res: Response) => {
  const { sessionId, tryonS3Key } = req.body;

  if (!tryonS3Key) {
    res.status(400).json({ error: 'tryonS3Key is required' });
    return;
  }

  // SEC-1: Validate S3 key belongs to this device (prevent IDOR)
  if (!tryonS3Key.startsWith(`${req.userId}/`)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const tag = `[${req.userId}]`;

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
    const videoStartTime = Date.now();
    console.log(`${tag} Video → job=${jobId} started`);

    trackEvent(req.userId, 'api_video_started', { job_id: jobId });

    // Fire and forget — but catch errors so they don't become unhandled rejections
    startVideoGeneration(
      jobId,
      tryonBase64,
      'outfit',
      async (videoBuffer: Buffer) => {
        try {
          const videoS3Key = `${req.userId}/videos/${jobId}.mp4`;
          await uploadBuffer(videoS3Key, videoBuffer, 'video/mp4');
          const videoReadUrl = await getReadUrl(videoS3Key);

          if (sessionId) {
            try {
              await updateSessionVideo(req.userId, sessionId, videoS3Key, videoS3Key);
            } catch (e) {
              console.error(`${tag} Video → job=${jobId} failed to update session: ${(e as any).message}`);
            }
          }

          console.log(`${tag} Video → job=${jobId} uploaded to S3`);
          trackEvent(req.userId, 'api_video_completed', { job_id: jobId, duration_ms: Date.now() - videoStartTime });
          return { s3Key: videoS3Key, cdnUrl: videoReadUrl };
        } catch (uploadErr: any) {
          console.error(`${tag} Video → job=${jobId} S3 upload FAILED: ${uploadErr.message}`);
          throw uploadErr;
        }
      },
      tag,
      req.userId
    ).catch((err) => {
      // This catches any unhandled rejection from the async fire-and-forget
      console.error(`${tag} Video → job=${jobId} unhandled error: ${err.message}`);
      trackEvent(req.userId, 'api_video_failed', { job_id: jobId, error_type: 'GENERATION_FAILED', duration_ms: Date.now() - videoStartTime });
    });

    res.json({ jobId });
  } catch (err: any) {
    console.error(`${tag} Video ERROR:`, err.message);
    trackEvent(req.userId, 'api_video_failed', { error_type: 'START_FAILED' });
    // SEC-7: Generic error to client, details logged server-side only
    res.status(500).json({ error: 'Failed to start video generation' });
  }
});

videoRouter.get('/video/:jobId', async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = getVideoJob(jobId);
  if (!job) {
    console.log(`[${req.userId}] Video → poll job=${jobId} not found`);
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  // SEC-9: Verify user owns this job
  if (job.userId && job.userId !== req.userId) {
    console.log(`[${req.userId}] Video → poll job=${jobId} access denied (owner=${job.userId})`);
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (job.status === 'failed') {
    console.log(`[${req.userId}] Video → poll job=${jobId} status=failed error=${job.error}`);
  }

  res.json({
    status: job.status,
    videoUrl: job.videoUrl,
    error: job.error,
  });
});
