import { Router, Request, Response } from 'express';
import { classifyProduct, getPromptForCategory, describeSelfie, PRODUCT_CATEGORIES, type ProductCategory } from '../services/classifier';
import { generateTryOnV2, downloadImageToBase64 } from '../services/gemini';

const router = Router();

// ── GET /pipeline/categories — return all categories and their prompts ──
router.get('/categories', (_req: Request, res: Response) => {
  const categories = PRODUCT_CATEGORIES.map(name => ({
    name,
    prompt: getPromptForCategory(name),
  }));
  res.json({ categories });
});

// ── GET /pipeline/proxy-image — proxy external product images ──
router.get('/proxy-image', async (req: Request, res: Response) => {
  const url = req.query.url as string;
  if (!url) { res.status(400).json({ error: 'url required' }); return; }
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    const buffer = Buffer.from(await resp.arrayBuffer());
    const base64 = buffer.toString('base64');
    let mimeType = 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) mimeType = 'image/png';
    else if (buffer[0] === 0x52 && buffer[1] === 0x49) mimeType = 'image/webp';
    else if (buffer[0] === 0xFF && buffer[1] === 0xD8) mimeType = 'image/jpeg';
    res.json({ base64, mimeType, size: buffer.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /pipeline/classify — classify product only ──
router.post('/classify', async (req: Request, res: Response) => {
  const { productBase64, productImageUrl } = req.body;
  let base64 = productBase64;
  try {
    if (!base64 && productImageUrl) {
      base64 = await downloadImageToBase64(productImageUrl);
    }
    if (!base64) {
      res.status(400).json({ error: 'productBase64 or productImageUrl required' });
      return;
    }
    const t0 = Date.now();
    const { category, description } = await classifyProduct(base64);
    const durationMs = Date.now() - t0;
    const prompt = getPromptForCategory(category, undefined, description);
    res.json({ category, description, prompt, cached: false, durationMs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /pipeline/generate — full pipeline with SSE streaming ──
router.post('/generate', async (req: Request, res: Response) => {
  const { selfieBase64, productBase64, productImageUrl, selfieDescription } = req.body;

  // Set up SSE — disable compression so events stream in real-time
  (req as any).headers['accept-encoding'] = 'identity';
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none');
  res.flushHeaders();

  function sendEvent(data: any) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === 'function') (res as any).flush();
  }

  try {
    // Resolve product base64
    let resolvedProductBase64 = productBase64;
    if (!resolvedProductBase64 && productImageUrl) {
      resolvedProductBase64 = await downloadImageToBase64(productImageUrl);
    }
    if (!selfieBase64 || !resolvedProductBase64) {
      sendEvent({ step: 'error', message: 'Both selfie and product image required' });
      res.end();
      return;
    }

    // Step 0.5: Describe selfie (if not provided by client)
    const selfieDesc = selfieDescription || await describeSelfie(selfieBase64);

    // Step 1: Classify
    sendEvent({ step: 'classify_start' });
    const classifyT0 = Date.now();
    const { category, description: productDesc } = await classifyProduct(resolvedProductBase64);
    const classifyDurationMs = Date.now() - classifyT0;
    const prompt = getPromptForCategory(category, selfieDesc, productDesc);
    sendEvent({
      step: 'classify_done',
      category,
      productDescription: productDesc,
      prompt,
      cached: false,
      durationMs: classifyDurationMs,
    });

    // Step 2: Generate with category-specific prompt
    const model = 'gemini-2.5-flash-image';
    sendEvent({ step: 'generate_start', model });
    const genT0 = Date.now();
    const resultBase64 = await generateTryOnV2(selfieBase64, resolvedProductBase64, false, prompt);
    const genDurationMs = Date.now() - genT0;
    sendEvent({
      step: 'generate_done',
      resultBase64,
      durationMs: genDurationMs,
    });
  } catch (err: any) {
    sendEvent({ step: 'error', message: err.message || 'Unknown error' });
  }

  res.end();
});

// ── GET /pipeline — serve the HTML dashboard ──
router.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>mrigAI — Try-On Pipeline Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a26;
    --accent: #6cff7a;
    --accent-dim: #3a9944;
    --text: #e8e6f0;
    --text-dim: #8a889a;
    --text-dimmer: #55546a;
    --border: #2a2a3a;
    --border-light: #3a3a50;
    --red: #ff5c5c;
    --orange: #ffaa44;
    --blue: #5ca0ff;
    --purple: #a77bff;
    --font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    --font-mono: 'Space Mono', 'Courier New', monospace;
    --radius: 12px;
    --radius-sm: 8px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-size: 15px; }
  body {
    font-family: var(--font-body);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    line-height: 1.5;
  }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-light); }

  /* ── Layout ── */
  .container {
    max-width: 1280px;
    margin: 0 auto;
    padding: 28px 24px 60px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
  }
  header h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
  }
  header h1 span { color: var(--accent); }
  header .subtitle {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin-left: 14px;
    font-family: var(--font-mono);
  }
  .header-left { display: flex; align-items: baseline; gap: 4px; }
  .btn-sidebar-toggle {
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    transition: all 0.2s;
  }
  .btn-sidebar-toggle:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* ── Input Section ── */
  .input-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }
  @media (max-width: 700px) {
    .input-section { grid-template-columns: 1fr; }
  }
  .upload-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    transition: border-color 0.2s;
  }
  .upload-card:hover { border-color: var(--border-light); }
  .upload-card .label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    margin-bottom: 12px;
  }
  .drop-zone {
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    min-height: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.25s;
    position: relative;
    overflow: hidden;
  }
  .drop-zone:hover, .drop-zone.drag-over {
    border-color: var(--accent);
    background: rgba(108,255,122,0.03);
  }
  .drop-zone input[type="file"] { display: none; }
  .drop-zone .icon {
    font-size: 2.2rem;
    margin-bottom: 8px;
    opacity: 0.4;
  }
  .drop-zone .hint {
    font-size: 0.8rem;
    color: var(--text-dimmer);
  }
  .drop-zone .hint-bold {
    color: var(--accent);
    font-weight: 600;
  }
  .drop-zone img.preview-img {
    max-width: 100%;
    max-height: 260px;
    border-radius: var(--radius-sm);
    object-fit: contain;
  }
  .drop-zone .preview-overlay {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: rgba(10,10,15,0.8);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    padding: 4px 8px;
    border-radius: 4px;
  }
  .url-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }
  .url-row .or-text {
    font-size: 0.7rem;
    color: var(--text-dimmer);
    flex-shrink: 0;
  }
  .url-row input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--text);
    font-size: 0.8rem;
    font-family: var(--font-mono);
    outline: none;
    transition: border-color 0.2s;
  }
  .url-row input:focus { border-color: var(--accent); }

  /* ── Generate Button ── */
  .generate-row { margin-bottom: 28px; }
  .btn-generate {
    width: 100%;
    padding: 16px;
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: var(--radius);
    font-family: var(--font-body);
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.02em;
    transition: all 0.2s;
  }
  .btn-generate:hover { background: #7fff8c; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(108,255,122,0.25); }
  .btn-generate:active { transform: translateY(0); }
  .btn-generate:disabled {
    background: var(--surface2);
    color: var(--text-dimmer);
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  /* ── Pipeline Section ── */
  .pipeline-section {
    display: none;
    margin-bottom: 32px;
  }
  .pipeline-section.active { display: block; }
  .pipeline-section .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dimmer);
    margin-bottom: 16px;
  }
  .pipeline-flow {
    display: flex;
    gap: 0;
    align-items: stretch;
  }
  @media (max-width: 700px) {
    .pipeline-flow { flex-direction: column; }
    .pipeline-arrow { transform: rotate(90deg); align-self: center; }
  }
  .pipeline-card {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 22px;
    position: relative;
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .pipeline-card.active-step {
    border-color: var(--accent);
    box-shadow: 0 0 24px rgba(108,255,122,0.08);
  }
  .pipeline-card.done-step {
    border-color: var(--accent-dim);
  }
  .pipeline-card.error-step {
    border-color: var(--red);
    box-shadow: 0 0 24px rgba(255,92,92,0.08);
  }
  .pipeline-card .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .pipeline-card .card-title {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .pipeline-card .step-badge {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--surface2);
    color: var(--text-dimmer);
  }
  .pipeline-card .card-body {
    min-height: 60px;
  }

  /* Spinner */
  .spinner-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    width: 22px; height: 22px;
    border: 2.5px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  .spinner-text {
    font-size: 0.8rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }
  .elapsed-timer {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--orange);
    margin-left: auto;
  }

  /* Category badge */
  .category-badge {
    display: inline-block;
    padding: 6px 16px;
    border-radius: 6px;
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.9rem;
    letter-spacing: 0.06em;
    margin-bottom: 10px;
  }
  .category-badge.footwear { background: #1a2e1a; color: #7fff7f; }
  .category-badge.top { background: #1a1a2e; color: #7f7fff; }
  .category-badge.bottom { background: #2e1a2e; color: #ff7fff; }
  .category-badge.full_outfit { background: #2e2e1a; color: #ffff7f; }
  .category-badge.ring { background: #2e261a; color: #ffd77f; }
  .category-badge.bracelet { background: #1a2e2e; color: #7fffff; }
  .category-badge.earring { background: #2e1a26; color: #ff7fcc; }
  .category-badge.necklace { background: #261a2e; color: #d77fff; }
  .category-badge.sunglasses { background: #2e2a1a; color: #ffee7f; }
  .category-badge.bag { background: #1a2620; color: #7fffc0; }
  .category-badge.belt { background: #26201a; color: #ffc07f; }
  .category-badge.dupatta { background: #201a26; color: #c07fff; }

  .duration-tag {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--blue);
    margin-left: 10px;
  }

  /* Collapsible prompt */
  .prompt-toggle {
    font-size: 0.7rem;
    color: var(--accent);
    cursor: pointer;
    font-family: var(--font-mono);
    background: none;
    border: none;
    padding: 4px 0;
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .prompt-toggle:hover { text-decoration: underline; }
  .prompt-toggle .arrow { transition: transform 0.2s; display: inline-block; }
  .prompt-toggle .arrow.open { transform: rotate(90deg); }
  .prompt-box {
    display: none;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 14px;
    margin-top: 10px;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    line-height: 1.6;
    color: var(--text-dim);
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .prompt-box.open { display: block; }

  /* Pipeline arrow */
  .pipeline-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    flex-shrink: 0;
    color: var(--border);
    font-size: 1.4rem;
    transition: color 0.3s;
  }
  .pipeline-arrow.lit { color: var(--accent); }

  /* ── Timing Bar ── */
  .timing-bar-container {
    margin-top: 16px;
    display: none;
  }
  .timing-bar-container.active { display: block; }
  .timing-bar-label {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--text-dimmer);
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
  }
  .timing-bar {
    height: 8px;
    background: var(--surface);
    border-radius: 4px;
    overflow: hidden;
    display: flex;
  }
  .timing-bar .seg-classify {
    background: var(--purple);
    transition: width 0.5s ease;
  }
  .timing-bar .seg-generate {
    background: var(--accent);
    transition: width 0.5s ease;
  }
  .timing-legend {
    display: flex;
    gap: 16px;
    margin-top: 6px;
  }
  .timing-legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--text-dim);
  }
  .timing-legend-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
  }

  /* ── Result Section ── */
  .result-section {
    display: none;
    margin-bottom: 32px;
  }
  .result-section.active { display: block; }
  .result-section .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dimmer);
    margin-bottom: 16px;
  }
  .result-image-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    text-align: center;
    margin-bottom: 20px;
  }
  .result-image-wrap img {
    max-width: 100%;
    max-height: 500px;
    border-radius: var(--radius-sm);
    object-fit: contain;
  }
  .comparison-strip {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    margin-bottom: 20px;
  }
  @media (max-width: 700px) {
    .comparison-strip { grid-template-columns: 1fr; }
  }
  .comparison-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    text-align: center;
  }
  .comparison-card .comp-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dimmer);
    margin-bottom: 8px;
  }
  .comparison-card img {
    max-width: 100%;
    max-height: 240px;
    border-radius: var(--radius-sm);
    object-fit: contain;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
  }
  .stat-card .stat-label {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dimmer);
    margin-bottom: 4px;
  }
  .stat-card .stat-value {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text);
  }

  /* ── History ── */
  .history-section {
    margin-bottom: 32px;
  }
  .history-section .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dimmer);
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .btn-clear-history {
    font-size: 0.65rem;
    color: var(--red);
    background: none;
    border: 1px solid transparent;
    cursor: pointer;
    font-family: var(--font-mono);
    padding: 2px 8px;
    border-radius: 4px;
    transition: all 0.2s;
  }
  .btn-clear-history:hover { border-color: var(--red); }
  .history-strip {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .history-item {
    flex-shrink: 0;
    width: 120px;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    transition: border-color 0.2s, transform 0.2s;
  }
  .history-item:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }
  .history-item img {
    width: 100%;
    height: 100px;
    object-fit: cover;
  }
  .history-item .history-meta {
    padding: 6px 8px;
  }
  .history-item .history-category {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .history-item .history-time {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    color: var(--text-dimmer);
  }

  /* ── Category Sidebar ── */
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 999;
  }
  .sidebar-overlay.open { display: block; }
  .sidebar {
    position: fixed;
    top: 0;
    right: -460px;
    width: 440px;
    max-width: 92vw;
    height: 100vh;
    background: var(--surface);
    border-left: 1px solid var(--border);
    z-index: 1000;
    overflow-y: auto;
    transition: right 0.3s ease;
    padding: 24px;
  }
  .sidebar.open { right: 0; }
  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }
  .sidebar-header h2 {
    font-size: 1rem;
    font-weight: 700;
  }
  .btn-close-sidebar {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    width: 32px; height: 32px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  .btn-close-sidebar:hover { border-color: var(--red); color: var(--red); }
  .sidebar-category {
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .sidebar-category.highlighted { border-color: var(--accent); }
  .sidebar-cat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    cursor: pointer;
    background: var(--surface2);
    transition: background 0.2s;
  }
  .sidebar-cat-header:hover { background: var(--border); }
  .sidebar-cat-name {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .sidebar-cat-arrow {
    font-size: 0.7rem;
    color: var(--text-dimmer);
    transition: transform 0.2s;
  }
  .sidebar-cat-arrow.open { transform: rotate(90deg); }
  .sidebar-cat-body {
    display: none;
    padding: 14px;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    line-height: 1.7;
    color: var(--text-dim);
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--bg);
  }
  .sidebar-cat-body.open { display: block; }

  /* ── Error display ── */
  .error-box {
    background: rgba(255,92,92,0.08);
    border: 1px solid var(--red);
    border-radius: var(--radius-sm);
    padding: 14px 18px;
    color: var(--red);
    font-size: 0.85rem;
    margin-top: 10px;
  }

  /* ── Animations ── */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .fade-in { animation: fadeIn 0.35s ease forwards; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .pulse { animation: pulse 1.5s ease-in-out infinite; }
</style>
</head>
<body>
<div class="container">
  <!-- Header -->
  <header>
    <div class="header-left">
      <h1>mrig<span>AI</span></h1>
      <span class="subtitle">Pipeline Dashboard</span>
    </div>
    <button class="btn-sidebar-toggle" onclick="toggleSidebar()">Category Prompts</button>
  </header>

  <!-- Input Section -->
  <div class="input-section">
    <div class="upload-card">
      <div class="label">Upload Selfie</div>
      <div class="drop-zone" id="selfie-zone" onclick="document.getElementById('selfie-input').click()">
        <div id="selfie-placeholder">
          <div class="icon">&#128247;</div>
          <div class="hint">Drop image or <span class="hint-bold">click to upload</span></div>
        </div>
        <img class="preview-img" id="selfie-preview" style="display:none">
        <div class="preview-overlay" id="selfie-size" style="display:none"></div>
        <input type="file" id="selfie-input" accept="image/*">
      </div>
    </div>
    <div class="upload-card">
      <div class="label">Upload Product Image</div>
      <div class="drop-zone" id="product-zone" onclick="handleProductZoneClick(event)">
        <div id="product-placeholder">
          <div class="icon">&#128090;</div>
          <div class="hint">Drop image or <span class="hint-bold">click to upload</span></div>
        </div>
        <img class="preview-img" id="product-preview" style="display:none">
        <div class="preview-overlay" id="product-size" style="display:none"></div>
        <input type="file" id="product-input" accept="image/*">
      </div>
      <div class="url-row">
        <span class="or-text">or URL</span>
        <input type="text" id="product-url" placeholder="https://example.com/product.jpg" onkeydown="if(event.key==='Enter')loadProductFromUrl()">
      </div>
    </div>
  </div>

  <!-- Generate Button -->
  <div class="generate-row">
    <button class="btn-generate" id="gen-btn" onclick="startPipeline()">Generate Try-On</button>
  </div>

  <!-- Pipeline Visualization -->
  <div class="pipeline-section" id="pipeline-section">
    <div class="section-title">Pipeline Execution</div>
    <div class="pipeline-flow">
      <!-- Step 1: Classify -->
      <div class="pipeline-card" id="step-classify">
        <div class="card-header">
          <span class="card-title">Classifying Product</span>
          <span class="step-badge">STEP 1</span>
        </div>
        <div class="card-body" id="classify-body">
          <div class="spinner-row" id="classify-spinner" style="display:none">
            <div class="spinner"></div>
            <span class="spinner-text">Analyzing product image...</span>
          </div>
          <div id="classify-result" style="display:none"></div>
          <div id="classify-error" style="display:none"></div>
        </div>
      </div>

      <!-- Arrow -->
      <div class="pipeline-arrow" id="pipe-arrow">&#8594;</div>

      <!-- Step 2: Generate -->
      <div class="pipeline-card" id="step-generate">
        <div class="card-header">
          <span class="card-title">Generating Try-On</span>
          <span class="step-badge">STEP 2</span>
        </div>
        <div class="card-body" id="generate-body">
          <div class="spinner-row" id="generate-spinner" style="display:none">
            <div class="spinner"></div>
            <span class="spinner-text">Generating image...</span>
            <span class="elapsed-timer" id="gen-elapsed">0.0s</span>
          </div>
          <div id="generate-result" style="display:none"></div>
          <div id="generate-error" style="display:none"></div>
        </div>
      </div>
    </div>

    <!-- Timing Bar -->
    <div class="timing-bar-container" id="timing-container">
      <div class="timing-bar-label">
        <span>Timing Breakdown</span>
        <span id="timing-total"></span>
      </div>
      <div class="timing-bar">
        <div class="seg-classify" id="seg-classify" style="width:0%"></div>
        <div class="seg-generate" id="seg-generate" style="width:0%"></div>
      </div>
      <div class="timing-legend">
        <div class="timing-legend-item">
          <div class="timing-legend-dot" style="background:var(--purple)"></div>
          <span>Classify <span id="legend-classify-ms"></span></span>
        </div>
        <div class="timing-legend-item">
          <div class="timing-legend-dot" style="background:var(--accent)"></div>
          <span>Generate <span id="legend-generate-ms"></span></span>
        </div>
      </div>
    </div>
  </div>

  <!-- Result Section -->
  <div class="result-section" id="result-section">
    <div class="section-title">Result</div>
    <div class="result-image-wrap">
      <img id="result-image" src="">
    </div>
    <div class="comparison-strip">
      <div class="comparison-card">
        <div class="comp-label">Selfie</div>
        <img id="comp-selfie" src="">
      </div>
      <div class="comparison-card">
        <div class="comp-label">Product</div>
        <img id="comp-product" src="">
      </div>
      <div class="comparison-card">
        <div class="comp-label">Result</div>
        <img id="comp-result" src="">
      </div>
    </div>
    <div class="stats-grid" id="stats-grid"></div>
  </div>

  <!-- History -->
  <div class="history-section" id="history-section" style="display:none">
    <div class="section-title">
      <span>Recent Generations</span>
      <button class="btn-clear-history" onclick="clearHistory()">Clear</button>
    </div>
    <div class="history-strip" id="history-strip"></div>
  </div>
</div>

<!-- Category Prompts Sidebar -->
<div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleSidebar()"></div>
<div class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <h2>Category Prompts</h2>
    <button class="btn-close-sidebar" onclick="toggleSidebar()">&#10005;</button>
  </div>
  <div id="sidebar-categories"></div>
</div>

<script>
// ── State ──
let selfieB64 = null;
let productB64 = null;
let productUrl = null;
let allCategories = [];
let detectedCategory = null;

// ── File Upload Handlers ──
function setupDropZone(zoneId, inputId, previewId, placeholderId, sizeId, type) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const placeholder = document.getElementById(placeholderId);
  const sizeEl = document.getElementById(sizeId);

  input.addEventListener('change', e => {
    if (e.target.files[0]) loadFile(e.target.files[0], type, preview, placeholder, sizeEl);
  });

  zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0], type, preview, placeholder, sizeEl);
  });
}

function loadFile(file, type, preview, placeholder, sizeEl) {
  const reader = new FileReader();
  reader.onload = () => {
    const b64 = reader.result.split(',')[1];
    if (type === 'selfie') { selfieB64 = b64; }
    else { productB64 = b64; productUrl = null; }
    preview.src = reader.result;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    sizeEl.textContent = (b64.length / 1024).toFixed(0) + ' KB';
    sizeEl.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function handleProductZoneClick(e) {
  const urlInput = document.getElementById('product-url');
  if (e.target === urlInput || urlInput.contains(e.target)) return;
  document.getElementById('product-input').click();
}

async function loadProductFromUrl() {
  const url = document.getElementById('product-url').value.trim();
  if (!url) return;
  try {
    const resp = await fetch('/pipeline/proxy-image?url=' + encodeURIComponent(url));
    if (!resp.ok) throw new Error('Download failed: ' + resp.status);
    const data = await resp.json();
    productB64 = data.base64;
    productUrl = url;
    const preview = document.getElementById('product-preview');
    const placeholder = document.getElementById('product-placeholder');
    const sizeEl = document.getElementById('product-size');
    preview.src = 'data:' + data.mimeType + ';base64,' + data.base64;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    sizeEl.textContent = (data.base64.length / 1024).toFixed(0) + ' KB';
    sizeEl.style.display = 'block';
  } catch (err) {
    alert('Failed to load product image: ' + err.message);
  }
}

setupDropZone('selfie-zone', 'selfie-input', 'selfie-preview', 'selfie-placeholder', 'selfie-size', 'selfie');
setupDropZone('product-zone', 'product-input', 'product-preview', 'product-placeholder', 'product-size', 'product');

// ── Pipeline Execution ──
let genTimerInterval = null;

function resetPipeline() {
  // Reset pipeline cards
  ['step-classify', 'step-generate'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active-step', 'done-step', 'error-step');
  });
  document.getElementById('classify-spinner').style.display = 'none';
  document.getElementById('classify-result').style.display = 'none';
  document.getElementById('classify-result').innerHTML = '';
  document.getElementById('classify-error').style.display = 'none';
  document.getElementById('classify-error').innerHTML = '';
  document.getElementById('generate-spinner').style.display = 'none';
  document.getElementById('generate-result').style.display = 'none';
  document.getElementById('generate-result').innerHTML = '';
  document.getElementById('generate-error').style.display = 'none';
  document.getElementById('generate-error').innerHTML = '';
  document.getElementById('gen-elapsed').textContent = '0.0s';
  document.getElementById('pipe-arrow').classList.remove('lit');
  document.getElementById('timing-container').classList.remove('active');
  document.getElementById('result-section').classList.remove('active');
  if (genTimerInterval) { clearInterval(genTimerInterval); genTimerInterval = null; }
}

async function startPipeline() {
  if (!selfieB64) { alert('Please upload a selfie first.'); return; }
  if (!productB64) { alert('Please upload a product image first.'); return; }

  const btn = document.getElementById('gen-btn');
  btn.disabled = true;
  btn.textContent = 'Running Pipeline...';

  const pipelineSection = document.getElementById('pipeline-section');
  pipelineSection.classList.add('active');
  resetPipeline();

  // Scroll to pipeline
  pipelineSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Prepare body
  const body = { selfieBase64: selfieB64 };
  if (productUrl) {
    body.productImageUrl = productUrl;
    body.productBase64 = productB64;
  } else {
    body.productBase64 = productB64;
  }

  let classifyMs = 0;
  let generateMs = 0;
  let category = '';
  let model = '';
  let resultB64 = null;

  try {
    const resp = await fetch('/pipeline/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            handlePipelineEvent(event);

            if (event.step === 'classify_done') {
              classifyMs = event.durationMs;
              category = event.category;
            }
            if (event.step === 'generate_start') {
              model = event.model;
            }
            if (event.step === 'generate_done') {
              generateMs = event.durationMs;
              resultB64 = event.resultBase64;
            }
            if (event.step === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
          }
        }
      }
    }

    // Show result
    if (resultB64) {
      showResult(resultB64, category, classifyMs, generateMs, model);
      saveToHistory(resultB64, category, classifyMs, generateMs, model);
    }
  } catch (err) {
    // Show error on whichever step is active
    const classifyCard = document.getElementById('step-classify');
    const generateCard = document.getElementById('step-generate');
    if (generateCard.classList.contains('active-step')) {
      generateCard.classList.remove('active-step');
      generateCard.classList.add('error-step');
      document.getElementById('generate-spinner').style.display = 'none';
      document.getElementById('generate-error').style.display = 'block';
      document.getElementById('generate-error').innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
    } else {
      classifyCard.classList.remove('active-step');
      classifyCard.classList.add('error-step');
      document.getElementById('classify-spinner').style.display = 'none';
      document.getElementById('classify-error').style.display = 'block';
      document.getElementById('classify-error').innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
    }
    if (genTimerInterval) { clearInterval(genTimerInterval); genTimerInterval = null; }
  }

  btn.disabled = false;
  btn.textContent = 'Generate Try-On';
}

function handlePipelineEvent(event) {
  const classifyCard = document.getElementById('step-classify');
  const generateCard = document.getElementById('step-generate');

  switch (event.step) {
    case 'classify_start':
      classifyCard.classList.add('active-step');
      document.getElementById('classify-spinner').style.display = 'flex';
      break;

    case 'classify_done': {
      classifyCard.classList.remove('active-step');
      classifyCard.classList.add('done-step');
      document.getElementById('classify-spinner').style.display = 'none';

      detectedCategory = event.category;
      const catLower = event.category.toLowerCase();
      const resultHtml = '<div class="fade-in">' +
        '<div class="category-badge ' + catLower + '">' + event.category + '</div>' +
        '<span class="duration-tag">' + (event.durationMs / 1000).toFixed(1) + 's</span>' +
        '<button class="prompt-toggle" onclick="togglePrompt(this)">' +
          '<span class="arrow">&#9654;</span> View prompt (' + event.prompt.length + ' chars)' +
        '</button>' +
        '<div class="prompt-box">' + escapeHtml(event.prompt) + '</div>' +
      '</div>';
      document.getElementById('classify-result').innerHTML = resultHtml;
      document.getElementById('classify-result').style.display = 'block';

      // Light the arrow
      document.getElementById('pipe-arrow').classList.add('lit');

      // Highlight in sidebar
      highlightSidebarCategory(event.category);
      break;
    }

    case 'generate_start':
      generateCard.classList.add('active-step');
      document.getElementById('generate-spinner').style.display = 'flex';
      // Start elapsed timer
      const genStartTime = Date.now();
      genTimerInterval = setInterval(() => {
        const elapsed = (Date.now() - genStartTime) / 1000;
        document.getElementById('gen-elapsed').textContent = elapsed.toFixed(1) + 's';
      }, 100);
      break;

    case 'generate_done':
      if (genTimerInterval) { clearInterval(genTimerInterval); genTimerInterval = null; }
      generateCard.classList.remove('active-step');
      generateCard.classList.add('done-step');
      document.getElementById('generate-spinner').style.display = 'none';
      document.getElementById('generate-result').innerHTML =
        '<div class="fade-in"><span class="duration-tag" style="font-size:0.85rem">Completed in ' +
        (event.durationMs / 1000).toFixed(1) + 's</span></div>';
      document.getElementById('generate-result').style.display = 'block';
      break;

    case 'error':
      if (genTimerInterval) { clearInterval(genTimerInterval); genTimerInterval = null; }
      break;
  }
}

function showResult(resultB64, category, classifyMs, generateMs, model) {
  const totalMs = classifyMs + generateMs;

  // Result image
  document.getElementById('result-image').src = 'data:image/png;base64,' + resultB64;

  // Comparison
  const selfiePreview = document.getElementById('selfie-preview');
  const productPreview = document.getElementById('product-preview');
  document.getElementById('comp-selfie').src = selfiePreview.src;
  document.getElementById('comp-product').src = productPreview.src;
  document.getElementById('comp-result').src = 'data:image/png;base64,' + resultB64;

  // Stats
  document.getElementById('stats-grid').innerHTML =
    '<div class="stat-card"><div class="stat-label">Category</div><div class="stat-value">' + category + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Classification</div><div class="stat-value">' + (classifyMs / 1000).toFixed(1) + 's</div></div>' +
    '<div class="stat-card"><div class="stat-label">Generation</div><div class="stat-value">' + (generateMs / 1000).toFixed(1) + 's</div></div>' +
    '<div class="stat-card"><div class="stat-label">Total Time</div><div class="stat-value">' + (totalMs / 1000).toFixed(1) + 's</div></div>' +
    '<div class="stat-card"><div class="stat-label">Model</div><div class="stat-value">' + (model || 'NB2') + '</div></div>';

  document.getElementById('result-section').classList.add('active');

  // Timing bar
  const classifyPct = (classifyMs / totalMs * 100).toFixed(1);
  const generatePct = (generateMs / totalMs * 100).toFixed(1);
  document.getElementById('seg-classify').style.width = classifyPct + '%';
  document.getElementById('seg-generate').style.width = generatePct + '%';
  document.getElementById('timing-total').textContent = 'Total: ' + (totalMs / 1000).toFixed(1) + 's';
  document.getElementById('legend-classify-ms').textContent = '(' + (classifyMs / 1000).toFixed(1) + 's)';
  document.getElementById('legend-generate-ms').textContent = '(' + (generateMs / 1000).toFixed(1) + 's)';
  document.getElementById('timing-container').classList.add('active');

  // Scroll to result
  setTimeout(() => {
    document.getElementById('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

// ── Prompt toggle ──
function togglePrompt(btn) {
  const arrow = btn.querySelector('.arrow');
  const box = btn.nextElementSibling;
  const isOpen = box.classList.contains('open');
  box.classList.toggle('open');
  arrow.classList.toggle('open');
}

// ── Sidebar ──
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

async function loadCategories() {
  try {
    const resp = await fetch('/pipeline/categories');
    const data = await resp.json();
    allCategories = data.categories;
    renderSidebarCategories();
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

function renderSidebarCategories() {
  const container = document.getElementById('sidebar-categories');
  container.innerHTML = allCategories.map((cat, i) => {
    const isHighlighted = detectedCategory === cat.name;
    return '<div class="sidebar-category' + (isHighlighted ? ' highlighted' : '') + '" id="sidebar-cat-' + cat.name + '">' +
      '<div class="sidebar-cat-header" onclick="toggleSidebarCat(' + i + ')">' +
        '<span class="sidebar-cat-name">' + cat.name + '</span>' +
        '<span class="sidebar-cat-arrow" id="sidebar-arrow-' + i + '">&#9654;</span>' +
      '</div>' +
      '<div class="sidebar-cat-body" id="sidebar-body-' + i + '">' + escapeHtml(cat.prompt) + '</div>' +
    '</div>';
  }).join('');
}

function toggleSidebarCat(index) {
  const body = document.getElementById('sidebar-body-' + index);
  const arrow = document.getElementById('sidebar-arrow-' + index);
  body.classList.toggle('open');
  arrow.classList.toggle('open');
}

function highlightSidebarCategory(categoryName) {
  // Remove all highlights
  document.querySelectorAll('.sidebar-category').forEach(el => el.classList.remove('highlighted'));
  // Add highlight to detected
  const el = document.getElementById('sidebar-cat-' + categoryName);
  if (el) el.classList.add('highlighted');
  // Auto-expand that category
  const index = allCategories.findIndex(c => c.name === categoryName);
  if (index >= 0) {
    const body = document.getElementById('sidebar-body-' + index);
    const arrow = document.getElementById('sidebar-arrow-' + index);
    if (body && !body.classList.contains('open')) {
      body.classList.add('open');
      if (arrow) arrow.classList.add('open');
    }
  }
}

// ── History (localStorage) ──
const HISTORY_KEY = 'mrigai_pipeline_history';
const MAX_HISTORY = 10;

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveToHistory(resultB64, category, classifyMs, generateMs, model) {
  const history = getHistory();
  // Create a small thumbnail: use the first chunk of base64 (we store the full result)
  // To save space, we truncate to ~50KB for thumbnail
  const thumbB64 = resultB64.length > 70000 ? resultB64.slice(0, 70000) : resultB64;
  history.unshift({
    thumb: thumbB64,
    category,
    classifyMs,
    generateMs,
    model,
    timestamp: Date.now(),
    selfie: selfieB64 ? selfieB64.slice(0, 70000) : null,
    product: productB64 ? productB64.slice(0, 70000) : null,
  });
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch(e) {
    // localStorage full — trim older entries
    history.length = Math.max(1, history.length - 3);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  }
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  const section = document.getElementById('history-section');
  const strip = document.getElementById('history-strip');
  if (history.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  strip.innerHTML = history.map((item, i) => {
    const timeAgo = formatTimeAgo(item.timestamp);
    return '<div class="history-item" onclick="viewHistoryItem(' + i + ')">' +
      '<img src="data:image/png;base64,' + item.thumb + '" alt="Result">' +
      '<div class="history-meta">' +
        '<div class="history-category">' + item.category + '</div>' +
        '<div class="history-time">' + timeAgo + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function viewHistoryItem(index) {
  const history = getHistory();
  const item = history[index];
  if (!item) return;
  showResult(item.thumb, item.category, item.classifyMs, item.generateMs, item.model);
  // Update comparison images if available
  if (item.selfie) document.getElementById('comp-selfie').src = 'data:image/jpeg;base64,' + item.selfie;
  if (item.product) document.getElementById('comp-product').src = 'data:image/jpeg;base64,' + item.product;
  // Ensure pipeline section is also visible
  document.getElementById('pipeline-section').classList.add('active');
  document.getElementById('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// ── Utilities ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Init ──
loadCategories();
renderHistory();
</script>
</body>
</html>`);
});

export const pipelineRouter = router;
