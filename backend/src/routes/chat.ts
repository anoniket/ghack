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
    const text = await sendChatMessage(req.deviceId, message, history);
    console.log(`${tag} Chat → response generated, length=${text.length}`);

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

    // Strip the JSON block and raw URLs from the user-facing text
    let cleanText = text
      .replace(/```json\s*\n?\s*\{[^}]*"action"\s*:\s*"open_url"[^}]*\}\s*\n?\s*```/g, '')
      .replace(/```json\s*\n?\s*\{[^}]*"url"\s*:[^}]*\}\s*\n?\s*```/g, '')
      .trim();

    if (url) console.log(`${tag} Chat → extracted URL: ${url}`);
    res.json({ text: cleanText, url });
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
