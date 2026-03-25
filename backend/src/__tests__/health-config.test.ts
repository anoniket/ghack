import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup';

describe('Health & Config endpoints', () => {
  const app = createTestApp();

  describe('GET /health', () => {
    it('returns status ok with gemini concurrency info', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        gemini: { active: 0, queued: 0, max: 10 },
      });
    });

    it('does not require authentication', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/config', () => {
    it('returns demoMode flag without requiring auth', async () => {
      // /api/config is mounted BEFORE the auth middleware in both
      // the real app and the test app, so no auth is required
      const res = await request(app).get('/api/config');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('demoMode');
      expect(typeof res.body.demoMode).toBe('boolean');
    });
  });
});
