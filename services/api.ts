import { API_URL, APP_SECRET } from '@/utils/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// ---- Device ID ----

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

// ---- HMAC Signing (used only for registration) ----
// SEC-5 NOTE: Uses SHA256(secret + payload) instead of proper HMAC(secret, payload).
// expo-crypto only supports hash digests, not HMAC. Since the secret is in the APK
// anyway (SEC-4), this is defense-in-depth only. Acceptable risk.
async function signRequest(
  deviceId: string,
  timestamp: string,
  path: string
): Promise<string> {
  if (!APP_SECRET) return '';
  const payload = `${APP_SECRET}.${deviceId}.${timestamp}.${path}`;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payload,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return hash.toLowerCase();
}

// ---- JWT Token Management ----

const JWT_KEY = 'auth_jwt';
const JWT_EXP_KEY = 'auth_jwt_exp';
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let cachedToken: string | null = null;
let cachedTokenExp: number | null = null; // epoch ms
let tokenPromise: Promise<string> | null = null; // singleton lock for register/refresh

/** Persist token + expiry to AsyncStorage and memory cache */
async function storeToken(token: string, expiresIn: number): Promise<void> {
  const exp = Date.now() + expiresIn * 1000;
  cachedToken = token;
  cachedTokenExp = exp;
  await AsyncStorage.multiSet([
    [JWT_KEY, token],
    [JWT_EXP_KEY, exp.toString()],
  ]);
}

/** Load token from AsyncStorage into memory cache (called once at startup) */
async function loadTokenFromStorage(): Promise<void> {
  if (cachedToken !== null) return; // already loaded
  const values = await AsyncStorage.multiGet([JWT_KEY, JWT_EXP_KEY]);
  const token = values[0][1];
  const expStr = values[1][1];
  if (token) {
    cachedToken = token;
    cachedTokenExp = expStr ? parseInt(expStr, 10) : null;
  }
}

/** Get cached token if still usable. Kicks off background refresh if expiring soon. */
async function getToken(): Promise<string | null> {
  await loadTokenFromStorage();
  if (!cachedToken || !cachedTokenExp) return null;

  const now = Date.now();
  const timeLeft = cachedTokenExp - now;

  // Expired beyond 24h grace — unusable, need fresh registration
  if (timeLeft < -TWENTY_FOUR_HOURS_MS) {
    cachedToken = null;
    cachedTokenExp = null;
    return null;
  }

  // Expiring within 1 hour (or already expired within 24h) — trigger background refresh
  if (timeLeft < ONE_HOUR_MS && !tokenPromise) {
    tokenPromise = refreshToken()
      .catch(() => {})
      .finally(() => { tokenPromise = null; }) as Promise<string>;
  }

  return cachedToken;
}

/** Register a new device — HMAC-signed call to POST /api/auth/register */
async function register(): Promise<string> {
  const deviceId = await getDeviceId();
  const timestamp = Date.now().toString();
  const registerPath = '/api/auth/register';

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-device-id': deviceId,
    'x-timestamp': timestamp,
  };

  if (APP_SECRET) {
    authHeaders['x-signature'] = await signRequest(deviceId, timestamp, registerPath);
  }

  // ERR-14: 10s timeout — don't hang if backend unreachable
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${registerPath}`, {
      method: 'POST',
      headers: authHeaders,
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Registration timed out');
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Registration failed: ${response.status}`);
  }

  const { token, expiresIn } = await response.json();
  await storeToken(token, expiresIn);
  return token;
}

/** Refresh current JWT by calling POST /api/auth/refresh */
async function refreshToken(): Promise<string> {
  if (!cachedToken) throw new Error('No token to refresh');

  // ERR-14: 10s timeout — don't hang if backend unreachable
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cachedToken}`,
      },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Token refresh timed out');
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Refresh failed: ${response.status}`);
  }

  const { token, expiresIn } = await response.json();
  await storeToken(token, expiresIn);
  return token;
}

/**
 * Ensures a valid JWT is available. Singleton promise prevents concurrent
 * register/refresh calls racing against each other.
 */
async function ensureToken(): Promise<string> {
  // Fast path: cached token is still good
  const existing = await getToken();
  if (existing && cachedTokenExp && cachedTokenExp - Date.now() > 0) {
    return existing;
  }

  // Need to register or refresh — use singleton promise to prevent races
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      // If we have a token that's expired within 24h, try refresh first
      if (cachedToken && cachedTokenExp) {
        const timeLeft = cachedTokenExp - Date.now();
        if (timeLeft > -TWENTY_FOUR_HOURS_MS) {
          try {
            return await refreshToken();
          } catch {
            // Refresh failed — fall through to register
          }
        }
      }
      // No token or refresh failed — register fresh
      return await register();
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

// ---- API Fetch (JWT-authenticated) ----

async function apiFetch(
  path: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<any> {
  const { timeout = 30000, ...fetchOptions } = options;
  const deviceId = await getDeviceId();
  const token = await ensureToken();
  const url = `${API_URL}${path}`;

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-device-id': deviceId,
  };

  // Timeout via AbortController — use caller's signal if provided, else create one
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // If caller passed a signal, forward its abort
  if (fetchOptions.signal) {
    fetchOptions.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...authHeaders,
        ...fetchOptions.headers,
      },
    });

    // Handle 401 with token expiry — refresh and retry once
    if (response.status === 401) {
      const body = await response.json().catch(() => ({}));
      if (body.code === 'TOKEN_EXPIRED') {
        clearTimeout(timeoutId);
        // Mark as just-expired so ensureToken() tries refresh (within 24h grace)
        cachedTokenExp = Date.now() - 1;
        const newToken = await ensureToken();
        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(() => retryController.abort(), timeout);
        if (fetchOptions.signal) {
          fetchOptions.signal.addEventListener('abort', () => retryController.abort());
        }
        try {
          const retryResponse = await fetch(url, {
            ...fetchOptions,
            signal: retryController.signal,
            headers: {
              ...authHeaders,
              'Authorization': `Bearer ${newToken}`,
              ...fetchOptions.headers,
            },
          });
          if (!retryResponse.ok) {
            const retryBody = await retryResponse.json().catch(() => ({}));
            // AC-14: If retry also 401, clear dead token to break the loop
            if (retryResponse.status === 401) {
              cachedToken = null;
              cachedTokenExp = null;
              await AsyncStorage.multiRemove([JWT_KEY, JWT_EXP_KEY]).catch(() => {});
            }
            throw new Error(retryBody.error || `API error ${retryResponse.status}`);
          }
          return retryResponse.json();
        } catch (err: any) {
          if (err.name === 'AbortError') throw new Error('TIMEOUT');
          throw err;
        } finally {
          clearTimeout(retryTimeoutId);
        }
      }
      throw new Error(body.error || `API error 401`);
    }

    // AC-3: Detect rate limiting — show user-friendly cooldown message
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
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

export async function tryOnV2(params: {
  selfieBase64?: string;
  productImageUrl: string;
  selfieS3Key?: string;
  sourceUrl?: string;
  retry?: boolean;
}): Promise<TryOnResult> {
  return apiFetch('/api/tryon/v2', {
    method: 'POST',
    body: JSON.stringify(params),
    timeout: params.retry ? 75000 : 45000,
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
