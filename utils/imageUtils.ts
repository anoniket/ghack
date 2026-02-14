import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SELFIE_KEY = 'user_selfie_uri';
const SAVED_TRYONS_KEY = 'saved_tryons';

export async function saveSelfie(uri: string): Promise<string> {
  const filename = `selfie_${Date.now()}.jpg`;
  const destFile = new File(Paths.document, filename);
  const srcFile = new File(uri);
  srcFile.copy(destFile);
  await AsyncStorage.setItem(SELFIE_KEY, destFile.uri);
  return destFile.uri;
}

export async function getSelfieUri(): Promise<string | null> {
  return AsyncStorage.getItem(SELFIE_KEY);
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
}

export async function imageUriToBase64(uri: string): Promise<string> {
  console.log('📸 [ImageUtils] Converting local image to base64:', uri);
  const response = await fetch(uri);
  const blob = await response.blob();
  console.log('📸 [ImageUtils] Blob created — size:', blob.size, 'bytes, type:', blob.type);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the data URL prefix
      const base64 = result.split(',')[1];
      console.log('📸 [ImageUtils] Local image base64 ready — length:', base64.length);
      resolve(base64);
    };
    reader.onerror = (err) => {
      console.error('📸 [ImageUtils] FileReader ERROR:', err);
      reject(err);
    };
    reader.readAsDataURL(blob);
  });
}

export async function downloadImageToBase64(url: string): Promise<string> {
  console.log('🌍 [ImageUtils] Downloading remote image:', url);
  const startTime = Date.now();
  const response = await fetch(url);
  const elapsed = Date.now() - startTime;
  console.log('🌍 [ImageUtils] Download complete in', elapsed + 'ms — status:', response.status);
  const blob = await response.blob();
  console.log('🌍 [ImageUtils] Blob created — size:', blob.size, 'bytes, type:', blob.type);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      console.log('🌍 [ImageUtils] Remote image base64 ready — length:', base64.length);
      resolve(base64);
    };
    reader.onerror = (err) => {
      console.error('🌍 [ImageUtils] FileReader ERROR:', err);
      reject(err);
    };
    reader.readAsDataURL(blob);
  });
}

export interface SavedTryOn {
  id: string;
  imageUri: string;
  productName: string;
  productPrice?: string;
  sourceUrl?: string;
  timestamp: number;
}

export async function saveTryOnResult(
  base64Image: string,
  metadata: { productName: string; productPrice?: string; sourceUrl?: string }
): Promise<SavedTryOn> {
  const id = `tryon_${Date.now()}`;
  const filename = `${id}.png`;
  const destFile = new File(Paths.document, filename);

  // Convert base64 to Uint8Array and write
  const binaryStr = atob(base64Image);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  destFile.write(bytes);

  const tryOn: SavedTryOn = {
    id,
    imageUri: destFile.uri,
    productName: metadata.productName,
    productPrice: metadata.productPrice,
    sourceUrl: metadata.sourceUrl,
    timestamp: Date.now(),
  };

  const existing = await getSavedTryOns();
  existing.unshift(tryOn);
  await AsyncStorage.setItem(SAVED_TRYONS_KEY, JSON.stringify(existing));
  return tryOn;
}

export async function getSavedTryOns(): Promise<SavedTryOn[]> {
  const data = await AsyncStorage.getItem(SAVED_TRYONS_KEY);
  return data ? JSON.parse(data) : [];
}

export async function deleteTryOn(id: string): Promise<void> {
  const tryOns = await getSavedTryOns();
  const item = tryOns.find((t) => t.id === id);
  if (item) {
    try {
      const file = new File(item.imageUri);
      if (file.exists) file.delete();
    } catch {}
  }
  const updated = tryOns.filter((t) => t.id !== id);
  await AsyncStorage.setItem(SAVED_TRYONS_KEY, JSON.stringify(updated));
}
