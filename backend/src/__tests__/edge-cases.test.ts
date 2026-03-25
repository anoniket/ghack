import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup';
import { getAuth } from '@clerk/express';

const mockGetAuth = vi.mocked(getAuth);

describe('Edge cases', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockReturnValue({ userId: 'user_edge1' } as any);
    app = createTestApp();
  });

  describe('Invalid JSON body', () => {
    it('returns 400 for malformed JSON on protected routes', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
    });
  });

  describe('Oversized payloads', () => {
    it('rejects oversized body on default routes (1MB limit)', async () => {
      // 2MB payload — exceeds the default 1MB limit
      const largeBody = JSON.stringify({ message: 'x'.repeat(2 * 1024 * 1024) });

      const res = await request(app)
        .post('/api/chat')
        .set('Content-Type', 'application/json')
        .send(largeBody);

      expect(res.status).toBe(413);
    });

    it('accepts larger body on tryon route (50MB limit)', async () => {
      // 2MB payload — within the 50MB limit for /api/tryon
      const res = await request(app)
        .post('/api/tryon/v2')
        .send({
          productImageUrl: 'https://example.com/product.jpg',
          selfieBase64: 'x'.repeat(2 * 1024 * 1024),
        });

      // Should not be 413 — the body limit is 50MB
      expect(res.status).not.toBe(413);
    });
  });

  describe('Missing required fields', () => {
    it('POST /api/tryon/v2 — missing all fields', async () => {
      const res = await request(app)
        .post('/api/tryon/v2')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/video — empty body', async () => {
      const res = await request(app)
        .post('/api/video')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tryonS3Key is required');
    });

    it('POST /api/chat — empty body', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });

    it('POST /api/upload-url — empty body', async () => {
      const res = await request(app)
        .post('/api/upload-url')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type must be one of');
    });
  });

  describe('Error response format consistency', () => {
    it('all error responses contain an error field', async () => {
      const errorResponses = await Promise.all([
        request(app).post('/api/tryon/v2').send({}),
        request(app).post('/api/video').send({}),
        request(app).post('/api/chat').send({}),
        request(app).post('/api/upload-url').send({}),
        request(app).get('/api/product-tryon'),
        request(app).post('/api/tryon/selfie-cache').send({ selfieBase64s: 'not-array' }),
        request(app).post('/api/selfie-describe').send({}),
      ]);

      for (const res of errorResponses) {
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body).toHaveProperty('error');
        expect(typeof res.body.error).toBe('string');
        expect(res.body.error.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Non-existent routes', () => {
    it('returns 404 for unknown API routes', async () => {
      const res = await request(app)
        .get('/api/nonexistent-route');

      // Express returns 404 for unmatched routes
      expect(res.status).toBe(404);
    });
  });

  describe('Concurrent requests', () => {
    it('handles multiple simultaneous requests without errors', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/chat')
          .send({ message: `Concurrent message ${i}` })
      );

      const responses = await Promise.all(requests);

      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('text');
      }
    });

    it('handles mixed endpoint concurrent requests', async () => {
      const [chatRes, historyRes, cacheRes] = await Promise.all([
        request(app).post('/api/chat').send({ message: 'Hello' }),
        request(app).get('/api/history'),
        request(app).get('/api/tryon/selfie-cache/status'),
      ]);

      expect(chatRes.status).toBe(200);
      expect(historyRes.status).toBe(200);
      expect(cacheRes.status).toBe(200);
    });
  });

  describe('HTTP method validation', () => {
    it('returns 404 for GET on POST-only routes', async () => {
      const res = await request(app).get('/api/tryon/v2');
      // Express returns 404 for method mismatch when no GET handler exists
      expect(res.status).toBeOneOf([404, 405]);
    });

    it('returns 404 for POST on GET-only routes', async () => {
      const res = await request(app).post('/api/history').send({});
      // DELETE is defined but POST is not
      expect(res.status).toBeOneOf([404, 405]);
    });
  });
});
