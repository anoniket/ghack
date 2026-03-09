import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { deviceIdMiddleware } from './middleware/deviceId';
import { tryonRouter } from './routes/tryon';
import { chatRouter } from './routes/chat';
import { videoRouter } from './routes/video';
import { mediaRouter } from './routes/media';
import { historyRouter } from './routes/history';

const app = express();

// Railway runs behind a reverse proxy — needed for express-rate-limit to read X-Forwarded-For
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Rate limiting — 300 requests per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
});

// Stricter limit for expensive endpoints (try-on generation)
const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Generation rate limit reached, try again later' },
});

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// All API routes require device ID + HMAC signature + rate limiting
app.use('/api', limiter, deviceIdMiddleware);

// Stricter limits on generation endpoints
app.use('/api/tryon', generationLimiter);
app.use('/api/video', generationLimiter);

app.use('/api', tryonRouter);
app.use('/api', chatRouter);
app.use('/api', videoRouter);
app.use('/api', mediaRouter);
app.use('/api', historyRouter);

app.listen(config.port, () => {
  console.log(`mrigAI backend listening on port ${config.port}`);
  if (!config.appSecret) {
    console.warn('⚠️  APP_SECRET not set — HMAC verification disabled (dev mode)');
  }
});
