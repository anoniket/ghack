import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup';
import { getAuth } from '@clerk/express';
import * as gemini from '../services/gemini';

const mockGetAuth = vi.mocked(getAuth);

describe('Chat routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockReturnValue({ userId: 'user_chat1' } as any);
    app = createTestApp();
  });

  // ── POST /api/chat ──────────────────────────────────────────

  describe('POST /api/chat', () => {
    it('returns chat response with text', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({ message: 'What should I wear today?' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('text');
      expect(typeof res.body.text).toBe('string');
      expect(res.body.text.length).toBeGreaterThan(0);
    });

    it('extracts URL from OPEN: line in response', async () => {
      vi.mocked(gemini.sendChatMessage).mockResolvedValueOnce(
        'Check out this collection!\nOPEN: https://www.myntra.com/tshirts'
      );

      const res = await request(app)
        .post('/api/chat')
        .send({ message: 'Show me t-shirts on Myntra' });

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://www.myntra.com/tshirts');
      // The OPEN: line should be stripped from the text
      expect(res.body.text).not.toContain('OPEN:');
    });

    it('extracts URL even without OPEN: prefix (fallback)', async () => {
      vi.mocked(gemini.sendChatMessage).mockResolvedValueOnce(
        'Try this: https://www.zara.com/shirts'
      );

      const res = await request(app)
        .post('/api/chat')
        .send({ message: 'Show me Zara shirts' });

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://www.zara.com/shirts');
    });

    it('returns null url when no URL in response', async () => {
      vi.mocked(gemini.sendChatMessage).mockResolvedValueOnce(
        'You should try pairing that with white sneakers!'
      );

      const res = await request(app)
        .post('/api/chat')
        .send({ message: 'How should I style this?' });

      expect(res.status).toBe(200);
      expect(res.body.url).toBeNull();
    });

    it('returns 400 when message is missing', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });

    it('returns 400 when message is not a string', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({ message: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });

    it('returns 400 when message is empty string', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({ message: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });

    it('passes sanitized history to sendChatMessage', async () => {
      const history = [
        { role: 'user', text: 'Hello' },
        { role: 'model', text: 'Hi there!' },
      ];

      await request(app)
        .post('/api/chat')
        .send({ message: 'Next question', history });

      expect(gemini.sendChatMessage).toHaveBeenCalledWith(
        'user_chat1',
        'Next question',
        history
      );
    });

    it('caps history at 20 entries', async () => {
      const history = Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'model',
        text: `Message ${i}`,
      }));

      await request(app)
        .post('/api/chat')
        .send({ message: 'Next', history });

      const callArgs = vi.mocked(gemini.sendChatMessage).mock.calls[0];
      // The route slices history to 20
      const passedHistory = callArgs[2];
      expect(passedHistory).toBeDefined();
      expect(passedHistory!.length).toBeLessThanOrEqual(20);
    });

    it('returns 500 when Gemini chat fails', async () => {
      vi.mocked(gemini.sendChatMessage).mockRejectedValueOnce(
        new Error('Gemini API error')
      );

      const res = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Chat failed');
    });
  });

  // ── POST /api/chat/reset ──────────────────────────────────────

  describe('POST /api/chat/reset', () => {
    it('resets chat and returns ok', async () => {
      const res = await request(app)
        .post('/api/chat/reset')
        .send();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('calls resetChat with correct userId', async () => {
      await request(app)
        .post('/api/chat/reset')
        .send();

      expect(gemini.resetChat).toHaveBeenCalledWith('user_chat1');
    });
  });
});
