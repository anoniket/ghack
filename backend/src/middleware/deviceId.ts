import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      deviceId: string;
    }
  }
}

export function deviceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const deviceId = req.headers['x-device-id'] as string;
  if (!deviceId || deviceId.length < 5) {
    res.status(400).json({ error: 'Missing or invalid x-device-id header' });
    return;
  }
  req.deviceId = deviceId;
  console.log(`→ ${req.method} ${req.path} [${deviceId.substring(0, 12)}...]`);
  next();
}
