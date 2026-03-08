import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getPresignedUploadUrl } from '../services/s3';

export const mediaRouter = Router();

// Remote logging endpoint — receives logs from the mobile app
mediaRouter.post('/log', (req: Request, res: Response) => {
  const { logs } = req.body;
  if (Array.isArray(logs)) {
    for (const entry of logs) {
      console.log(`📱 [${req.deviceId.substring(0, 12)}] ${entry.tag || ''} ${entry.msg}`);
    }
  }
  res.json({ ok: true });
});

mediaRouter.post('/upload-url', async (req: Request, res: Response) => {
  const { type, contentType } = req.body;

  const validTypes = ['selfie'];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ error: 'type must be one of: ' + validTypes.join(', ') });
    return;
  }

  const ct = contentType || 'image/jpeg';
  const ext = ct === 'image/png' ? 'png' : 'jpg';
  const s3Key = `${req.deviceId}/selfies/${uuid()}.${ext}`;

  try {
    const uploadUrl = await getPresignedUploadUrl(s3Key, ct, 300);
    res.json({ uploadUrl, s3Key, expiresIn: 300 });
  } catch (err: any) {
    console.error('Upload URL error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate upload URL' });
  }
});
