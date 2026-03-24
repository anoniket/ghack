import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config';

const router = Router();

// All available keys for selection
const keys = config.geminiApiKeys;

const MODELS = [
  { id: 'gemini-2.5-flash-image', name: 'Nano Banana (NB1)' },
  { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2 (NB2)' },
  { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' },
];

const DEFAULT_PROMPT = `Make the person in Image 1 wear the product from Image 2. Keep their exact face, body, and background. Show the product clearly.`;

// Serve the playground HTML
router.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>mrigAI — Try-On Playground</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d0d0d; color: #e0e0e0; padding: 20px; }
  h1 { color: #E8C8A0; margin-bottom: 20px; font-size: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 1200px; }
  .panel { background: #1a1a1a; border-radius: 12px; padding: 20px; }
  label { display: block; font-size: 13px; color: #888; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  textarea { width: 100%; background: #111; color: #e0e0e0; border: 1px solid #333; border-radius: 8px; padding: 12px; font-size: 14px; resize: vertical; font-family: monospace; }
  select, input[type="text"] { width: 100%; background: #111; color: #e0e0e0; border: 1px solid #333; border-radius: 8px; padding: 10px; font-size: 14px; }
  .drop-zone { border: 2px dashed #333; border-radius: 12px; padding: 40px 20px; text-align: center; cursor: pointer; transition: border-color 0.2s; min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
  .drop-zone:hover, .drop-zone.drag-over { border-color: #E8C8A0; }
  .drop-zone img { max-width: 100%; max-height: 300px; border-radius: 8px; }
  .drop-zone input[type="file"] { display: none; }
  .drop-zone .or { color: #555; margin: 10px 0; font-size: 12px; }
  .url-input { margin-top: 10px; width: 100%; }
  button.generate { width: 100%; padding: 14px; background: #E8C8A0; color: #0d0d0d; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 16px; }
  button.generate:hover { background: #d4b48a; }
  button.generate:disabled { background: #555; cursor: not-allowed; color: #888; }
  .result-panel { grid-column: 1 / -1; }
  .result-img { max-width: 100%; border-radius: 12px; margin-top: 12px; }
  .log { background: #0a0a0a; border: 1px solid #222; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin-top: 12px; }
  .log .info { color: #4ade80; }
  .log .error { color: #ef4444; }
  .log .warn { color: #fbbf24; }
  .log .time { color: #60a5fa; }
  .status { padding: 8px 16px; border-radius: 8px; font-size: 14px; margin-top: 12px; display: none; }
  .status.loading { display: block; background: #1a1a00; color: #fbbf24; }
  .status.success { display: block; background: #001a00; color: #4ade80; }
  .status.error { display: block; background: #1a0000; color: #ef4444; }
  .row { display: flex; gap: 12px; margin-bottom: 16px; }
  .row > * { flex: 1; }
  .mb { margin-bottom: 16px; }
</style>
</head>
<body>
<h1>mrigAI Try-On Playground</h1>
<div class="grid">
  <div class="panel">
    <label>Selfie (Image 1)</label>
    <div class="drop-zone" id="selfie-zone">
      <div id="selfie-placeholder">Drop image here or click to upload</div>
      <img id="selfie-preview" style="display:none">
      <input type="file" id="selfie-input" accept="image/*">
      <div class="or">— or paste URL —</div>
      <input type="text" class="url-input" id="selfie-url" placeholder="https://...">
    </div>
  </div>
  <div class="panel">
    <label>Product (Image 2)</label>
    <div class="drop-zone" id="product-zone">
      <div id="product-placeholder">Drop image here or click to upload</div>
      <img id="product-preview" style="display:none">
      <input type="file" id="product-input" accept="image/*">
      <div class="or">— or paste URL —</div>
      <input type="text" class="url-input" id="product-url" placeholder="https://...">
    </div>
  </div>
  <div class="panel" style="grid-column: 1 / -1;">
    <div class="row">
      <div>
        <label>Model</label>
        <select id="model-select">
          ${MODELS.map(m => `<option value="${m.id}" ${m.id === 'gemini-2.5-flash-image' ? 'selected' : ''}>${m.name} (${m.id})</option>`).join('')}
        </select>
      </div>
      <div>
        <label>API Key (#${keys.length} available)</label>
        <select id="key-select">
          ${keys.map((k, i) => `<option value="${i}">Key ${i + 1} (${k.slice(-6)})</option>`).join('')}
        </select>
      </div>
    </div>
    <label>Prompt</label>
    <textarea id="prompt" rows="4">${DEFAULT_PROMPT}</textarea>
    <button class="generate" id="gen-btn">Generate Try-On</button>
    <div class="status" id="status"></div>
  </div>
  <div class="panel result-panel">
    <label>Result</label>
    <img id="result-img" class="result-img" style="display:none">
    <div class="log" id="log"></div>
  </div>
</div>
<script>
let selfieB64 = null, productB64 = null;

function log(msg, cls = 'info') {
  const el = document.getElementById('log');
  const ts = new Date().toISOString().slice(11, 23);
  el.innerHTML += '<span class="time">[' + ts + ']</span> <span class="' + cls + '">' + msg + '</span>\\n';
  el.scrollTop = el.scrollHeight;
}

function setStatus(msg, cls) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + cls;
}

// File upload handlers
['selfie', 'product'].forEach(type => {
  const zone = document.getElementById(type + '-zone');
  const input = document.getElementById(type + '-input');
  const preview = document.getElementById(type + '-preview');
  const placeholder = document.getElementById(type + '-placeholder');

  input.addEventListener('change', e => {
    if (e.target.files[0]) loadFile(e.target.files[0], type);
  });

  const urlInput = document.getElementById(type + '-url');
  zone.addEventListener('click', e => {
    if (e.target === urlInput) return;
    input.click();
  });
  urlInput.addEventListener('change', () => loadFromUrl(type));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0], type);
  });
});

function loadFile(file, type) {
  const reader = new FileReader();
  reader.onload = () => {
    const b64 = reader.result.split(',')[1];
    if (type === 'selfie') selfieB64 = b64; else productB64 = b64;
    const preview = document.getElementById(type + '-preview');
    const placeholder = document.getElementById(type + '-placeholder');
    preview.src = reader.result;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    log(type + ' loaded from file (' + (b64.length / 1024).toFixed(0) + 'KB base64)');
  };
  reader.readAsDataURL(file);
}

async function loadFromUrl(type) {
  const url = document.getElementById(type + '-url').value.trim();
  if (!url) return;
  log(type + ' downloading from URL...');
  try {
    const resp = await fetch('/playground/proxy-image?url=' + encodeURIComponent(url));
    if (!resp.ok) throw new Error('Download failed: ' + resp.status);
    const data = await resp.json();
    if (type === 'selfie') selfieB64 = data.base64; else productB64 = data.base64;
    const preview = document.getElementById(type + '-preview');
    const placeholder = document.getElementById(type + '-placeholder');
    preview.src = 'data:' + data.mimeType + ';base64,' + data.base64;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    log(type + ' loaded from URL (' + (data.base64.length / 1024).toFixed(0) + 'KB base64)');
  } catch (err) {
    log(type + ' URL load failed: ' + err.message, 'error');
  }
}

async function generate() {
  if (!selfieB64 || !productB64) { log('Upload both images first', 'error'); return; }
  const btn = document.getElementById('gen-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  document.getElementById('result-img').style.display = 'none';
  setStatus('Generating... no timeout, waiting for Gemini', 'loading');

  const model = document.getElementById('model-select').value;
  const keyIndex = document.getElementById('key-select').value;
  const prompt = document.getElementById('prompt').value;

  log('--- NEW GENERATION ---');
  log('Model: ' + model);
  log('Key: #' + (parseInt(keyIndex) + 1));
  log('Prompt: ' + prompt.slice(0, 100) + '...');
  log('Selfie: ' + (selfieB64.length / 1024).toFixed(0) + 'KB, Product: ' + (productB64.length / 1024).toFixed(0) + 'KB');
  log('Sending request...');

  const t0 = Date.now();
  try {
    const resp = await fetch('/playground/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selfieBase64: selfieB64, productBase64: productB64, model, keyIndex: parseInt(keyIndex), prompt }),
    });
    const data = await resp.json();
    const elapsed = Date.now() - t0;

    if (data.error) {
      log('FAILED in ' + elapsed + 'ms', 'error');
      log('Error: ' + data.error, 'error');
      if (data.raw) log('Raw response:\\n' + data.raw, 'warn');
      setStatus('Failed in ' + (elapsed / 1000).toFixed(1) + 's — ' + data.error, 'error');
    } else {
      log('SUCCESS in ' + elapsed + 'ms — image base64 len=' + data.resultBase64.length, 'info');
      if (data.uploadMs) log('File API upload: ' + data.uploadMs + 'ms');
      if (data.genMs) log('Gemini generation: ' + data.genMs + 'ms');
      const img = document.getElementById('result-img');
      img.src = 'data:image/png;base64,' + data.resultBase64;
      img.style.display = 'block';
      setStatus('Done in ' + (elapsed / 1000).toFixed(1) + 's', 'success');
    }
  } catch (err) {
    const elapsed = Date.now() - t0;
    log('REQUEST FAILED in ' + elapsed + 'ms: ' + err.message, 'error');
    setStatus('Request failed — ' + err.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Generate Try-On';
}
document.getElementById('gen-btn').addEventListener('click', generate);
</script>
</body>
</html>`);
});

// Proxy image download (for URL input)
router.get('/proxy-image', async (req: Request, res: Response) => {
  const url = req.query.url as string;
  if (!url) { res.status(400).json({ error: 'url required' }); return; }
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    const buffer = Buffer.from(await resp.arrayBuffer());
    const base64 = buffer.toString('base64');
    // Detect mime
    let mimeType = 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) mimeType = 'image/png';
    else if (buffer[0] === 0x52 && buffer[1] === 0x49) mimeType = 'image/webp';
    else if (buffer[0] === 0xFF && buffer[1] === 0xD8) mimeType = 'image/jpeg';
    res.json({ base64, mimeType, size: buffer.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate endpoint — no timeout, full error logging
router.post('/generate', async (req: Request, res: Response) => {
  const { selfieBase64, productBase64, model, keyIndex, prompt } = req.body;
  if (!selfieBase64 || !productBase64) {
    res.status(400).json({ error: 'Both images required' });
    return;
  }

  const key = keys[keyIndex] || keys[0];
  const client = new GoogleGenAI({ apiKey: key });

  // Detect mime types
  function detectMime(b64: string): string {
    const buf = Buffer.from(b64.slice(0, 16), 'base64');
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
    return 'image/jpeg';
  }

  const selfieMime = detectMime(selfieBase64);
  const productMime = detectMime(productBase64);

  try {
    // Minimal config — matching Google's official example exactly
    // Just model + contents with inlineData, no extra config bloat
    const genStart = Date.now();
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          text: prompt,
        },
        {
          inlineData: { mimeType: selfieMime, data: selfieBase64 },
        },
        {
          inlineData: { mimeType: productMime, data: productBase64 },
        },
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      } as any,
    });
    const genMs = Date.now() - genStart;
    const uploadMs = 0;

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if ((part as any).inlineData) {
          console.log(`[Playground] Success: ${genMs}ms, base64 len=${(part as any).inlineData.data.length}`);
          res.json({ resultBase64: (part as any).inlineData.data, uploadMs, genMs });
          return;
        }
      }
    }

    // No image returned
    const raw = JSON.stringify(response, null, 2);
    console.log(`[Playground] No image: ${genMs}ms\n${raw.slice(0, 2000)}`);
    res.json({ error: 'No image returned', raw: raw.slice(0, 5000), uploadMs, genMs });
  } catch (err: any) {
    console.error(`[Playground] Error:`, err.message);
    res.json({ error: err.message, raw: JSON.stringify(err, null, 2).slice(0, 5000) });
  }
});

export const playgroundRouter = router;
