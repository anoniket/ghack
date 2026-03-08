import { Router, Request, Response } from 'express';
import { sendChatMessage, resetChat } from '../services/gemini';

export const chatRouter = Router();

chatRouter.post('/chat', async (req: Request, res: Response) => {
  const { message, history } = req.body;

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const tag = `[${req.deviceId}]`;

  try {
    console.log(`${tag} Chat → message received`);
    const result = await sendChatMessage(req.deviceId, message, history);
    console.log(`${tag} Chat → response generated, length=${result.text.length}`);
    if (result.url) console.log(`${tag} Chat → function call open_url: ${result.url}`);
    res.json({ text: result.text, url: result.url });
  } catch (err: any) {
    console.error(`${tag} Chat ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

chatRouter.post('/chat/reset', async (req: Request, res: Response) => {
  console.log(`[${req.deviceId}] Chat → history reset`);
  resetChat(req.deviceId);
  res.json({ ok: true });
});
