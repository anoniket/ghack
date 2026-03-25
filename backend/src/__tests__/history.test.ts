import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup';
import { getAuth } from '@clerk/express';
import * as dynamo from '../services/dynamo';
import * as s3 from '../services/s3';

const mockGetAuth = vi.mocked(getAuth);

describe('History routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockReturnValue({ userId: 'user_hist1' } as any);
    app = createTestApp();
  });

  // ── GET /api/history ──────────────────────────────────────────

  describe('GET /api/history', () => {
    it('returns empty items array when no sessions exist', async () => {
      vi.mocked(dynamo.queryByDevice).mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/history');

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    });

    it('returns formatted session items with signed URLs', async () => {
      vi.mocked(dynamo.queryByDevice).mockResolvedValueOnce([
        {
          deviceId: 'user_hist1',
          sessionId: 'ses_1',
          sourceUrl: 'https://example.com/product.jpg',
          tryonS3Key: 'user_hist1/tryons/ses_1.jpg',
          tryonCdnUrl: 'https://cdn/ses_1.jpg',
          model: 'v2',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ]);

      const res = await request(app)
        .get('/api/history');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toEqual({
        sessionId: 'ses_1',
        sourceUrl: 'https://example.com/product.jpg',
        tryonImageUrl: 'https://cdn.test/signed/user_hist1/tryons/ses_1.jpg',
        videoUrl: undefined,
        model: 'v2',
        createdAt: '2025-01-01T00:00:00Z',
      });
    });

    it('uses getReadUrl for video when videoS3Key is present', async () => {
      vi.mocked(dynamo.queryByDevice).mockResolvedValueOnce([
        {
          deviceId: 'user_hist1',
          sessionId: 'ses_2',
          tryonS3Key: 'user_hist1/tryons/ses_2.jpg',
          tryonCdnUrl: 'https://cdn/ses_2.jpg',
          videoS3Key: 'user_hist1/videos/job_2.mp4',
          model: 'v2',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ]);

      const res = await request(app)
        .get('/api/history');

      expect(res.status).toBe(200);
      expect(res.body.items[0].videoUrl).toBe(
        'https://cdn.test/signed/user_hist1/videos/job_2.mp4'
      );
    });

    it('returns 500 when DynamoDB query fails', async () => {
      vi.mocked(dynamo.queryByDevice).mockRejectedValueOnce(
        new Error('DynamoDB unavailable')
      );

      const res = await request(app)
        .get('/api/history');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch history');
    });
  });

  // ── DELETE /api/history/:id ───────────────────────────────────

  describe('DELETE /api/history/:id', () => {
    it('deletes a session and returns ok', async () => {
      vi.mocked(dynamo.deleteSession).mockResolvedValueOnce({
        deviceId: 'user_hist1',
        sessionId: 'ses_del1',
        tryonS3Key: 'user_hist1/tryons/ses_del1.jpg',
        tryonCdnUrl: 'https://cdn/ses_del1.jpg',
        model: 'v2',
        createdAt: '2025-01-01T00:00:00Z',
      });

      const res = await request(app)
        .delete('/api/history/ses_del1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('cleans up S3 objects for deleted session', async () => {
      vi.mocked(dynamo.deleteSession).mockResolvedValueOnce({
        deviceId: 'user_hist1',
        sessionId: 'ses_del2',
        tryonS3Key: 'user_hist1/tryons/ses_del2.jpg',
        videoS3Key: 'user_hist1/videos/ses_del2.mp4',
        tryonCdnUrl: 'https://cdn/ses_del2.jpg',
        model: 'v2',
        createdAt: '2025-01-01T00:00:00Z',
      });

      await request(app)
        .delete('/api/history/ses_del2');

      expect(s3.deleteObject).toHaveBeenCalledTimes(2);
      expect(s3.deleteObject).toHaveBeenCalledWith('user_hist1/tryons/ses_del2.jpg');
      expect(s3.deleteObject).toHaveBeenCalledWith('user_hist1/videos/ses_del2.mp4');
    });

    it('returns 404 when session does not exist', async () => {
      vi.mocked(dynamo.deleteSession).mockResolvedValueOnce(null);

      const res = await request(app)
        .delete('/api/history/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });

    it('returns 500 when DynamoDB delete fails', async () => {
      vi.mocked(dynamo.deleteSession).mockRejectedValueOnce(
        new Error('DynamoDB error')
      );

      const res = await request(app)
        .delete('/api/history/ses_err');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to delete session');
    });
  });

  // ── DELETE /api/history (delete all) ──────────────────────────

  describe('DELETE /api/history', () => {
    it('returns ok with deleted: 0 when no sessions exist', async () => {
      vi.mocked(dynamo.queryByDevice).mockResolvedValueOnce([]);

      const res = await request(app)
        .delete('/api/history');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, deleted: 0 });
    });

    it('deletes all sessions and S3 objects', async () => {
      vi.mocked(dynamo.queryByDevice).mockResolvedValueOnce([
        {
          deviceId: 'user_hist1',
          sessionId: 'ses_a',
          tryonS3Key: 'user_hist1/tryons/ses_a.jpg',
          tryonCdnUrl: 'cdn/a',
          model: 'v2',
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          deviceId: 'user_hist1',
          sessionId: 'ses_b',
          tryonS3Key: 'user_hist1/tryons/ses_b.jpg',
          videoS3Key: 'user_hist1/videos/ses_b.mp4',
          tryonCdnUrl: 'cdn/b',
          model: 'v2',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ]);

      const res = await request(app)
        .delete('/api/history');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, deleted: 2 });
      expect(dynamo.deleteAllSessions).toHaveBeenCalledWith('user_hist1');
      expect(s3.deleteObjects).toHaveBeenCalledWith([
        'user_hist1/tryons/ses_a.jpg',
        'user_hist1/tryons/ses_b.jpg',
        'user_hist1/videos/ses_b.mp4',
      ]);
    });

    it('returns 500 when delete-all fails', async () => {
      vi.mocked(dynamo.queryByDevice).mockRejectedValueOnce(
        new Error('DynamoDB error')
      );

      const res = await request(app)
        .delete('/api/history');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to delete all sessions');
    });
  });

  // ── GET /api/product-tryon ────────────────────────────────────

  describe('GET /api/product-tryon', () => {
    it('returns found: false when no existing try-on', async () => {
      vi.mocked(dynamo.queryBySourceUrl).mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/product-tryon?sourceUrl=https://example.com/product.jpg');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ found: false });
    });

    it('returns existing try-on when found', async () => {
      vi.mocked(dynamo.queryBySourceUrl).mockResolvedValueOnce({
        deviceId: 'user_hist1',
        sessionId: 'ses_found',
        sourceUrl: 'https://example.com/product.jpg',
        tryonS3Key: 'user_hist1/tryons/ses_found.jpg',
        tryonCdnUrl: 'cdn/found',
        model: 'v2',
        createdAt: '2025-01-01T00:00:00Z',
      });

      const res = await request(app)
        .get('/api/product-tryon?sourceUrl=https://example.com/product.jpg');

      expect(res.status).toBe(200);
      expect(res.body.found).toBe(true);
      expect(res.body.sessionId).toBe('ses_found');
      expect(res.body.tryonImageUrl).toBeTruthy();
    });

    it('returns 400 when sourceUrl query param is missing', async () => {
      const res = await request(app)
        .get('/api/product-tryon');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('sourceUrl');
    });
  });
});
