import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '@/services/api';

// Legacy keys (used for migration from single-selfie to multi-selfie)
const LEGACY_SELFIE_KEY = 'user_selfie_uri';
const LEGACY_SELFIE_S3_KEY = 'selfie_s3_key';

// New multi-selfie keys (store JSON arrays)
const SELFIE_URIS_KEY = 'user_selfie_uris';
const SELFIE_S3_KEYS_KEY = 'selfie_s3_keys';

// ---- Selfie management (local + S3) ----

export async function saveSelfie(uri: string): Promise<string> {
  const filename = `selfie_${Date.now()}.jpg`;
  const destFile = new File(Paths.document, filename);
  const srcFile = new File(uri);
  console.log(`[saveSelfie] src uri=${uri}, exists=${srcFile.exists}, size=${srcFile.size}`);
  srcFile.copy(destFile);
  console.log(`[saveSelfie] dest uri=${destFile.uri}, exists=${destFile.exists}, size=${destFile.size}`);
  return destFile.uri;
}

export async function uploadSelfieAndSaveKey(localUri: string): Promise<string> {
  const s3Key = await api.uploadSelfieToS3(localUri);
  return s3Key;
}

/**
 * Returns all saved selfie URIs. Transparently migrates from the old
 * single-key format (`user_selfie_uri`) into the new JSON-array format
 * (`user_selfie_uris`) on first read.
 */
export async function getSelfieUris(): Promise<string[]> {
  const stored = await AsyncStorage.getItem(SELFIE_URIS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as string[];
    } catch {
      return [];
    }
  }

  // Migration: check legacy single-value key
  const legacy = await AsyncStorage.getItem(LEGACY_SELFIE_KEY);
  if (legacy) {
    const arr = [legacy];
    await AsyncStorage.setItem(SELFIE_URIS_KEY, JSON.stringify(arr));
    await AsyncStorage.removeItem(LEGACY_SELFIE_KEY);
    return arr;
  }

  return [];
}

/**
 * Returns all saved selfie S3 keys. Transparently migrates from the old
 * single-key format (`selfie_s3_key`) into the new JSON-array format
 * (`selfie_s3_keys`) on first read.
 */
export async function getSelfieS3Keys(): Promise<string[]> {
  const stored = await AsyncStorage.getItem(SELFIE_S3_KEYS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as string[];
    } catch {
      return [];
    }
  }

  // Migration: check legacy single-value key
  const legacy = await AsyncStorage.getItem(LEGACY_SELFIE_S3_KEY);
  if (legacy) {
    const arr = [legacy];
    await AsyncStorage.setItem(SELFIE_S3_KEYS_KEY, JSON.stringify(arr));
    await AsyncStorage.removeItem(LEGACY_SELFIE_S3_KEY);
    return arr;
  }

  return [];
}

/**
 * Persist the full selfie URI array to AsyncStorage.
 */
export async function saveSelfieUris(uris: string[]): Promise<void> {
  await AsyncStorage.setItem(SELFIE_URIS_KEY, JSON.stringify(uris));
}

/**
 * Persist the full selfie S3 key array to AsyncStorage.
 */
export async function saveSelfieS3Keys(keys: string[]): Promise<void> {
  await AsyncStorage.setItem(SELFIE_S3_KEYS_KEY, JSON.stringify(keys));
}

export async function deleteSelfie(): Promise<void> {
  const uris = await getSelfieUris();
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {}
  }
  await AsyncStorage.removeItem(SELFIE_URIS_KEY);
  await AsyncStorage.removeItem(SELFIE_S3_KEYS_KEY);
  // Also clean up legacy keys in case migration hasn't run yet
  await AsyncStorage.removeItem(LEGACY_SELFIE_KEY);
  await AsyncStorage.removeItem(LEGACY_SELFIE_S3_KEY);
}

// ---- Image conversion utils (still needed for local operations) ----

export async function imageUriToBase64(uri: string): Promise<string> {
  const file = new File(uri);
  const b64 = await file.base64();
  return b64;
}

export async function downloadImageToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

// Re-export SavedTryOn from store for backward compatibility
export type { SavedTryOn } from '@/services/store';

// M33: Shared history item mapper — used in index.tsx and saved.tsx
export function mapHistoryItem(item: { sessionId: string; tryonImageUrl: string; sourceUrl?: string; createdAt: string; videoUrl?: string }) {
  return {
    id: item.sessionId,
    imageUri: item.tryonImageUrl,
    sourceUrl: item.sourceUrl,
    timestamp: new Date(item.createdAt).getTime(),
    videoUrl: item.videoUrl,
    sessionId: item.sessionId,
  };
}
