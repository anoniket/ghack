import { GoogleGenAI } from '@google/genai';
import { File, Directory, Paths } from 'expo-file-system';
import { GEMINI_API_KEY, MODELS, CHAT_SYSTEM_PROMPT, TRYON_PROMPT } from '@/utils/constants';
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
        maxOutputTokens: 1024,
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

export async function generateTryOn(
  selfieUri: string,
  productImageUrl: string,
  garmentType: string = 'clothing item'
): Promise<string> {
  console.log('🧠 [Gemini] ======== TRY-ON GENERATION ========');
  console.log('🧠 [Gemini] Model:', MODELS.IMAGE_GEN);
  console.log('🧠 [Gemini] Garment type:', garmentType);
  console.log('🧠 [Gemini] Product image URL (full):', productImageUrl);

  console.log('🧠 [Gemini] Converting selfie to base64...');
  const selfieBase64 = await imageUriToBase64(selfieUri);
  console.log('🧠 [Gemini] Selfie base64 ready — length:', selfieBase64.length);

  console.log('🧠 [Gemini] Downloading product image & converting to base64...');
  const productBase64 = await downloadImageToBase64(productImageUrl);
  console.log('🧠 [Gemini] Product base64 ready — length:', productBase64.length);

  console.log('🧠 [Gemini] Sending to Gemini API...');
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: MODELS.IMAGE_GEN,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: selfieBase64,
            },
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: productBase64,
            },
          },
          {
            text: TRYON_PROMPT(garmentType),
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

  console.error('🧠 [Gemini] NO IMAGE in response! Full response:', JSON.stringify(response).substring(0, 500));
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
    prompt: `A fashion model wearing a ${productName} poses confidently, subtle natural movement, gentle hair sway, soft studio lighting, professional fashion photoshoot, 4K quality`,
    image: {
      imageBytes: imageBase64,
      mimeType: 'image/png',
    },
    config: {
      aspectRatio: '9:16',
      durationSeconds: 4,
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
    console.error('🎬 [Veo] NO VIDEO in response!', JSON.stringify(operation.response).substring(0, 500));
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
