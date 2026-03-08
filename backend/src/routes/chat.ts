import { Router, Request, Response } from 'express';
import { sendChatMessage, resetChat } from '../services/gemini';

export const chatRouter = Router();

chatRouter.post('/chat', async (req: Request, res: Response) => {
  const { message, history } = req.body;

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const tag = `[${req.deviceId.substring(0, 8)}]`;

  try {
    const text = await sendChatMessage(req.deviceId, message, history);

    // Extract URL from response (same logic as client-side)
    let url: string | null = null;
    const jsonMatch = text.match(
      /```json\s*\n?\s*\{[^}]*"action"\s*:\s*"open_url"[^}]*"url"\s*:\s*"([^"]+)"[^}]*\}/
    );
    if (jsonMatch) {
      url = jsonMatch[1];
    } else {
      const urlMatch = text.match(/https?:\/\/[^\s"'<>)]+/);
      if (urlMatch) url = urlMatch[0];
    }

    res.json({ text, url });
  } catch (err: any) {
    console.error(`${tag} Chat ERROR:`, err.message);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

chatRouter.post('/chat/reset', async (req: Request, res: Response) => {
  resetChat(req.deviceId);
  res.json({ ok: true });
});
