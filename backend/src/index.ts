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
import { deviceIdMiddleware } from './middleware/deviceId';
import { playgroundRouter } from './routes/playground';
import { pipelineRouter } from './routes/pipeline';
import { tryonRouter } from './routes/tryon';
import { chatRouter } from './routes/chat';
import { videoRouter } from './routes/video';
import { mediaRouter } from './routes/media';
import { historyRouter } from './routes/history';
import { authRouter } from './routes/auth';
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
app.use(compression()); // M8: Compress all responses
// SEC-8: Disable CORS headers — mobile app uses x-device-id auth, not browser cookies
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

// Per-device generation limit — 200 RPM
const deviceGenerationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  keyGenerator: (req: express.Request) => (req as any).deviceId || 'unknown',
  validate: { ip: false },
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: 'Too many requests from this device, slow down' },
});

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gemini: geminiConcurrency() });
});



// Auth routes — rate limited but NO deviceIdMiddleware (they handle their own validation)
app.use('/api/auth', limiter, authRouter);

// All other API routes require device ID + JWT/HMAC auth + rate limiting
app.use('/api', limiter, deviceIdMiddleware);

// SEC-6: Stricter limit for chat (Gemini API abuse prevention)
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, slow down' },
});

// Stricter limits on generation endpoints (IP + device)
app.use('/api/tryon', deviceGenerationLimiter);
app.use('/api/video', deviceGenerationLimiter);
app.use('/api/chat', chatLimiter);


app.use('/api', tryonRouter);
app.use('/api', chatRouter);
app.use('/api', videoRouter);
app.use('/api', mediaRouter);
app.use('/api', historyRouter);

// SEC-3: Refuse to start in production without JWT_SECRET
if (process.env.NODE_ENV === 'production' && !config.jwtSecret) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start in production.');
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`mrigAI backend listening on port ${config.port}`);
  if (!config.appSecret) {
    console.warn('⚠️  APP_SECRET not set — HMAC verification disabled (dev mode)');
  }
  if (!config.jwtSecret) {
    console.warn('⚠️  JWT_SECRET not set — JWT verification disabled (dev mode)');
  }
});

// H1: Graceful shutdown — finish in-flight requests before exiting
function gracefulShutdown(signal: string) {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log('All connections closed, exiting');
    process.exit(0);
  });
  // Force exit after 15s if connections don't close
  setTimeout(() => {
    console.error('Forced exit after 15s timeout');
    process.exit(1);
  }, 15000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
