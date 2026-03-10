import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

declare global {
  namespace Express {
    interface Request {
      deviceId: string;
    }
  }
}

/**
 * Dual-mode authentication middleware.
 *
 * Auth is checked in this order:
 *   1. JWT — if Authorization: Bearer <token> is present, verify and extract deviceId
 *   2. HMAC — fall back to x-device-id / x-timestamp / x-signature headers
 *   3. Dev mode — if neither APP_SECRET nor JWT_SECRET is set, allow through with just x-device-id
 *
 * The HMAC path is kept for backwards compatibility with old clients during the JWT migration.
 */
export function deviceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // ── Path 1: JWT authentication ────────────────────────────────────────
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // Dev mode: skip JWT verification, but still require x-device-id
    if (!config.jwtSecret) {
      const deviceId = req.headers['x-device-id'] as string;
      if (!deviceId || deviceId.length < 5) {
        res.status(400).json({ error: 'Missing or invalid x-device-id header' });
        return;
      }
      req.deviceId = deviceId;
      next();
      return;
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      req.deviceId = payload.sub as string;
      next();
      return;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        // Tell client to refresh — distinct code so the app can handle it
        res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        return;
      }
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  }

  // ── Path 2: HMAC authentication (legacy / migration) ─────────────────
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
  next();
}
