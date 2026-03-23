import { Request, Response, NextFunction } from 'express';
import { getAuth, clerkMiddleware } from '@clerk/express';
import { config } from '../config';

declare global {
  namespace Express {
    interface Request {
      userId: string;      // Clerk userId
      deviceId?: string;   // Logging/debugging only
    }
  }
}

const DEVICE_ID_REGEX = /^[a-zA-Z0-9_\-]{5,128}$/;

/**
 * Clerk middleware — attaches auth state to req.auth (non-blocking).
 */
export const clerkAuth = clerkMiddleware();

/**
 * Auth middleware — reads Clerk auth and sets req.userId.
 * Rejects unauthenticated requests with 401.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Extract deviceId for logging (optional header)
  const rawDeviceId = req.headers['x-device-id'] as string | undefined;
  if (rawDeviceId && DEVICE_ID_REGEX.test(rawDeviceId)) {
    req.deviceId = rawDeviceId;
  }

  try {
    const auth = getAuth(req);
    if (auth && auth.userId) {
      req.userId = auth.userId;
      return next();
    }
  } catch {
    // Clerk auth not available
  }

  res.status(401).json({ error: 'Unauthorized' });
}
