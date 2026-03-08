import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

declare global {
  namespace Express {
    interface Request {
      deviceId: string;
    }
  }
}

/**
 * Request authentication via keyed hash.
 * Client sends:
 *   x-device-id: <deviceId>
 *   x-timestamp: <unix ms>
 *   x-signature: SHA256(APP_SECRET + "." + deviceId + "." + timestamp + "." + path)
 *
 * Server verifies signature + timestamp freshness (5 min window).
 * If APP_SECRET is not set, verification is skipped (dev mode).
 */
export function deviceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const deviceId = req.headers['x-device-id'] as string;
  if (!deviceId || deviceId.length < 5) {
    res.status(400).json({ error: 'Missing or invalid x-device-id header' });
    return;
  }

  // HMAC verification (skip if APP_SECRET not configured — dev mode)
  if (config.appSecret) {
    const timestamp = req.headers['x-timestamp'] as string;
    const signature = req.headers['x-signature'] as string;

    if (!timestamp || !signature) {
      res.status(401).json({ error: 'Missing authentication headers' });
      return;
    }

    // Reject requests older than 5 minutes (prevents replay attacks)
    const ts = parseInt(timestamp, 10);
    const age = Math.abs(Date.now() - ts);
    if (isNaN(ts) || age > 5 * 60 * 1000) {
      res.status(401).json({ error: 'Request expired' });
      return;
    }

    // Verify keyed hash: SHA256(secret + "." + deviceId + "." + timestamp + "." + path)
    // Use baseUrl + path to get full path (e.g. /api/history, not just /history)
    const fullPath = req.baseUrl + req.path;
    const payload = `${config.appSecret}.${deviceId}.${timestamp}.${fullPath}`;
    const expected = crypto
      .createHash('sha256')
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  req.deviceId = deviceId;
  console.log(`→ ${req.method} ${req.path} [${deviceId.substring(0, 12)}...]`);
  next();
}
