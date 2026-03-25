/**
 * Test setup — builds a testable Express app with all external services mocked.
 *
 * The real index.ts has side effects (Sentry init, app.listen, setInterval).
 * Instead of importing it, we reconstruct the same middleware + route chain here
 * so tests run without network, AWS, or Gemini dependencies.
 */

import { vi } from 'vitest';

// ── Mock external services BEFORE any app code imports ──────────────

// Sentry / instrument — no-op
vi.mock('../instrument', () => ({}));
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setupExpressErrorHandler: vi.fn(),
}));

// Clerk — mock at module level
vi.mock('@clerk/express', () => ({
  clerkMiddleware: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  getAuth: vi.fn(() => null),
}));

// AWS S3
vi.mock('../services/s3', () => ({
  uploadBuffer: vi.fn(async (key: string) => `https://cdn.test/${key}`),
  cdnUrl: vi.fn((key: string) => `https://cdn.test/${key}`),
  getReadUrl: vi.fn(async (key: string) => `https://cdn.test/signed/${key}`),
  getPresignedUploadUrl: vi.fn(async () => 'https://s3.test/presigned-upload-url'),
  downloadToBuffer: vi.fn(async () => Buffer.from('fake-image-data')),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => []),
  deletePrefix: vi.fn(async () => {}),
}));

// DynamoDB
vi.mock('../services/dynamo', () => ({
  putSession: vi.fn(async () => {}),
  getSession: vi.fn(async () => null),
  queryByDevice: vi.fn(async () => []),
  queryBySourceUrl: vi.fn(async () => null),
  updateSessionVideo: vi.fn(async () => {}),
  deleteSession: vi.fn(async () => null),
  deleteAllSessions: vi.fn(async () => []),
}));

// Gemini
vi.mock('../services/gemini', () => ({
  generateTryOnV2: vi.fn(async () => 'base64-result-image'),
  downloadImageToBase64: vi.fn(async () => 'base64-product-image'),
  sendChatMessage: vi.fn(async () => 'Hello! What are we shopping for today?'),
  resetChat: vi.fn(),
  startVideoGeneration: vi.fn(async () => {}),
  getVideoJob: vi.fn(() => undefined),
  geminiConcurrency: vi.fn(() => ({ active: 0, queued: 0, max: 10 })),
  ImageBlockedError: class ImageBlockedError extends Error {
    public reason: string;
    constructor(reason: string) {
      super(`Image generation blocked: ${reason}`);
      this.name = 'ImageBlockedError';
      this.reason = reason;
    }
  },
  TimeoutError: class TimeoutError extends Error {
    constructor(operation: string, ms: number) {
      super(`${operation} timed out after ${ms}ms`);
      this.name = 'TimeoutError';
    }
  },
}));

// Classifier
vi.mock('../services/classifier', () => ({
  classifyProduct: vi.fn(async () => ({ category: 'TOP', description: 'A blue t-shirt' })),
  describeSelfie: vi.fn(async () => 'A person with dark hair'),
  getPromptForCategory: vi.fn(() => 'Test prompt for category'),
  PRODUCT_CATEGORIES: ['FOOTWEAR', 'TOP', 'BOTTOM', 'FULL_OUTFIT', 'RING', 'BRACELET', 'EARRING', 'NECKLACE', 'SUNGLASSES', 'BAG', 'BELT', 'DUPATTA'],
}));

// Analytics — no-op
vi.mock('../services/analytics', () => ({
  trackEvent: vi.fn(),
  identifyUser: vi.fn(),
  shutdownAnalytics: vi.fn(async () => {}),
}));

// Sharp — mock the fluent chain: sharp(buf).resize(n).jpeg({}).toBuffer()
vi.mock('sharp', () => {
  const sharpInstance = {
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(async () => Buffer.from('compressed-image')),
  };
  const sharpFn = vi.fn(() => sharpInstance);
  (sharpFn as any).__instance = sharpInstance;
  return { default: sharpFn };
});

// ── Build the Express app (mirrors index.ts middleware chain) ────────

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { clerkAuth, authMiddleware } from '../middleware/auth';
import { tryonRouter } from '../routes/tryon';
import { chatRouter } from '../routes/chat';
import { videoRouter } from '../routes/video';
import { mediaRouter } from '../routes/media';
import { historyRouter } from '../routes/history';
import { geminiConcurrency } from '../services/gemini';

export function createTestApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: false }));

  // Body limit matching production
  app.use('/api/tryon', express.json({ limit: '50mb' }));
  app.use('/api/selfie-describe', express.json({ limit: '50mb' }));
  app.use(express.json({ limit: '1mb' }));

  // Rate limiting — use same config as production but with higher limits for tests
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, slow down' },
  });

  // Health check (no auth)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', gemini: geminiConcurrency() });
  });

  // App config (no auth)
  app.get('/api/config', (_req, res) => {
    res.json({ demoMode: config.demoMode });
  });

  // Clerk middleware + auth
  app.use('/api', clerkAuth);
  app.use('/api', limiter, authMiddleware);

  // Route mounts (same as index.ts)
  app.use('/api', tryonRouter);
  app.use('/api', chatRouter);
  app.use('/api', videoRouter);
  app.use('/api', mediaRouter);
  app.use('/api', historyRouter);

  return app;
}
