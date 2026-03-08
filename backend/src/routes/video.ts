import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { startVideoGeneration, getVideoJob } from '../services/gemini';
import { downloadToBuffer, uploadBuffer, getReadUrl } from '../services/s3';
import { getSession, updateSessionVideo } from '../services/dynamo';

export const videoRouter = Router();

videoRouter.post('/video', async (req: Request, res: Response) => {
  const { sessionId, tryonS3Key } = req.body;

  if (!tryonS3Key) {
    res.status(400).json({ error: 'tryonS3Key is required' });
    return;
  }

  const tag = `[${req.deviceId}]`;

  try {
    const tryonBuffer = await downloadToBuffer(tryonS3Key);
    const tryonBase64 = tryonBuffer.toString('base64');

    const jobId = uuid();
    console.log(`${tag} Video → job=${jobId} started`);

    startVideoGeneration(
      jobId,
      tryonBase64,
      'outfit',
      async (videoBuffer: Buffer) => {
        const videoS3Key = `${req.deviceId}/videos/${jobId}.mp4`;
        await uploadBuffer(videoS3Key, videoBuffer, 'video/mp4');
        const videoReadUrl = await getReadUrl(videoS3Key);

        if (sessionId) {
          try {
            await updateSessionVideo(req.deviceId, sessionId, videoS3Key, videoS3Key);
          } catch (e) {
            console.error(`${tag} Video → failed to update session:`, (e as any).message);
          }
        }

        console.log(`${tag} Video → job=${jobId} complete`);
        return { s3Key: videoS3Key, cdnUrl: videoReadUrl };
      }
    );

    res.json({ jobId });
  } catch (err: any) {
    console.error(`${tag} Video ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to start video generation' });
  }
});

videoRouter.get('/video/:jobId', async (req: Request, res: Response) => {
  const job = getVideoJob(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json({
    status: job.status,
    videoUrl: job.videoUrl,
    error: job.error,
  });
});
