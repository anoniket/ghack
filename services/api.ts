import { API_URL, isDemoMode } from '@/utils/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getClerkInstance } from '@clerk/clerk-expo';

// ---- Device ID (logging/debugging only) ----

const DEVICE_ID_KEY = 'device_id';
let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    try {
      const Application = require('expo-application');
      id = Application.getInstallationIdAsync
        ? await Application.getInstallationIdAsync()
        : Application.androidId || `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    } catch {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
    await AsyncStorage.setItem(DEVICE_ID_KEY, id!);
  }

  cachedDeviceId = id!;
  return cachedDeviceId;
}

// ---- Clerk Token ----

async function getClerkToken(): Promise<string> {
  const clerk = getClerkInstance();
  const token = await clerk.session?.getToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

// ---- API Fetch ----

async function apiFetch(
  path: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<any> {
  const { timeout = 30000, ...fetchOptions } = options;
  const url = `${API_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isDemoMode()) {
    // Demo mode: identify by device ID only (no auth token)
    const deviceId = await getDeviceId();
    headers['x-device-id'] = deviceId;
  } else {
    // Production: Clerk session token
    const token = await getClerkToken();
    headers['Authorization'] = `Bearer ${token}`;
    try {
      const deviceId = await getDeviceId();
      headers['x-device-id'] = deviceId;
    } catch {}
  }

  // Timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  if (fetchOptions.signal) {
    fetchOptions.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...headers,
        ...fetchOptions.headers,
      },
    });

    // AC-3: Detect rate limiting
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }

    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `API error ${response.status}`);
    }

    return response.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
    // ERR-22: Distinguish network errors from server errors
    if (err instanceof TypeError && err.message?.includes('Network request failed')) {
      throw new Error('NETWORK_ERROR');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---- Try-On ----

export interface TryOnResult {
  sessionId: string;
  tryonS3Key: string;
  resultBase64: string;
  resultCdnUrl: string;
  model: string;
  durationMs: number;
}

export async function describeSelfie(selfieBase64: string): Promise<string> {
  const result = await apiFetch('/api/selfie-describe', {
    method: 'POST',
    body: JSON.stringify({ selfieBase64 }),
    timeout: 60000,
  });
  return result.description;
}

export async function cacheSelfies(selfieBase64s: string[]): Promise<{ cached: boolean; count: number }> {
  return apiFetch('/api/tryon/selfie-cache', {
    method: 'POST',
    body: JSON.stringify({ selfieBase64s }),
    timeout: 60000,
  });
}

export async function checkSelfieCache(): Promise<{ cached: boolean; count: number }> {
  return apiFetch('/api/tryon/selfie-cache/status', { timeout: 10000 });
}

export async function tryOnV2(params: {
  productImageUrl: string;
  sourceUrl?: string;
  retry?: boolean;
  selfieDescription?: string;
  model?: 'nb1' | 'nb2' | 'pro';
  selfieBase64s?: string[]; // fallback if cache miss
}): Promise<TryOnResult> {
  return apiFetch('/api/tryon/v2', {
    method: 'POST',
    body: JSON.stringify(params),
    timeout: 50000,
  });
}

// ---- Chat ----

export async function sendChat(
  message: string,
  history?: Array<{ role: string; text: string }>
): Promise<{ text: string; url?: string }> {
  return apiFetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  });
}

export async function resetChatHistory(): Promise<void> {
  await apiFetch('/api/chat/reset', { method: 'POST' });
}

// ---- Video ----

export async function startVideo(params: {
  sessionId: string;
  tryonS3Key: string;
}): Promise<{ jobId: string }> {
  return apiFetch('/api/video', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function pollVideo(
  jobId: string,
  signal?: AbortSignal
): Promise<{ status: 'pending' | 'complete' | 'failed'; videoUrl?: string; error?: string }> {
  return apiFetch(`/api/video/${jobId}`, { signal });
}

// ---- Media (selfie upload) ----

export async function getUploadUrl(
  type: 'selfie',
  contentType: string = 'image/jpeg'
): Promise<{ uploadUrl: string; s3Key: string; expiresIn: number }> {
  return apiFetch('/api/upload-url', {
    method: 'POST',
    body: JSON.stringify({ type, contentType }),
  });
}

export async function uploadSelfieToS3(localUri: string): Promise<string> {
  const { uploadUrl, s3Key } = await getUploadUrl('selfie', 'image/jpeg');

  const response = await fetch(localUri);
  const blob = await response.blob();

  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });

  return s3Key;
}

// ---- History ----

export interface HistoryItem {
  sessionId: string;
  sourceUrl?: string;
  tryonImageUrl: string;
  videoUrl?: string;
  model: string;
  createdAt: string;
}

export async function getHistory(): Promise<{ items: HistoryItem[] }> {
  return apiFetch('/api/history');
}

export async function deleteSession(sessionId: string): Promise<void> {
  await apiFetch(`/api/history/${sessionId}`, { method: 'DELETE' });
}

export async function deleteAllSessions(): Promise<{ deleted: number }> {
  return apiFetch('/api/history', { method: 'DELETE' });
}

// ---- Logging ----

export async function sendLogs(logs: Array<{ tag: string; msg: string }>): Promise<void> {
  await apiFetch('/api/log', {
    method: 'POST',
    body: JSON.stringify({ logs }),
  });
}

// ---- Product Try-On Check ----

export interface ProductTryOnResult {
  found: boolean;
  tryonImageUrl?: string;
  videoUrl?: string;
  sessionId?: string;
  tryonS3Key?: string;
}

export async function checkProductTryOn(sourceUrl: string): Promise<ProductTryOnResult> {
  return apiFetch(`/api/product-tryon?sourceUrl=${encodeURIComponent(sourceUrl)}`);
}

