export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
export const APP_SECRET = process.env.EXPO_PUBLIC_APP_SECRET || '';

// C11: Warn loudly if production build has no API URL configured
if (!__DEV__ && API_URL.includes('localhost')) {
  console.error('FATAL: EXPO_PUBLIC_API_URL not set — API calls will fail. Check EAS environment variables.');
}

// M25: Shared tab bar base height — used in _layout.tsx and ChatBubble.tsx
export const TAB_BAR_BASE_HEIGHT = 58;

// Prompts kept as reference — actual prompts live on the server
export const CHAT_SYSTEM_PROMPT = ''; // Server-side only
export const TRYON_DETECT_PROMPT = ''; // Server-side only
export const TRYON_PHOTOSHOOT_PROMPT = ''; // Server-side only
export const TRYON_PROMPT = ''; // Server-side only
