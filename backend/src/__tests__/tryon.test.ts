import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup';
import { getAuth } from '@clerk/express';
import * as gemini from '../services/gemini';
import * as classifier from '../services/classifier';

const mockGetAuth = vi.mocked(getAuth);

describe('Try-on routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Authenticate all requests by default
    mockGetAuth.mockReturnValue({ userId: 'user_test123' } as any);
    app = createTestApp();
  });

  // ── POST /api/tryon/v2 ──────────────────────────────────────────

  describe('POST /api/tryon/v2', () => {
    const validPayload = {
      productImageUrl: 'https://example.com/product.jpg',
      selfieBase64: 'aGVsbG8=', // small base64 for "hello"
    };

    it('returns try-on result with sessionId and resultBase64', async () => {
      const res = await request(app)
        .post('/api/tryon/v2')
        .send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sessionId');
      expect(res.body).toHaveProperty('resultBase64', 'base64-result-image');
      expect(res.body).toHaveProperty('resultCdnUrl');
      expect(res.body).toHaveProperty('model', 'v2');
      expect(res.body).toHaveProperty('durationMs');
      expect(typeof res.body.durationMs).toBe('number');
    });

    it('accepts selfieBase64s array', async () => {
      const res = await request(app)
        .post('/api/tryon/v2')
        .send({
          productImageUrl: 'https://example.com/product.jpg',
          selfieBase64s: ['aGVsbG8=', 'aGVsbG8='],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('resultBase64');
    });

    it('returns 400 when productImageUrl is missing', async () => {
      const res = await request(app)
        .post('/api/tryon/v2')
        .send({ selfieBase64: 'aGVsbG8=' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('productImageUrl is required');
    });

    it('returns 400 when no selfie is provided', async () => {
      // Use a fresh userId that has no cached selfies
      mockGetAuth.mockReturnValue({ userId: 'user_no_selfie' } as any);

      const res = await request(app)
        .post('/api/tryon/v2')
        .send({ productImageUrl: 'https://example.com/product.jpg' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No selfies available');
    });

    it('returns 400 when more than 3 selfies are provided', async () => {
      // Use a fresh userId that has no cached selfies
      mockGetAuth.mockReturnValue({ userId: 'user_too_many_selfies' } as any);

      const res = await request(app)
        .post('/api/tryon/v2')
        .send({
          productImageUrl: 'https://example.com/product.jpg',
          selfieBase64s: ['a', 'b', 'c', 'd'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Maximum 3');
    });

    it('returns 400 when selfie exceeds size limit', async () => {
      // Use a fresh userId that has no cached selfies
      mockGetAuth.mockReturnValue({ userId: 'user_huge_selfie' } as any);

      // 7MB+ base64 string
      const hugeSelfie = 'x'.repeat(7 * 1024 * 1024 + 1);
      const res = await request(app)
        .post('/api/tryon/v2')
        .send({
          productImageUrl: 'https://example.com/product.jpg',
          selfieBase64: hugeSelfie,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Selfie too large');
    });

    it('returns 503 when Gemini returns 503 / high demand', async () => {
      vi.mocked(gemini.generateTryOnV2).mockRejectedValueOnce(
        new Error('503 Service Unavailable')
      );

      const res = await request(app)
        .post('/api/tryon/v2')
        .send(validPayload);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('SERVER_BUSY');
    });

    it('returns 504 on timeout', async () => {
      vi.mocked(gemini.generateTryOnV2).mockRejectedValueOnce(
        new gemini.TimeoutError('generation', 60000)
      );

      const res = await request(app)
        .post('/api/tryon/v2')
        .send(validPayload);

      expect(res.status).toBe(504);
      expect(res.body.error).toBe('TIMEOUT');
    });

    it('returns 422 when image is blocked', async () => {
      vi.mocked(gemini.generateTryOnV2).mockRejectedValueOnce(
        new gemini.ImageBlockedError('SAFETY')
      );

      const res = await request(app)
        .post('/api/tryon/v2')
        .send(validPayload);

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('IMAGE_BLOCKED');
    });

    it('returns 500 on generic internal error', async () => {
      vi.mocked(gemini.generateTryOnV2).mockRejectedValueOnce(
        new Error('Something went wrong')
      );

      const res = await request(app)
        .post('/api/tryon/v2')
        .send(validPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Try-on generation failed');
    });

    it('calls classifier and gemini with correct params', async () => {
      await request(app)
        .post('/api/tryon/v2')
        .send(validPayload);

      expect(gemini.downloadImageToBase64).toHaveBeenCalledWith(
        'https://example.com/product.jpg'
      );
      expect(classifier.classifyProduct).toHaveBeenCalledWith('base64-product-image');
      expect(classifier.getPromptForCategory).toHaveBeenCalled();
      expect(gemini.generateTryOnV2).toHaveBeenCalled();
    });
  });

  // ── POST /api/selfie-describe ──────────────────────────────────

  describe('POST /api/selfie-describe', () => {
    it('returns selfie description', async () => {
      const res = await request(app)
        .post('/api/selfie-describe')
        .send({ selfieBase64: 'aGVsbG8=' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('description');
      expect(typeof res.body.description).toBe('string');
    });

    it('returns 400 when selfieBase64 is missing', async () => {
      const res = await request(app)
        .post('/api/selfie-describe')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('selfieBase64 is required');
    });

    it('returns 500 when classifier fails', async () => {
      vi.mocked(classifier.describeSelfie).mockRejectedValueOnce(
        new Error('Gemini failed')
      );

      const res = await request(app)
        .post('/api/selfie-describe')
        .send({ selfieBase64: 'aGVsbG8=' });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── Selfie cache ──────────────────────────────────────────────

  describe('POST /api/tryon/selfie-cache', () => {
    it('caches selfie base64s', async () => {
      const res = await request(app)
        .post('/api/tryon/selfie-cache')
        .send({ selfieBase64s: ['aGVsbG8='] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ cached: true, count: 1 });
    });

    it('returns 400 when selfieBase64s is not an array', async () => {
      const res = await request(app)
        .post('/api/tryon/selfie-cache')
        .send({ selfieBase64s: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('selfieBase64s array required');
    });

    it('returns 400 when more than 3 selfies', async () => {
      const res = await request(app)
        .post('/api/tryon/selfie-cache')
        .send({ selfieBase64s: ['a', 'b', 'c', 'd'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Maximum 3');
    });

    it('clears cache when empty array is sent', async () => {
      // First cache some selfies
      await request(app)
        .post('/api/tryon/selfie-cache')
        .send({ selfieBase64s: ['aGVsbG8='] });

      // Then clear with empty array
      const res = await request(app)
        .post('/api/tryon/selfie-cache')
        .send({ selfieBase64s: [] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ cached: false, count: 0 });
    });
  });

  describe('GET /api/tryon/selfie-cache/status', () => {
    it('returns cached: false when no selfies are cached', async () => {
      // Use a unique user to ensure no cache hit
      mockGetAuth.mockReturnValue({ userId: 'user_nocache' } as any);
      app = createTestApp();

      const res = await request(app)
        .get('/api/tryon/selfie-cache/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ cached: false, count: 0 });
    });

    it('returns cached: true after selfies are cached', async () => {
      // Cache first
      await request(app)
        .post('/api/tryon/selfie-cache')
        .send({ selfieBase64s: ['aGVsbG8=', 'dGVzdA=='] });

      const res = await request(app)
        .get('/api/tryon/selfie-cache/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ cached: true, count: 2 });
    });
  });
});
