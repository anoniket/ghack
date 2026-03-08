import { API_URL } from '@/utils/constants';
import { getDeviceId } from './api';

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
    const deviceId = await getDeviceId();
    fetch(`${API_URL}/api/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ logs: batch }),
    }).catch(() => {}); // fire and forget
  } catch {}
}

export function rlog(tag: string, msg: string) {
  buffer.push({ tag, msg });
  scheduleFlush();
}
