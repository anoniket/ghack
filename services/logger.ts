import { AppState } from 'react-native';
import { sendLogs } from './api';

interface LogEntry {
  tag: string;
  msg: string;
}

const buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 2000);
}

async function flush() {
  flushTimer = null;
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, buffer.length);
  try {
    sendLogs(batch).catch(() => {}); // fire and forget
  } catch {}
}

// PLAT-4: Guard against duplicate listeners on HMR — store subscription for cleanup
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
if (!appStateSubscription) {
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'background') flush();
  });
}

export function rlog(tag: string, msg: string) {
  buffer.push({ tag, msg });
  scheduleFlush();
}
