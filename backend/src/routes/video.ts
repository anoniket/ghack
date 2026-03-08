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

  try {
    // Download the try-on image from S3
    const tryonBuffer = await downloadToBuffer(tryonS3Key);
    const tryonBase64 = tryonBuffer.toString('base64');

    const jobId = uuid();

    // Start async video generation
    startVideoGeneration(
      jobId,
      tryonBase64,
      'outfit',
      async (videoBuffer: Buffer) => {
        // Upload video to S3
        const videoS3Key = `${req.deviceId}/videos/${jobId}.mp4`;
        await uploadBuffer(videoS3Key, videoBuffer, 'video/mp4');
        const videoReadUrl = await getReadUrl(videoS3Key);

        // Update DynamoDB if we have a session
        if (sessionId) {
          try {
            await updateSessionVideo(req.deviceId, sessionId, videoS3Key, videoS3Key);
          } catch (e) {
            console.error('Failed to update session with video:', e);
          }
        }

        return { s3Key: videoS3Key, cdnUrl: videoReadUrl };
      }
    );

    res.json({ jobId });
  } catch (err: any) {
    console.error('Video start error:', err);
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
