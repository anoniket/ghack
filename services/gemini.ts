import { GoogleGenAI } from '@google/genai';
import { File, Directory, Paths } from 'expo-file-system';
import { GEMINI_API_KEY, MODELS, CHAT_SYSTEM_PROMPT, TRYON_PROMPT, TRYON_DETECT_PROMPT, TRYON_PHOTOSHOOT_PROMPT } from '@/utils/constants';
import { imageUriToBase64, downloadImageToBase64 } from '@/utils/imageUtils';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

let chatHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

export function resetChat() {
  chatHistory = [];
}

export async function sendChatMessage(userMessage: string): Promise<string> {
  console.log('💬 [Gemini] Chat request — model:', MODELS.CHAT);
  console.log('💬 [Gemini] User message:', userMessage);
  console.log('💬 [Gemini] Chat history length:', chatHistory.length, 'messages');

  chatHistory.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  try {
    const startTime = Date.now();
    const response = await ai.models.generateContent({
      model: MODELS.CHAT,
      contents: chatHistory,
      config: {
        systemInstruction: CHAT_SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 256,
        tools: [{ googleSearch: {} }],
      },
    });
    const elapsed = Date.now() - startTime;

    const text = response.text || 'Sorry, I could not process that. Please try again.';

    console.log('💬 [Gemini] Chat response received in', elapsed + 'ms');
    console.log('💬 [Gemini] Response:', text);

    chatHistory.push({
      role: 'model',
      parts: [{ text }],
    });

    return text;
  } catch (error) {
    chatHistory.pop();
    console.error('💬 [Gemini] Chat ERROR:', error);
    throw error;
  }
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

// Prepares images and runs zone detection. Returns data needed for generation.
export async function prepareTryOn(
  selfieUri: string,
  productImageUrl: string
): Promise<{ selfieBase64: string; productBase64: string; usePhotoshoot: boolean }> {
  console.log('🧠 [Gemini] ======== TRY-ON PREPARE ========');
  console.log('🧠 [Gemini] Product image URL (full):', productImageUrl);

  console.log('🧠 [Gemini] Converting selfie to base64...');
  const selfieBase64 = await imageUriToBase64(selfieUri);
  console.log('🧠 [Gemini] Selfie base64 ready — length:', selfieBase64.length);

  console.log('🧠 [Gemini] Downloading product image & converting to base64...');
  const productBase64 = await downloadImageToBase64(productImageUrl);
  console.log('🧠 [Gemini] Product base64 ready — length:', productBase64.length);

  // Quick detection — is the product zone visible in the selfie?
  console.log('🔍 [Detect] Running zone detection with Flash...');
  const detectStart = Date.now();

  const detectResponse = await ai.models.generateContent({
    model: MODELS.CHAT,
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'IMAGE 1 (the customer\'s selfie/photo — analyze THIS for body visibility):' },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: selfieBase64,
            },
          },
          { text: 'IMAGE 2 (the product to try on — analyze THIS to determine product type):' },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: productBase64,
            },
          },
          {
            text: TRYON_DETECT_PROMPT,
          },
        ],
      },
    ],
    config: {
      temperature: 0,
      maxOutputTokens: 128,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const detectText = detectResponse.text || '';
  const detectElapsed = Date.now() - detectStart;
  console.log('🔍 [Detect] Response in', detectElapsed + 'ms:', detectText);

  let usePhotoshoot = false;
  try {
    const jsonMatch = detectText.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const detection = JSON.parse(jsonMatch[0]);
      console.log('🔍 [Detect] Product zone:', detection.product_zone, '| Zone visible:', detection.zone_visible);
      usePhotoshoot = detection.zone_visible === false;
    }
  } catch (parseErr) {
    console.warn('🔍 [Detect] Failed to parse detection, defaulting to replacement prompt');
  }

  console.log('🧠 [Gemini] Mode:', usePhotoshoot ? 'PHOTOSHOOT (Pro ~30s)' : 'REPLACEMENT (Flash ~10s)');
  return { selfieBase64, productBase64, usePhotoshoot };
}

// Generates the try-on image using pre-prepared data
export async function generateTryOn(
  selfieBase64: string,
  productBase64: string,
  usePhotoshoot: boolean
): Promise<string> {
  const prompt = usePhotoshoot ? TRYON_PHOTOSHOOT_PROMPT : TRYON_PROMPT;
  const model = usePhotoshoot ? MODELS.IMAGE_GEN_PRO : MODELS.IMAGE_GEN;
  console.log('🧠 [Gemini] ======== TRY-ON GENERATION ========');
  console.log('🧠 [Gemini] Using prompt:', usePhotoshoot ? 'PHOTOSHOOT' : 'REPLACEMENT');
  console.log('🧠 [Gemini] Using model:', model);
  console.log('🧠 [Gemini] Sending to Gemini API...');
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Image 1 — the customer\'s photo:' },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: selfieBase64,
            },
          },
          { text: 'Image 2 — the product:' },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: productBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    config: {
      responseModalities: ['Text', 'Image'] as any,
    },
  });

  const elapsed = Date.now() - startTime;
  console.log('🧠 [Gemini] API response received in', elapsed + 'ms');

  // Extract image from response
  const parts = response.candidates?.[0]?.content?.parts;
  console.log('🧠 [Gemini] Response parts count:', parts?.length || 0);

  if (parts) {
    for (const part of parts) {
      if ((part as any).inlineData) {
        const resultData = (part as any).inlineData.data;
        const resultMime = (part as any).inlineData.mimeType;
        console.log('🧠 [Gemini] Image found in response! mimeType:', resultMime, '| base64 length:', resultData.length);
        console.log('🧠 [Gemini] ======== TRY-ON COMPLETE ========');
        return resultData;
      }
      if ((part as any).text) {
        console.log('🧠 [Gemini] Text part:', (part as any).text);
      }
    }
  }

  console.log('🧠 [Gemini] NO IMAGE in response! Full response:', JSON.stringify(response).substring(0, 500));
  throw new Error('No image generated. The model did not return an image.');
}

export async function generateVideo(
  imageBase64: string,
  productName: string = 'outfit'
): Promise<string> {
  console.log('🎬 [Veo] ======== VIDEO GENERATION ========');
  console.log('🎬 [Veo] Model:', MODELS.VIDEO_GEN);
  console.log('🎬 [Veo] Input image base64 length:', imageBase64.length);
  console.log('🎬 [Veo] Product:', productName);

  const startTime = Date.now();

  let operation = await (ai.models as any).generateVideos({
    model: MODELS.VIDEO_GEN,
    prompt: `This is an AI-generated fashion mockup image of an ordinary person (NOT a celebrity or public figure) wearing ${productName}. Animate this person doing a slow confident turn — first looking at the camera, then turning to show the side profile, then the back, and coming back to face the camera. Subtle natural movements only — a slight head tilt, a hand adjusting the clothing, shifting weight between feet. The clothing moves naturally with the body — fabric swaying, catching light as they turn. Keep it intimate and real, like a mirror check or someone filming themselves for Instagram. Same lighting as the input image. Smooth cinematic camera, shallow depth of field, shot on 85mm. The person's face, skin tone, hair, and body must look IDENTICAL to the input image throughout the entire video — no morphing, no identity drift.`,
    image: {
      imageBytes: imageBase64,
      mimeType: 'image/png',
    },
    config: {
      aspectRatio: '9:16',
      durationSeconds: 8,
      personGeneration: 'allow_adult',
    },
  });

  console.log('🎬 [Veo] Generation started, polling for completion...');

  // Poll until done
  let pollCount = 0;
  while (!operation.done) {
    pollCount++;
    console.log('🎬 [Veo] Poll #' + pollCount + ' — waiting 10s...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await (ai.operations as any).getVideosOperation({
      operation: operation,
    });
  }

  const elapsed = Date.now() - startTime;
  console.log('🎬 [Veo] Generation complete in', elapsed + 'ms (' + pollCount + ' polls)');

  // Get the video file reference
  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) {
    const respStr = JSON.stringify(operation.response).substring(0, 500);
    console.log('🎬 [Veo] NO VIDEO in response!', respStr);
    // Extract human-readable reason if available
    const reasons = operation.response?.raiMediaFilteredReasons;
    if (reasons && reasons.length > 0) {
      throw new Error(reasons[0]);
    }
    throw new Error('No video generated. The model did not return a video.');
  }

  // Download the video directly to a local file
  console.log('🎬 [Veo] Downloading video file...');
  const rawUrl = video.uri || video.url;
  // Append API key for authenticated download
  const separator = rawUrl.includes('?') ? '&' : '?';
  const downloadUrl = `${rawUrl}${separator}key=${GEMINI_API_KEY}`;
  console.log('🎬 [Veo] Video URI:', rawUrl);

  const videoCacheDir = new Directory(Paths.cache, 'tryon_videos');
  if (!videoCacheDir.exists) {
    videoCacheDir.create();
  }

  const outputFile = await File.downloadFileAsync(downloadUrl, videoCacheDir);
  console.log('🎬 [Veo] Video saved to:', outputFile.uri);

  if (!outputFile.exists || outputFile.size < 5000) {
    console.error('🎬 [Veo] Downloaded file too small or missing — size:', outputFile.size);
    throw new Error('Video download failed — file is empty or too small');
  }

  console.log('🎬 [Veo] Video file size:', outputFile.size, 'bytes');
  console.log('🎬 [Veo] ======== VIDEO COMPLETE ========');
  return outputFile.uri;
}

export async function analyzeProduct(
  productImageUrl: string,
  question: string
): Promise<string> {
  console.log('🔎 [Gemini] Analyzing product image:', productImageUrl);
  const productBase64 = await downloadImageToBase64(productImageUrl);

  const response = await ai.models.generateContent({
    model: MODELS.CHAT,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: productBase64,
            },
          },
          { text: question },
        ],
      },
    ],
    config: {
      temperature: 0.7,
      maxOutputTokens: 512,
    },
  });

  const result = response.text || 'Could not analyze the product.';
  console.log('🔎 [Gemini] Analysis result:', result);
  return result;
}
