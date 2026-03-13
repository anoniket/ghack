import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

const router = Router();

// Stricter rate limit for registration — 10 per 15 min per IP
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts, try again later' },
});

// Rate limit for refresh — 20 per 15 min per IP
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts, try again later' },
});

const TOKEN_EXPIRY = '1d';       // M6: 1-day token lifetime (was 7d)
const TOKEN_EXPIRY_SEC = 86400;  // 1 day in seconds
const REFRESH_GRACE_SEC = 86400; // 24-hour grace window for expired tokens

/**
 * Verify HMAC signature (same logic as deviceId middleware).
 * Returns the deviceId if valid, or null + sends error response.
 */
// SEC-2: Strict deviceId format — alphanumeric + underscore + hyphen, 5-128 chars
const DEVICE_ID_REGEX = /^[a-zA-Z0-9_\-]{5,128}$/;

function verifyHmac(req: Request, res: Response): string | null {
  const deviceId = req.headers['x-device-id'] as string;
  if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
    res.status(400).json({ error: 'Missing or invalid x-device-id header' });
    return null;
  }

  // In dev mode (no APP_SECRET), skip HMAC — just return deviceId
  if (!config.appSecret) {
    return deviceId;
  }

  const timestamp = req.headers['x-timestamp'] as string;
  const signature = req.headers['x-signature'] as string;

  if (!timestamp || !signature) {
    res.status(401).json({ error: 'Missing authentication headers' });
    return null;
  }

  // Reject requests older than 5 minutes
  const ts = parseInt(timestamp, 10);
  const age = Math.abs(Date.now() - ts);
  if (isNaN(ts) || age > 5 * 60 * 1000) {
    res.status(401).json({ error: 'Request expired' });
    return null;
  }

  // Verify keyed hash
  const fullPath = req.baseUrl + req.path;
  const payload = `${config.appSecret}.${deviceId}.${timestamp}.${fullPath}`;
  const expected = crypto.createHash('sha256').update(payload).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    res.status(401).json({ error: 'Invalid signature' });
    return null;
  }

  return deviceId;
}

/**
 * POST /api/auth/register
 *
 * HMAC-signed one-time call to obtain a JWT.
 * Client sends the same x-device-id / x-timestamp / x-signature headers
 * used for regular API calls. Returns a 7-day JWT.
 */
router.post('/register', registrationLimiter, (req: Request, res: Response): void => {
  const deviceId = verifyHmac(req, res);
  if (!deviceId) return; // response already sent

  // Dev mode: if JWT_SECRET is not set, warn and return a dummy token
  if (!config.jwtSecret) {
    res.json({ token: 'dev-mode-no-jwt-secret', expiresIn: TOKEN_EXPIRY_SEC });
    return;
  }

  const token = jwt.sign({ sub: deviceId }, config.jwtSecret, { algorithm: 'HS256', expiresIn: TOKEN_EXPIRY });
  res.json({ token, expiresIn: TOKEN_EXPIRY_SEC });
});

/**
 * POST /api/auth/refresh
 *
 * Exchange a valid (or recently-expired) JWT for a fresh 7-day JWT.
 * No HMAC required — the JWT itself is proof of prior authentication.
 * Allows refresh up to 24 hours after token expiry (grace window).
 */
router.post('/refresh', refreshLimiter, (req: Request, res: Response): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  // Dev mode: skip JWT verification
  if (!config.jwtSecret) {
    res.json({ token: 'dev-mode-no-jwt-secret', expiresIn: TOKEN_EXPIRY_SEC });
    return;
  }

  try {
    // First try: verify normally (token is still valid)
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const newToken = jwt.sign({ sub: payload.sub }, config.jwtSecret, { algorithm: 'HS256', expiresIn: TOKEN_EXPIRY });
    res.json({ token: newToken, expiresIn: TOKEN_EXPIRY_SEC });
  } catch (err) {
    // If token is expired, check if it's within the 24h grace window
    if (err instanceof jwt.TokenExpiredError) {
      try {
        const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], ignoreExpiration: true }) as jwt.JwtPayload;

        // Check grace window: token must have expired within the last 24 hours
        const expiredAt = (payload.exp || 0) * 1000; // exp is in seconds, convert to ms
        const elapsed = Date.now() - expiredAt;
        if (elapsed > REFRESH_GRACE_SEC * 1000) {
          res.status(401).json({ error: 'Token expired beyond refresh window' });
          return;
        }

        const newToken = jwt.sign({ sub: payload.sub }, config.jwtSecret, { algorithm: 'HS256', expiresIn: TOKEN_EXPIRY });
        res.json({ token: newToken, expiresIn: TOKEN_EXPIRY_SEC });
      } catch {
        res.status(401).json({ error: 'Invalid token' });
      }
    } else {
      res.status(401).json({ error: 'Invalid token' });
    }
  }
});

export const authRouter = router;
