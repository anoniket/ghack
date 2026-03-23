import 'dotenv/config';

// Override console.log with millisecond timestamps for Railway debugging
const _log = console.log;
const _err = console.error;
const _warn = console.warn;
const ts = () => new Date().toISOString().slice(11, 23);
console.log = (...args: any[]) => _log(`[${ts()}]`, ...args);
console.error = (...args: any[]) => _err(`[${ts()}]`, ...args);
console.warn = (...args: any[]) => _warn(`[${ts()}]`, ...args);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { clerkAuth, authMiddleware } from './middleware/auth';
import { playgroundRouter } from './routes/playground';
import { pipelineRouter } from './routes/pipeline';
import { tryonRouter } from './routes/tryon';
import { chatRouter } from './routes/chat';
import { videoRouter } from './routes/video';
import { mediaRouter } from './routes/media';
import { historyRouter } from './routes/history';
import { geminiConcurrency } from './services/gemini';

const app = express();

// Railway runs behind a reverse proxy — needed for express-rate-limit to read X-Forwarded-For
app.set('trust proxy', 1);

// Pipeline dashboard — mounted BEFORE compression so SSE streams in real-time
app.use('/pipeline', (_req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  next();
}, express.json({ limit: '20mb' }), pipelineRouter);

app.use(helmet());
app.use(compression());
app.use(cors({ origin: false }));

// Debug playground (no auth, no helmet CSP) — mount before global body parser
app.use('/playground', (_req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  next();
}, express.json({ limit: '20mb' }), playgroundRouter);

// PERF-14: 50MB body limit for tryon + selfie-describe routes (selfie base64 can be ~5MB)
app.use('/api/tryon', express.json({ limit: '50mb' }));
app.use('/api/selfie-describe', express.json({ limit: '50mb' }));

// PERF-14/SEC-13: Default 1MB body limit for everything else
app.use(express.json({ limit: '1mb' }));

// Rate limiting — 300 requests per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
});

// Per-user generation limit — 200 RPM
const userGenerationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  keyGenerator: (req: express.Request) => (req as any).userId || 'unknown',
  validate: { ip: false },
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
});

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gemini: geminiConcurrency() });
});

// Clerk middleware — attaches auth state to req (must run before authMiddleware)
app.use('/api', clerkAuth);
// All API routes require Clerk authentication + rate limiting
app.use('/api', limiter, authMiddleware);

// SEC-6: Stricter limit for chat (Gemini API abuse prevention)
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, slow down' },
});

// Stricter limits on generation endpoints
app.use('/api/tryon', userGenerationLimiter);
app.use('/api/video', userGenerationLimiter);
app.use('/api/chat', chatLimiter);

app.use('/api', tryonRouter);
app.use('/api', chatRouter);
app.use('/api', videoRouter);
app.use('/api', mediaRouter);
app.use('/api', historyRouter);

// SEC-3: Refuse to start in production without CLERK_SECRET_KEY
if (process.env.NODE_ENV === 'production' && !config.clerkSecretKey) {
  console.error('FATAL: CLERK_SECRET_KEY is not set. Refusing to start in production.');
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`mrigAI backend listening on port ${config.port}`);
  if (!config.clerkSecretKey) {
    console.warn('⚠️  CLERK_SECRET_KEY not set — Clerk auth disabled (dev mode)');
  }
});

// H1: Graceful shutdown — finish in-flight requests before exiting
function gracefulShutdown(signal: string) {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log('All connections closed, exiting');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced exit after 15s timeout');
    process.exit(1);
  }, 15000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
