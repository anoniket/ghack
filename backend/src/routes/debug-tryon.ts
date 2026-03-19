import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config';

const debugRouter = Router();

const HTML = `<!DOCTYPE html>
<html>
<head>
  <title>mrigAI — Try-On Debug</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #0d0d0d; color: #eee; padding: 20px; max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 16px; color: #E8C8A0; }
    .row { display: flex; gap: 16px; flex-wrap: wrap; }
    .col { flex: 1; min-width: 300px; }
    label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; margin-top: 12px; }
    textarea, select, input { width: 100%; padding: 10px; border: 1px solid #333; border-radius: 8px; background: #1a1a1a; color: #eee; font-size: 14px; }
    textarea { height: 100px; resize: vertical; }
    .drop-zone { border: 2px dashed #333; border-radius: 12px; padding: 40px 20px; text-align: center; color: #666; cursor: pointer; transition: border-color 0.2s; min-height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
    .drop-zone:hover, .drop-zone.dragover { border-color: #E8C8A0; color: #E8C8A0; }
    .drop-zone img { max-width: 200px; max-height: 200px; border-radius: 8px; }
    .drop-zone input[type=file] { display: none; }
    button { padding: 12px 24px; border: none; border-radius: 8px; background: #E8C8A0; color: #0d0d0d; font-weight: 700; font-size: 16px; cursor: pointer; margin-top: 16px; width: 100%; }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    button:hover:not(:disabled) { background: #d4b08c; }
    #status { margin-top: 12px; padding: 12px; border-radius: 8px; font-size: 13px; font-family: monospace; white-space: pre-wrap; max-height: 400px; overflow-y: auto; background: #111; border: 1px solid #222; }
    #status.error { border-color: #ef4444; color: #ef4444; }
    #status.success { border-color: #4ade80; color: #4ade80; }
    #result { margin-top: 16px; text-align: center; }
    #result img { max-width: 100%; max-height: 600px; border-radius: 12px; border: 2px solid #333; }
    .url-input { display: flex; gap: 8px; }
    .url-input input { flex: 1; }
    .url-input button { width: auto; margin-top: 0; font-size: 12px; padding: 8px 16px; }
    .or { text-align: center; color: #555; font-size: 12px; margin: 8px 0; }
  </style>
</head>
<body>
  <h1>mrigAI — Try-On Debug Console</h1>

  <div class="row">
    <div class="col">
      <label>Selfie</label>
      <div class="drop-zone" id="selfie-drop" onclick="document.getElementById('selfie-file').click()">
        <span>Drop image or click to upload</span>
        <input type="file" id="selfie-file" accept="image/*">
      </div>
      <div class="or">or paste URL</div>
      <div class="url-input">
        <input type="text" id="selfie-url" placeholder="https://...">
        <button onclick="loadUrl('selfie')">Load</button>
      </div>
    </div>

    <div class="col">
      <label>Product</label>
      <div class="drop-zone" id="product-drop" onclick="document.getElementById('product-file').click()">
        <span>Drop image or click to upload</span>
        <input type="file" id="product-file" accept="image/*">
      </div>
      <div class="or">or paste URL</div>
      <div class="url-input">
        <input type="text" id="product-url" placeholder="https://...">
        <button onclick="loadUrl('product')">Load</button>
      </div>
    </div>
  </div>

  <label>Prompt</label>
  <textarea id="prompt">Make the person in Image 1 wear the product from Image 2. Keep their exact face, body, and background. Show the product clearly.</textarea>

  <div class="row">
    <div class="col">
      <label>Model</label>
      <select id="model">
        <option value="gemini-2.5-flash-image">NB1 — gemini-2.5-flash-image</option>
        <option value="gemini-3.1-flash-image-preview">NB2 — gemini-3.1-flash-image-preview</option>
        <option value="gemini-3-pro-image-preview">Pro — gemini-3-pro-image-preview</option>
      </select>
    </div>
    <div class="col">
      <label>API Key</label>
      <select id="apikey">
        ${config.geminiApiKeys.map((k, i) => '<option value="' + k + '">Key ' + (i + 1) + ' (' + k.slice(-6) + ')</option>').join('')}
      </select>
    </div>
  </div>

  <button id="generate-btn" onclick="generate()">Generate Try-On</button>

  <div id="status"></div>
  <div id="result"></div>

  <script>
    let selfieB64 = null, productB64 = null;

    function setupDrop(id, type) {
      const zone = document.getElementById(id + '-drop');
      const fileInput = document.getElementById(id + '-file');

      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0], id);
      });
      fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0], id); });
    }

    function handleFile(file, type) {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result.split(',')[1];
        if (type === 'selfie') selfieB64 = b64; else productB64 = b64;
        const zone = document.getElementById(type + '-drop');
        zone.innerHTML = '<img src="' + reader.result + '">';
      };
      reader.readAsDataURL(file);
    }

    async function loadUrl(type) {
      const url = document.getElementById(type + '-url').value.trim();
      if (!url) return;
      log('Downloading ' + type + ' from URL...');
      try {
        const resp = await fetch('/debug/proxy-image?url=' + encodeURIComponent(url));
        const data = await resp.json();
        if (data.error) { log('ERROR: ' + data.error); return; }
        if (type === 'selfie') selfieB64 = data.base64; else productB64 = data.base64;
        const zone = document.getElementById(type + '-drop');
        zone.innerHTML = '<img src="data:' + data.mime + ';base64,' + data.base64 + '">';
        log(type + ' loaded: ' + (data.base64.length / 1024).toFixed(0) + 'KB base64, mime=' + data.mime);
      } catch (e) { log('ERROR: ' + e.message); }
    }

    function log(msg) {
      const el = document.getElementById('status');
      el.className = '';
      el.textContent += '[' + new Date().toLocaleTimeString() + '] ' + msg + '\\n';
      el.scrollTop = el.scrollHeight;
    }

    async function generate() {
      if (!selfieB64 || !productB64) { log('ERROR: Upload both images first'); return; }

      const btn = document.getElementById('generate-btn');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      document.getElementById('result').innerHTML = '';
      document.getElementById('status').textContent = '';

      const prompt = document.getElementById('prompt').value;
      const model = document.getElementById('model').value;
      const apikey = document.getElementById('apikey').value;

      log('Model: ' + model);
      log('Prompt: ' + prompt.slice(0, 100) + '...');
      log('Selfie: ' + (selfieB64.length / 1024).toFixed(0) + 'KB base64');
      log('Product: ' + (productB64.length / 1024).toFixed(0) + 'KB base64');
      log('Sending to Gemini...');

      const t0 = Date.now();
      try {
        const resp = await fetch('/debug/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selfieB64, productB64, prompt, model, apikey }),
        });
        const data = await resp.json();
        const elapsed = Date.now() - t0;

        if (data.error) {
          log('ERROR (' + elapsed + 'ms): ' + data.error);
          if (data.raw) log('RAW RESPONSE:\\n' + data.raw);
          document.getElementById('status').className = 'error';
        } else {
          log('SUCCESS (' + elapsed + 'ms)');
          log('Image base64 length: ' + data.imageBase64.length);
          if (data.text) log('Model text: ' + data.text);
          document.getElementById('status').className = 'success';
          document.getElementById('result').innerHTML = '<img src="data:image/png;base64,' + data.imageBase64 + '">';
        }
      } catch (e) {
        log('FETCH ERROR (' + (Date.now() - t0) + 'ms): ' + e.message);
        document.getElementById('status').className = 'error';
      }

      btn.disabled = false;
      btn.textContent = 'Generate Try-On';
    }

    setupDrop('selfie', 'selfie');
    setupDrop('product', 'product');
  </script>
</body>
</html>`;

// Serve the debug UI
debugRouter.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(HTML);
});

// Proxy image download (for URL loading in browser)
debugRouter.get('/proxy-image', async (req: Request, res: Response) => {
  const url = req.query.url as string;
  if (!url) { res.json({ error: 'No URL' }); return; }
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    const buffer = Buffer.from(await resp.arrayBuffer());
    const base64 = buffer.toString('base64');
    // Detect mime
    let mime = 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) mime = 'image/png';
    else if (buffer[0] === 0x52 && buffer[1] === 0x49) mime = 'image/webp';
    else if (buffer[0] === 0xFF && buffer[1] === 0xD8) mime = 'image/jpeg';
    res.json({ base64, mime, size: buffer.length });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

// Generate — raw Gemini call, no timeout, full error logging
debugRouter.post('/generate', express.json({ limit: '50mb' }), async (req: Request, res: Response) => {
  const { selfieB64, productB64, prompt, model, apikey } = req.body;

  if (!selfieB64 || !productB64 || !prompt || !model || !apikey) {
    res.json({ error: 'Missing fields' });
    return;
  }

  const ai = new GoogleGenAI({ apiKey: apikey });

  // Detect mime types
  function detectMime(b64: string): string {
    const buf = Buffer.from(b64.slice(0, 16), 'base64');
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
    return 'image/jpeg';
  }

  const selfieMime = detectMime(selfieB64);
  const productMime = detectMime(productB64);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: selfieMime, data: selfieB64 } },
            { inlineData: { mimeType: productMime, data: productB64 } },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'] as any,
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

    // Extract image and text from response
    const parts = response.candidates?.[0]?.content?.parts || [];
    let imageBase64: string | null = null;
    let text = '';
    for (const part of parts) {
      if ((part as any).inlineData) {
        imageBase64 = (part as any).inlineData.data;
      }
      if ((part as any).text) {
        text += (part as any).text;
      }
    }

    if (imageBase64) {
      res.json({ imageBase64, text });
    } else {
      res.json({ error: 'No image returned', raw: JSON.stringify(response, null, 2) });
    }
  } catch (e: any) {
    res.json({ error: e.message, raw: JSON.stringify(e, null, 2).slice(0, 5000) });
  }
});

// Need to import express for the json middleware
import express from 'express';

export { debugRouter };
