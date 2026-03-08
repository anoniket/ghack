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
    const rawText = await sendChatMessage(req.deviceId, message, history);
    console.log(`${tag} Chat → response generated, length=${rawText.length}`);

    // Extract URL from OPEN: line and strip it from text
    let url: string | null = null;
    const openMatch = rawText.match(/^OPEN:\s*(https?:\/\/\S+)\s*$/m);
    if (openMatch) {
      url = openMatch[1];
    } else {
      // Fallback: extract any URL from text
      const urlMatch = rawText.match(/https?:\/\/[^\s"'<>)]+/);
      if (urlMatch) url = urlMatch[0];
    }

    // Strip OPEN: lines, JSON blocks, and bare URLs from user-facing text
    const cleanText = rawText
      .replace(/^OPEN:\s*https?:\/\/\S+\s*$/gm, '')
      .replace(/```json\s*\n?\s*\{[^}]*\}\s*\n?\s*```/g, '')
      .replace(/https?:\/\/[^\s"'<>)]+/g, '')
      .trim();

    if (url) console.log(`${tag} Chat → extracted URL: ${url}`);
    res.json({ text: cleanText || rawText.trim(), url });
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
