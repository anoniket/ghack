import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup';
import { getAuth } from '@clerk/express';

const mockGetAuth = vi.mocked(getAuth);

describe('Auth & Middleware', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('Clerk auth middleware', () => {
    it('allows authenticated Clerk requests', async () => {
      mockGetAuth.mockReturnValue({ userId: 'user_clerk123' } as any);

      const res = await request(app)
        .get('/api/history')
        .set('Authorization', 'Bearer test-token');

      // Should not be 401 — auth succeeded
      expect(res.status).not.toBe(401);
    });

    it('blocks unauthenticated requests when demo mode is off', async () => {
      mockGetAuth.mockReturnValue({ userId: null } as any);

      const res = await request(app)
        .get('/api/history');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('blocks requests without Clerk token and no device ID', async () => {
      mockGetAuth.mockReturnValue(null as any);

      const res = await request(app)
        .get('/api/history');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('Demo mode', () => {
    it('allows requests with x-device-id header when demo mode is on', async () => {
      // Enable demo mode
      const config = await import('../config');
      const originalDemoMode = config.config.demoMode;
      (config.config as any).demoMode = true;

      mockGetAuth.mockImplementation(() => { throw new Error('no clerk'); });

      const res = await request(app)
        .get('/api/history')
        .set('x-device-id', 'device-abc-123');

      expect(res.status).not.toBe(401);

      // Restore
      (config.config as any).demoMode = originalDemoMode;
    });

    it('rejects requests without device ID even in demo mode', async () => {
      const config = await import('../config');
      const originalDemoMode = config.config.demoMode;
      (config.config as any).demoMode = true;

      mockGetAuth.mockImplementation(() => { throw new Error('no clerk'); });

      const res = await request(app)
        .get('/api/history');

      expect(res.status).toBe(401);

      (config.config as any).demoMode = originalDemoMode;
    });
  });

  describe('Device ID extraction', () => {
    it('extracts valid device ID from x-device-id header', async () => {
      mockGetAuth.mockReturnValue({ userId: 'user_123' } as any);

      // The device ID is set on req.deviceId for logging — we verify auth passes
      const res = await request(app)
        .get('/api/history')
        .set('x-device-id', 'valid-device-id-123');

      expect(res.status).not.toBe(401);
    });

    it('ignores invalid device ID format (too short)', async () => {
      const config = await import('../config');
      const originalDemoMode = config.config.demoMode;
      (config.config as any).demoMode = true;

      mockGetAuth.mockImplementation(() => { throw new Error('no clerk'); });

      // "ab" is too short (min 5 chars) — so deviceId won't be set
      // In demo mode, without a valid deviceId, request should be rejected
      const res = await request(app)
        .get('/api/history')
        .set('x-device-id', 'ab');

      expect(res.status).toBe(401);

      (config.config as any).demoMode = originalDemoMode;
    });

    it('ignores device ID with invalid characters', async () => {
      const config = await import('../config');
      const originalDemoMode = config.config.demoMode;
      (config.config as any).demoMode = true;

      mockGetAuth.mockImplementation(() => { throw new Error('no clerk'); });

      // Special characters not in the regex
      const res = await request(app)
        .get('/api/history')
        .set('x-device-id', 'dev!@#$%');

      expect(res.status).toBe(401);

      (config.config as any).demoMode = originalDemoMode;
    });
  });

  describe('Rate limiting', () => {
    it('includes rate limit headers in response', async () => {
      mockGetAuth.mockReturnValue({ userId: 'user_123' } as any);

      const res = await request(app)
        .get('/api/history');

      // standardHeaders: true adds RateLimit-* headers
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
    });
  });
});
