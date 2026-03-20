import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '@/services/api';

const SELFIE_KEY = 'user_selfie_uri';
const SELFIE_S3_KEY = 'selfie_s3_key';

// ---- Selfie management (local + S3) ----

export async function saveSelfie(uri: string): Promise<string> {
  const filename = `selfie_${Date.now()}.jpg`;
  const destFile = new File(Paths.document, filename);
  const srcFile = new File(uri);
  console.log(`[saveSelfie] src uri=${uri}, exists=${srcFile.exists}, size=${srcFile.size}`);
  srcFile.copy(destFile);
  console.log(`[saveSelfie] dest uri=${destFile.uri}, exists=${destFile.exists}, size=${destFile.size}`);
  await AsyncStorage.setItem(SELFIE_KEY, destFile.uri);
  return destFile.uri;
}

export async function uploadSelfieAndSaveKey(localUri: string): Promise<string> {
  const s3Key = await api.uploadSelfieToS3(localUri);
  await AsyncStorage.setItem(SELFIE_S3_KEY, s3Key);
  return s3Key;
}

export async function getSelfieUri(): Promise<string | null> {
  return AsyncStorage.getItem(SELFIE_KEY);
}

export async function getSelfieS3Key(): Promise<string | null> {
  return AsyncStorage.getItem(SELFIE_S3_KEY);
}

export async function deleteSelfie(): Promise<void> {
  const uri = await getSelfieUri();
  if (uri) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {}
  }
  await AsyncStorage.removeItem(SELFIE_KEY);
  await AsyncStorage.removeItem(SELFIE_S3_KEY);
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
