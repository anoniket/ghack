import { API_URL } from '@/utils/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'device_id';

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    // Try expo-application first, fallback to generated UUID
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

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const deviceId = await getDeviceId();
  const url = `${API_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': deviceId,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `API error ${response.status}`);
  }

  return response.json();
}

// ---- Try-On ----

export interface PrepareResult {
  usePhotoshoot: boolean;
  model: string;
  estimatedDuration: number;
}

export async function prepareTryOn(params: {
  selfieS3Key: string;
  productImageUrl: string;
  retry?: boolean;
}): Promise<PrepareResult> {
  return apiFetch('/api/tryon/prepare', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface TryOnResult {
  sessionId: string;
  tryonImageUrl: string;
  tryonS3Key: string;
  model: string;
  durationMs: number;
}

export async function generateTryOn(params: {
  selfieS3Key: string;
  productImageUrl: string;
  productName?: string;
  productPrice?: string;
  sourceUrl?: string;
  usePhotoshoot: boolean;
}): Promise<TryOnResult> {
  return apiFetch('/api/tryon/generate', {
    method: 'POST',
    body: JSON.stringify(params),
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
  productName?: string;
}): Promise<{ jobId: string }> {
  return apiFetch('/api/video', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function pollVideo(
  jobId: string
): Promise<{ status: 'pending' | 'complete' | 'failed'; videoUrl?: string; error?: string }> {
  return apiFetch(`/api/video/${jobId}`);
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
  productName?: string;
  productPrice?: string;
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

// ---- Product Try-On Check ----

export interface ProductTryOnResult {
  found: boolean;
  tryonImageUrl?: string;
  videoUrl?: string;
  sessionId?: string;
  tryonS3Key?: string;
  productName?: string;
}

export async function checkProductTryOn(sourceUrl: string): Promise<ProductTryOnResult> {
  return apiFetch(`/api/product-tryon?sourceUrl=${encodeURIComponent(sourceUrl)}`);
}
