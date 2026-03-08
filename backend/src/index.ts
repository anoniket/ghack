import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { deviceIdMiddleware } from './middleware/deviceId';
import { tryonRouter } from './routes/tryon';
import { chatRouter } from './routes/chat';
import { videoRouter } from './routes/video';
import { mediaRouter } from './routes/media';
import { historyRouter } from './routes/history';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// All API routes require device ID
app.use('/api', deviceIdMiddleware);

app.use('/api', tryonRouter);
app.use('/api', chatRouter);
app.use('/api', videoRouter);
app.use('/api', mediaRouter);
app.use('/api', historyRouter);

app.listen(config.port, () => {
  console.log(`TryOnAI backend listening on port ${config.port}`);
});
