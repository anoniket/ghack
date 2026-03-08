import { Router, Request, Response } from 'express';
import {
  queryByDevice,
  queryBySourceUrl,
  deleteSession as deleteSessionFromDb,
  deleteAllSessions as deleteAllFromDb,
  TryOnSession,
} from '../services/dynamo';
import { deleteObject, deleteObjects, deletePrefix, getReadUrl } from '../services/s3';

export const historyRouter = Router();

historyRouter.get('/history', async (req: Request, res: Response) => {
  const tag = `[${req.deviceId}]`;
  try {
    const sessions = await queryByDevice(req.deviceId);
    console.log(`${tag} History → fetched ${sessions.length} sessions`);
    const items = await Promise.all(sessions.map(async (s) => ({
      sessionId: s.sessionId,
      sourceUrl: s.sourceUrl,
      tryonImageUrl: s.tryonS3Key ? await getReadUrl(s.tryonS3Key) : s.tryonCdnUrl,
      videoUrl: s.videoS3Key ? await getReadUrl(s.videoS3Key) : s.videoCdnUrl,
      model: s.model,
      createdAt: s.createdAt,
    })));
    res.json({ items });
  } catch (err: any) {
    console.error(`[${req.deviceId}] History ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch history' });
  }
});

historyRouter.delete('/history', async (req: Request, res: Response) => {
  const tag = `[${req.deviceId}]`;
  try {
    console.log(`${tag} DeleteAll → starting`);

    // Step 1: fetch the session list (need the S3 keys before we can delete anything)
    const sessions = await queryByDevice(req.deviceId);
    if (sessions.length === 0) {
      res.json({ ok: true, deleted: 0 });
      return;
    }

    const allKeys = sessions.flatMap((s: TryOnSession) =>
      [s.tryonS3Key, s.videoS3Key].filter(Boolean) as string[]
    );

    // Step 2: DynamoDB batch-delete + S3 bulk-delete + selfie prefix delete run concurrently
    const [failedS3Keys] = await Promise.all([
      deleteObjects(allKeys),                        // tryons + videos
      deleteAllFromDb(req.deviceId),                 // DynamoDB rows
      deletePrefix(`${req.deviceId}/selfies/`),      // selfie images
    ]);

    if (failedS3Keys.length > 0) {
      console.warn(`${tag} DeleteAll → ${failedS3Keys.length} S3 keys failed to delete:`, failedS3Keys);
    }

    console.log(
      `${tag} DeleteAll → done. sessions=${sessions.length} s3Keys=${allKeys.length} s3Errors=${failedS3Keys.length}`
    );
    res.json({ ok: true, deleted: sessions.length });
  } catch (err: any) {
    console.error(`[${req.deviceId}] DeleteAll ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to delete all sessions' });
  }
});

historyRouter.delete('/history/:id', async (req: Request, res: Response) => {
  const tag = `[${req.deviceId}]`;
  try {
    console.log(`${tag} Delete → session=${req.params.id}`);
    const session = await deleteSessionFromDb(req.deviceId, req.params.id as string);
    if (!session) {
      console.log(`${tag} Delete → session not found`);
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Clean up S3 objects
    const keysToDelete = [session.tryonS3Key, session.videoS3Key].filter(Boolean) as string[];
    for (const key of keysToDelete) {
      try {
        await deleteObject(key);
      } catch {
        // Non-critical — object may already be deleted
      }
    }
    console.log(`${tag} Delete → done, cleaned ${keysToDelete.length} S3 objects`);

    res.json({ ok: true });
  } catch (err: any) {
    console.error(`[${req.deviceId}] Delete ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to delete session' });
  }
});

historyRouter.get('/product-tryon', async (req: Request, res: Response) => {
  const sourceUrl = req.query.sourceUrl as string;
  if (!sourceUrl) {
    res.status(400).json({ error: 'sourceUrl query parameter is required' });
    return;
  }

  const tag = `[${req.deviceId}]`;
  try {
    const session = await queryBySourceUrl(req.deviceId, sourceUrl);
    console.log(`${tag} ProductTryOn → query sourceUrl=${sourceUrl}`);
    console.log(`${tag} ProductTryOn → ${session ? 'found session=' + session.sessionId : 'not found'}`);
    if (session) {
      res.json({
        found: true,
        tryonImageUrl: session.tryonS3Key ? await getReadUrl(session.tryonS3Key) : session.tryonCdnUrl,
        videoUrl: session.videoS3Key ? await getReadUrl(session.videoS3Key) : session.videoCdnUrl,
        sessionId: session.sessionId,
        tryonS3Key: session.tryonS3Key,
      });
    } else {
      res.json({ found: false });
    }
  } catch (err: any) {
    console.error(`[${req.deviceId}] ProductTryOn ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to check product try-on' });
  }
});
