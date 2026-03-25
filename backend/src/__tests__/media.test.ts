import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup';
import { getAuth } from '@clerk/express';
import * as s3 from '../services/s3';

const mockGetAuth = vi.mocked(getAuth);

describe('Media routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockReturnValue({ userId: 'user_media1' } as any);
    app = createTestApp();
  });

  // ── POST /api/upload-url ──────────────────────────────────────

  describe('POST /api/upload-url', () => {
    it('returns presigned upload URL for selfie type', async () => {
      const res = await request(app)
        .post('/api/upload-url')
        .send({ type: 'selfie', contentType: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('uploadUrl', 'https://s3.test/presigned-upload-url');
      expect(res.body).toHaveProperty('s3Key');
      expect(res.body.s3Key).toContain('user_media1/selfies/');
      expect(res.body.s3Key).toMatch(/\.jpg$/);
      expect(res.body).toHaveProperty('expiresIn', 300);
    });

    it('generates .png extension for image/png content type', async () => {
      const res = await request(app)
        .post('/api/upload-url')
        .send({ type: 'selfie', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.s3Key).toMatch(/\.png$/);
    });

    it('defaults to image/jpeg when contentType is not provided', async () => {
      const res = await request(app)
        .post('/api/upload-url')
        .send({ type: 'selfie' });

      expect(res.status).toBe(200);
      expect(res.body.s3Key).toMatch(/\.jpg$/);
    });

    it('returns 400 when type is missing', async () => {
      const res = await request(app)
        .post('/api/upload-url')
        .send({ contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type must be one of');
    });

    it('returns 400 when type is invalid', async () => {
      const res = await request(app)
        .post('/api/upload-url')
        .send({ type: 'video', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type must be one of');
    });

    it('returns 400 for disallowed content type (XSS prevention)', async () => {
      const res = await request(app)
        .post('/api/upload-url')
        .send({ type: 'selfie', contentType: 'text/html' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('contentType must be image/jpeg or image/png');
    });

    it('returns 500 when S3 presign fails', async () => {
      vi.mocked(s3.getPresignedUploadUrl).mockRejectedValueOnce(
        new Error('S3 error')
      );

      const res = await request(app)
        .post('/api/upload-url')
        .send({ type: 'selfie', contentType: 'image/jpeg' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to generate upload URL');
    });
  });

  // ── POST /api/log ─────────────────────────────────────────────

  describe('POST /api/log', () => {
    it('accepts log entries and returns ok', async () => {
      const res = await request(app)
        .post('/api/log')
        .send({
          logs: [
            { tag: 'TryOnScreen', msg: 'User tapped generate' },
            { tag: 'Network', msg: 'API call completed' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('returns ok even when logs is not an array', async () => {
      const res = await request(app)
        .post('/api/log')
        .send({ logs: 'not-an-array' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('returns ok for empty body', async () => {
      const res = await request(app)
        .post('/api/log')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('caps entries at 50', async () => {
      const logs = Array.from({ length: 100 }, (_, i) => ({
        tag: `tag_${i}`,
        msg: `msg_${i}`,
      }));

      const res = await request(app)
        .post('/api/log')
        .send({ logs });

      // Should succeed — just processes first 50
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
