import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getPresignedUploadUrl } from '../services/s3';

export const mediaRouter = Router();

// Remote logging endpoint — receives logs from the mobile app
mediaRouter.post('/log', (req: Request, res: Response) => {
  try {
    const { logs } = req.body;
    if (!Array.isArray(logs)) { res.json({ ok: true }); return; }
    const entries = logs.slice(0, 50); // H13: Cap at 50 entries
    for (const entry of entries) {
      const tag = typeof entry.tag === 'string' ? entry.tag.slice(0, 50) : '';
      const msg = typeof entry.msg === 'string' ? entry.msg.slice(0, 500) : '';
      console.log(`[${req.userId}] [CLIENT] ${tag} ${msg}`);
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

mediaRouter.post('/upload-url', async (req: Request, res: Response) => {
  const { type, contentType } = req.body;

  const validTypes = ['selfie'];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ error: 'type must be one of: ' + validTypes.join(', ') });
    return;
  }

  // SEC-10: Allowlist content types to prevent stored XSS via S3
  const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png'];
  const ct = contentType || 'image/jpeg';
  if (!ALLOWED_CONTENT_TYPES.includes(ct)) {
    res.status(400).json({ error: 'contentType must be image/jpeg or image/png' });
    return;
  }
  const ext = ct === 'image/png' ? 'png' : 'jpg';
  const s3Key = `${req.userId}/selfies/${uuid()}.${ext}`;

  try {
    const uploadUrl = await getPresignedUploadUrl(s3Key, ct, 300);
    console.log(`[${req.userId}] UploadURL → generated for ${s3Key}`);
    res.json({ uploadUrl, s3Key, expiresIn: 300 });
  } catch (err: any) {
    console.error(`[${req.userId}] UploadURL ERROR:`, err.message);
    // SEC-7: Generic error to client, details logged server-side only
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});
