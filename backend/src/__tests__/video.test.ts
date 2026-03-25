import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup';
import { getAuth } from '@clerk/express';
import * as gemini from '../services/gemini';
import * as s3 from '../services/s3';

const mockGetAuth = vi.mocked(getAuth);

describe('Video routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockReturnValue({ userId: 'user_video1' } as any);
    app = createTestApp();
  });

  // ── POST /api/video ──────────────────────────────────────────

  describe('POST /api/video', () => {
    it('starts video generation and returns jobId', async () => {
      const res = await request(app)
        .post('/api/video')
        .send({
          sessionId: 'ses_123',
          tryonS3Key: 'user_video1/tryons/ses_123.jpg',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('jobId');
      expect(typeof res.body.jobId).toBe('string');
      expect(res.body.jobId).toBeTruthy();
    });

    it('returns 400 when tryonS3Key is missing', async () => {
      const res = await request(app)
        .post('/api/video')
        .send({ sessionId: 'ses_123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tryonS3Key is required');
    });

    it('returns 403 when tryonS3Key does not belong to user (IDOR prevention)', async () => {
      const res = await request(app)
        .post('/api/video')
        .send({
          sessionId: 'ses_123',
          tryonS3Key: 'other_user/tryons/ses_123.jpg',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access denied');
    });

    it('returns 500 when S3 download fails', async () => {
      vi.mocked(s3.downloadToBuffer).mockRejectedValueOnce(
        new Error('S3 connection failed')
      );

      const res = await request(app)
        .post('/api/video')
        .send({
          sessionId: 'ses_123',
          tryonS3Key: 'user_video1/tryons/ses_123.jpg',
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to start video generation');
    });

    it('calls startVideoGeneration with correct parameters', async () => {
      await request(app)
        .post('/api/video')
        .send({
          sessionId: 'ses_123',
          tryonS3Key: 'user_video1/tryons/ses_123.jpg',
        });

      expect(gemini.startVideoGeneration).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(gemini.startVideoGeneration).mock.calls[0];
      // jobId, imageBase64, label, onComplete, tag, userId
      expect(callArgs[0]).toBeTruthy(); // jobId
      // downloadToBuffer returns Buffer.from('fake-image-data'), then .toString('base64') encodes it
      expect(callArgs[1]).toBe(Buffer.from('fake-image-data').toString('base64'));
      expect(callArgs[2]).toBe('outfit'); // label
      expect(typeof callArgs[3]).toBe('function'); // onComplete callback
    });
  });

  // ── GET /api/video/:jobId ─────────────────────────────────────

  describe('GET /api/video/:jobId', () => {
    it('returns 404 when job does not exist', async () => {
      vi.mocked(gemini.getVideoJob).mockReturnValue(undefined);

      const res = await request(app)
        .get('/api/video/nonexistent-job-id');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Job not found');
    });

    it('returns pending status for in-progress job', async () => {
      vi.mocked(gemini.getVideoJob).mockReturnValue({
        status: 'pending',
        userId: 'user_video1',
        createdAt: Date.now(),
      });

      const res = await request(app)
        .get('/api/video/job-123');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pending');
      expect(res.body.videoUrl).toBeUndefined();
    });

    it('returns completed status with video URL', async () => {
      vi.mocked(gemini.getVideoJob).mockReturnValue({
        status: 'complete',
        videoUrl: 'https://cdn.test/video.mp4',
        userId: 'user_video1',
        createdAt: Date.now(),
      });

      const res = await request(app)
        .get('/api/video/job-123');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('complete');
      expect(res.body.videoUrl).toBe('https://cdn.test/video.mp4');
    });

    it('returns failed status with error message', async () => {
      vi.mocked(gemini.getVideoJob).mockReturnValue({
        status: 'failed',
        error: 'Generation failed',
        userId: 'user_video1',
        createdAt: Date.now(),
      });

      const res = await request(app)
        .get('/api/video/job-123');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('failed');
      expect(res.body.error).toBe('Generation failed');
    });

    it('returns 403 when user does not own the job', async () => {
      vi.mocked(gemini.getVideoJob).mockReturnValue({
        status: 'complete',
        videoUrl: 'https://cdn.test/video.mp4',
        userId: 'other_user',
        createdAt: Date.now(),
      });

      const res = await request(app)
        .get('/api/video/job-123');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access denied');
    });
  });
});
