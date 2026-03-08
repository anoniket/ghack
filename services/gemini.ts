// Gemini API calls have been moved to the backend server.
// This file now only contains pure text utility functions.

import { resetChatHistory } from './api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export function resetChat() {
  resetChatHistory().catch(() => {});
}

export function extractUrlFromResponse(text: string): string | null {
  // Look for JSON action block
  const jsonMatch = text.match(/```json\s*\n?\s*\{[^}]*"action"\s*:\s*"open_url"[^}]*"url"\s*:\s*"([^"]+)"[^}]*\}/);
  if (jsonMatch) return jsonMatch[1];

  // Fallback: look for any URL
  const urlMatch = text.match(/https?:\/\/[^\s"'<>)]+/);
  if (urlMatch) return urlMatch[0];

  return null;
}

export function cleanResponseText(text: string): string {
  // Remove JSON action blocks from display text
  return text.replace(/```json\s*\n?\s*\{[^}]*"action"\s*:\s*"open_url"[^}]*\}\s*```/g, '').trim();
}
