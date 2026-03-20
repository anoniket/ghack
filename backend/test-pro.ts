import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS?.split(',')[0] || '';
const ai = new GoogleGenAI({ apiKey: API_KEY });

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

async function main() {
  const selfieB64 = fs.readFileSync(path.resolve(process.argv[2] || 'test-selfie.jpg')).toString('base64');
  const productB64 = fs.readFileSync(path.resolve(process.argv[3] || 'test-product.png')).toString('base64');

  log(`Selfie: ${(selfieB64.length / 1024).toFixed(0)}KB, Product: ${(productB64.length / 1024).toFixed(0)}KB`);

  // Test 1: Absolute minimum config
  log('TEST 1: Pro — bare minimum config (no imageConfig, no personGeneration)');
  const t1 = Date.now();
  try {
    const r1 = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Make the person in Image 1 wear the outfit from Image 2.' },
            { text: '\n\nImage 1:' },
            { inlineData: { mimeType: 'image/jpeg', data: selfieB64 } },
            { text: '\n\nImage 2:' },
            { inlineData: { mimeType: 'image/png', data: productB64 } },
          ],
        },
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
        ],
      } as any,
    });
    const elapsed = Date.now() - t1;
    const parts = r1.candidates?.[0]?.content?.parts;
    const img = parts?.find((p: any) => p.inlineData);
    if (img) {
      log(`TEST 1: ✓ ${elapsed}ms — got image`);
      fs.writeFileSync('test-pro-result-1.png', Buffer.from((img as any).inlineData.data, 'base64'));
    } else {
      log(`TEST 1: ✗ ${elapsed}ms — NO IMAGE`);
      log(JSON.stringify(r1, null, 2));
    }
  } catch (e: any) {
    log(`TEST 1: ✗ ${Date.now() - t1}ms — ERROR: ${e.message}`);
  }

  // Test 2: With imageConfig + personGeneration
  log('\nTEST 2: Pro — with imageConfig + personGeneration');
  const t2 = Date.now();
  try {
    const r2 = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Make the person in Image 1 wear the outfit from Image 2.' },
            { text: '\n\nImage 1:' },
            { inlineData: { mimeType: 'image/jpeg', data: selfieB64 } },
            { text: '\n\nImage 2:' },
            { inlineData: { mimeType: 'image/png', data: productB64 } },
          ],
        },
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        personGeneration: 'ALLOW_ADULT',
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
        ],
        imageConfig: {
          aspectRatio: '3:4',
        },
      } as any,
    });
    const elapsed = Date.now() - t2;
    const parts = r2.candidates?.[0]?.content?.parts;
    const img = parts?.find((p: any) => p.inlineData);
    if (img) {
      log(`TEST 2: ✓ ${elapsed}ms — got image`);
      fs.writeFileSync('test-pro-result-2.png', Buffer.from((img as any).inlineData.data, 'base64'));
    } else {
      log(`TEST 2: ✗ ${elapsed}ms — NO IMAGE`);
      log(JSON.stringify(r2, null, 2));
    }
  } catch (e: any) {
    log(`TEST 2: ✗ ${Date.now() - t2}ms — ERROR: ${e.message}`);
  }
}

main();
