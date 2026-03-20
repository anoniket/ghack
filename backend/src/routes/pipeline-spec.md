# Pipeline Dashboard — Design Specification

**Author:** Maya (Senior Frontend Engineer)
**Date:** 2026-03-21
**Status:** Draft — ready for implementation review

---

## 1. Overview

A single-page debug/internal webapp served from the Express backend at `/pipeline`. It visualizes the two-step try-on pipeline (classify product, then generate try-on) with real-time status, timing breakdowns, and history. Built as inline HTML within an Express route file, same pattern as `/playground` (`backend/src/routes/playground.ts`).

This is NOT a user-facing page. It is an internal engineering tool for debugging prompt quality, classification accuracy, and generation performance.

---

## 2. Architecture & Serving

### Route structure

```
backend/src/routes/pipeline.ts        ← new file
```

Register in `backend/src/index.ts` identically to how `playgroundRouter` is mounted:

```typescript
import { pipelineRouter } from './routes/pipeline';

// Mount before global body parser, no auth, CSP stripped
app.use('/pipeline', (_req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  next();
}, express.json({ limit: '20mb' }), pipelineRouter);
```

### Endpoints (all under `/pipeline`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/`  | Serve the single-page HTML/CSS/JS |
| `GET`  | `/proxy-image?url=` | Proxy-download an image URL, return `{ base64, mimeType, size }` |
| `GET`  | `/categories` | Return the full list of 12 categories with their prompt text |
| `POST` | `/classify` | Classify a product image → return category + confidence |
| `POST` | `/generate` | Run the full pipeline: classify → select prompt → generate |

---

## 3. Page Layout

### 3.1 Global frame

- **Dark theme**: `background: #0d0d0d`, text `#e0e0e0`, accent `#E8C8A0` (mrigAI gold)
- **Font**: system stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- **Max width**: `1400px`, centered
- **Header**: `mrigAI Pipeline Dashboard` in gold, with a small "v2" badge

### 3.2 Section order (top to bottom, single column flow)

```
┌─────────────────────────────────────────────┐
│  HEADER — "mrigAI Pipeline Dashboard"       │
├─────────────────┬───────────────────────────┤
│  INPUT SECTION  │  CATEGORY PROMPT VIEWER   │
│  (left, ~60%)   │  (right sidebar, ~40%)    │
├─────────────────┴───────────────────────────┤
│  PIPELINE VISUALIZATION (full width)        │
│  ┌──────────────┐   ┌────────────────────┐  │
│  │ Step 1:      │ → │ Step 2:            │  │
│  │ Classify     │   │ Generate           │  │
│  └──────────────┘   └────────────────────┘  │
├─────────────────────────────────────────────┤
│  RESULT SECTION (full width)                │
│  Side-by-side: selfie | product | result    │
├─────────────────────────────────────────────┤
│  HISTORY SECTION (full width)               │
│  Thumbnail grid of past generations         │
└─────────────────────────────────────────────┘
```

---

## 4. Input Section (left panel)

### 4.1 Selfie upload

- **Drop zone**: Dashed border (`#333`), `2px dashed`, `border-radius: 12px`, `min-height: 200px`
- Hover/drag-over: border turns `#E8C8A0`
- Accepts file input (click or drag-and-drop) — `accept="image/*"`
- On load: show image preview inside the drop zone, hide placeholder text
- Below drop zone: URL text input (`placeholder="https://..."`) for pasting a selfie URL
  - On blur/enter: fetch via `/pipeline/proxy-image`, show preview
- Store as `selfieBase64` in JS memory

### 4.2 Product upload

- Identical layout to selfie upload
- Store as `productBase64` in JS memory
- The URL input here is the primary input mode (product URLs from retailers)

### 4.3 Controls row

Below both upload panels, spanning full width of the input section:

- **Model selector**: `<select>` with the three models:
  - `gemini-2.5-flash-image` (NB1) — default
  - `gemini-3.1-flash-image-preview` (NB2)
  - `gemini-3-pro-image-preview` (Pro)
- **API Key selector**: `<select>` showing `Key 1 (...last6)`, `Key 2 (...last6)`, etc.
- **Generate button**: Full-width, gold background (`#E8C8A0`), dark text, `font-weight: 600`
  - Text: "Run Pipeline"
  - Disabled state: `background: #555`, `cursor: not-allowed`
  - While running: text changes to "Pipeline Running..." and button is disabled

---

## 5. Category Prompt Viewer (right sidebar)

### 5.1 Purpose

Shows all 12 product categories and their associated prompt text. Highlights which category was selected after classification.

### 5.2 The 12 categories

These are extracted from the current `TRYON_V2_PROMPT` in `gemini.ts`:

1. `FOOTWEAR`
2. `RING`
3. `BRACELET/BANGLE/WATCH`
4. `EARRING/JHUMKA`
5. `NECKLACE/CHOKER/MANGALSUTRA`
6. `SUNGLASSES`
7. `TOP`
8. `BOTTOM`
9. `FULL_OUTFIT`
10. `BAG`
11. `BELT`
12. `DUPATTA/STOLE/SHAWL`

### 5.3 Layout

- Scrollable list of category cards
- Each card shows:
  - Category name (bold, uppercase, `font-size: 13px`)
  - Framing instruction summary (first ~80 chars, truncated with ellipsis)
  - Expand/collapse toggle (chevron icon) to reveal the full prompt text for that category
- **Default state**: all collapsed
- **After classification**: the matched category card gets:
  - Gold left border (`4px solid #E8C8A0`)
  - Subtle gold background tint (`background: rgba(232, 200, 160, 0.08)`)
  - Auto-expanded to show full prompt text
  - Smooth scroll into view if off-screen

### 5.4 Data source

The `/pipeline/categories` endpoint returns the full list. The prompt text per category is defined server-side so it stays in sync with the actual prompts used in generation.

---

## 6. Pipeline Visualization Section

This is the core feature. It renders as a horizontal two-step flow.

### 6.1 Shared card styling

- `background: #1a1a1a`, `border-radius: 12px`, `padding: 20px`
- States: `idle` | `running` | `success` | `error`
  - `idle`: dim text, no border
  - `running`: pulsing gold left border (`4px solid #E8C8A0`, CSS pulse animation), spinner visible
  - `success`: green left border (`4px solid #4ade80`)
  - `error`: red left border (`4px solid #ef4444`), error message shown

- Between the two cards: a horizontal arrow/connector line (SVG or CSS `→`) indicating flow direction

### 6.2 Step 1 Card — "Classify Product"

**Idle state:**
```
┌─────────────────────────────┐
│  ① Classify Product         │
│  Waiting for input...       │
└─────────────────────────────┘
```

**Running state:**
```
┌─────────────────────────────┐
│  ① Classifying Product...   │
│  [spinner]  0.8s elapsed    │
└─────────────────────────────┘
```

- Spinner: CSS-only animated spinner (not a GIF), 20px, gold color
- Elapsed time: updates every 100ms via `setInterval`, format `X.Xs`

**Success state:**
```
┌─────────────────────────────┐
│  ① Product Classified  ✓    │
│                             │
│  Category: TOP              │
│  Confidence: 94%            │
│  Time: 1.2s                 │
│                             │
│  ▶ View selected prompt     │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
│  │ (collapsible prompt    │  │
│  │  text block)           │  │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
│  Classification: 1.2s       │
└─────────────────────────────┘
```

- Category shown as a badge: pill shape, gold background, dark text, uppercase
- Confidence shown as percentage with a small horizontal bar (filled proportionally)
- "View selected prompt" is a collapsible section with the full prompt text in a `<pre>` block, monospaced, `font-size: 12px`, `max-height: 300px`, scrollable

**Error state:**
```
┌─────────────────────────────┐
│  ① Classification Failed ✗  │
│  Error: [message]           │
│  Time: 0.4s                 │
└─────────────────────────────┘
```

### 6.3 Step 2 Card — "Generate Try-On"

**Idle state:**
```
┌─────────────────────────────┐
│  ② Generate Try-On          │
│  Waiting for classification │
└─────────────────────────────┘
```

**Running state:**
```
┌─────────────────────────────┐
│  ② Generating Try-On...     │
│  [spinner]  12.4s elapsed   │
│                             │
│  Model: NB2                 │
│  Category: TOP              │
│  Prompt: category-specific  │
│                             │
│  ░░░░░░░░░░████░░░░░░░░░░  │
│  (indeterminate progress)   │
└─────────────────────────────┘
```

- Elapsed timer: same 100ms interval pattern
- Indeterminate progress bar: CSS animation, gold color, slides back and forth
- Show model name and detected category while generating

**Success state:**
```
┌─────────────────────────────┐
│  ② Generation Complete ✓    │
│                             │
│  [result image thumbnail]   │
│  256x384, 847KB             │
│                             │
│  Generation: 18.3s          │
└─────────────────────────────┘
```

- Thumbnail of result image: `max-height: 200px`, `border-radius: 8px`, clickable to scroll to full result
- Image metadata: dimensions and base64 size

### 6.4 Timing breakdown bar

Below both step cards, a full-width horizontal bar showing time allocation:

```
┌─────────────────────────────────────────────────────────────┐
│ ██ Classify (1.2s)  │ ██████████████████████ Generate (18.3s) │  Total: 19.5s
└─────────────────────────────────────────────────────────────┘
```

- Proportional width segments, color-coded:
  - Classification: `#60a5fa` (blue)
  - Generation: `#E8C8A0` (gold)
- Labels inside or below each segment
- Total time shown at the right end

---

## 7. Result Section

Appears only after a successful generation. Full width.

### 7.1 Side-by-side comparison

Three images in a row, equal width:

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Selfie  │  │ Product  │  │  Result  │
│ (input)  │  │ (input)  │  │ (output) │
└──────────┘  └──────────┘  └──────────┘
```

- Each image: `border-radius: 12px`, `object-fit: contain`, same max-height (`400px`)
- Label above each: `font-size: 13px`, `color: #888`, uppercase

### 7.2 Large result image

Below the comparison, the result image displayed at full available width:

- `max-width: 100%`, `max-height: 80vh`, `border-radius: 12px`
- Right-click to save (standard browser behavior)

### 7.3 Metadata strip

Below the large result:

- **Category badge**: pill, gold, uppercase (e.g., `TOP`)
- **Model badge**: pill, blue, (e.g., `NB2`)
- **Timing**: `Classify: 1.2s | Generate: 18.3s | Total: 19.5s`
- **Image size**: `847KB base64`

---

## 8. History Section

### 8.1 Storage

- `localStorage` key: `mrigai_pipeline_history`
- Stored as JSON array, newest first
- Each entry:
  ```json
  {
    "id": "gen_1711036800000_abc12345",
    "timestamp": "2026-03-21T18:00:00.000Z",
    "category": "TOP",
    "confidence": 0.94,
    "model": "gemini-3.1-flash-image-preview",
    "classifyMs": 1200,
    "generateMs": 18300,
    "totalMs": 19500,
    "selfieThumb": "data:image/jpeg;base64,...",
    "productThumb": "data:image/jpeg;base64,...",
    "resultThumb": "data:image/jpeg;base64,...",
    "resultFull": "data:image/png;base64,..."
  }
  ```
- **Thumbnails**: resize to 150px wide using `<canvas>` before storing (keeps localStorage small)
- **Max entries**: 20 — FIFO, drop oldest when full
- **Clear all button**: red text, no background, confirmation prompt before clearing

### 8.2 Layout

- Section title: "History" with entry count badge
- Thumbnail grid: `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))`, `gap: 12px`
- Each card:
  - Result thumbnail (`border-radius: 8px`)
  - Category badge (small pill)
  - Timestamp (relative: "2 min ago", "1 hour ago", etc.)
  - Total time
- Click a card: loads that generation's full data into the result section (scrolls up), selfie + product + result displayed in comparison view
- No re-generation — purely viewing stored results

---

## 9. API Endpoint Specifications

### 9.1 `GET /pipeline/categories`

**Response:**
```json
{
  "categories": [
    {
      "id": "FOOTWEAR",
      "name": "Footwear",
      "promptExcerpt": "Full body head to toe, face clearly visible at top...",
      "fullPrompt": "FOOTWEAR: Full body head to toe, face clearly visible at top. Camera at knee-to-waist height..."
    },
    ...
  ]
}
```

Returns all 12 categories with their framing/prompt text. This keeps the frontend in sync with whatever prompts the backend actually uses.

### 9.2 `GET /pipeline/proxy-image?url=<encoded_url>`

Same implementation as the existing `playground` proxy. Returns:
```json
{
  "base64": "...",
  "mimeType": "image/jpeg",
  "size": 245678
}
```

### 9.3 `POST /pipeline/classify`

Classifies a product image into one of the 12 categories.

**Request:**
```json
{
  "productBase64": "...",
  "keyIndex": 0
}
```

**Response:**
```json
{
  "category": "TOP",
  "confidence": 0.94,
  "reasoning": "The image shows a button-down shirt with collar and long sleeves",
  "classifyMs": 1200
}
```

**Implementation notes:**
- Uses Gemini text model (e.g., `gemini-2.5-flash`) — NOT the image generation model
- Prompt: send the product image with a classification prompt asking the model to:
  1. Identify which of the 12 categories the product belongs to
  2. Return a confidence score (0-1)
  3. Return a brief reasoning string
- Response format: instruct Gemini to return JSON — parse it server-side
- This is a fast, cheap call (~1-2s) since it is text-only output

### 9.4 `POST /pipeline/generate`

Runs the full two-step pipeline.

**Request:**
```json
{
  "selfieBase64": "...",
  "productBase64": "...",
  "model": "gemini-3.1-flash-image-preview",
  "keyIndex": 0
}
```

**Response (SSE — Server-Sent Events):**

This endpoint uses SSE (not WebSocket, not polling — see section 10) to stream pipeline status updates.

```
Content-Type: text/event-stream

event: classify_start
data: {"step":1,"status":"running"}

event: classify_done
data: {"step":1,"status":"success","category":"TOP","confidence":0.94,"reasoning":"...","classifyMs":1200,"selectedPrompt":"FOOTWEAR: Full body head to toe..."}

event: generate_start
data: {"step":2,"status":"running","model":"gemini-3.1-flash-image-preview","category":"TOP"}

event: generate_done
data: {"step":2,"status":"success","resultBase64":"...","generateMs":18300,"totalMs":19500}

event: error
data: {"step":2,"status":"error","error":"Image generation blocked: finishReason=SAFETY","totalMs":5200}
```

**Why SSE:**
- Simpler than WebSocket for a unidirectional stream (server → client)
- No extra library needed — native `EventSource` in browsers, trivial to implement in Express
- The pipeline has exactly two steps with clear start/end events — perfect for SSE
- Falls back gracefully (the client can also call `/classify` then `/generate` separately as two normal POST requests if SSE is not viable)

---

## 10. Real-Time Status: SSE vs WebSocket vs Polling

### Decision: SSE (Server-Sent Events)

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **SSE** | Native browser API, unidirectional (perfect for status), auto-reconnect, trivial Express implementation, works through proxies | No binary data (not needed here), one-direction only (fine — client sends one POST, server streams back) | **Selected** |
| **WebSocket** | Bidirectional, binary support | Overkill for 2-step status updates, requires ws library, more complex error handling | Rejected |
| **Polling** | Simplest to implement | Wastes requests, latency between polls, requires job ID management | Rejected |

### SSE implementation pattern

**Server side (Express):**
```typescript
router.post('/generate', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Step 1
  send('classify_start', { step: 1, status: 'running' });
  const classification = await classifyProduct(productBase64, keyIndex);
  send('classify_done', { step: 1, ...classification });

  // Step 2
  send('generate_start', { step: 2, status: 'running', model, category: classification.category });
  const result = await generateWithCategoryPrompt(selfieBase64, productBase64, classification, model, keyIndex);
  send('generate_done', { step: 2, ...result });

  res.end();
});
```

**Client side (vanilla JS):**

Since SSE traditionally uses `EventSource` which only supports GET, and we need to POST with a body, the client should use `fetch` with `ReadableStream` instead:

```javascript
const response = await fetch('/pipeline/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ selfieBase64, productBase64, model, keyIndex }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
// Parse SSE events from the stream chunks
```

This avoids the GET-only limitation of `EventSource` while keeping the SSE wire format.

---

## 11. Mobile Responsiveness

This is an internal debug tool, so mobile is secondary. However, basic usability on tablets (iPad) should work since engineers debug from multiple devices.

### Breakpoints

| Width | Layout change |
|-------|---------------|
| `> 1024px` | Two-column input + sidebar, horizontal pipeline cards |
| `768px - 1024px` | Input section stacks to single column, sidebar moves below inputs, pipeline cards remain horizontal |
| `< 768px` | Everything stacks vertically, pipeline cards stack vertically (Step 1 above Step 2), side-by-side comparison becomes vertical stack, history grid becomes 2 columns |

### Specific rules

- All images: `max-width: 100%`, `height: auto`
- Drop zones: `min-height: 150px` on mobile (vs 200px desktop)
- Generate button: always full width, sticky bottom on mobile (`position: sticky; bottom: 0;`)
- Category sidebar: collapses to an expandable "View Categories" button on mobile
- Timing bar: wraps to two lines if needed, labels move below segments

---

## 12. CSS Animation Specifications

### Spinner
```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner {
  width: 20px; height: 20px;
  border: 2px solid #333;
  border-top-color: #E8C8A0;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
```

### Pulse border (running step)
```css
@keyframes pulse-border {
  0%, 100% { border-left-color: #E8C8A0; }
  50% { border-left-color: #0d0d0d; }
}
.step-card.running {
  border-left: 4px solid #E8C8A0;
  animation: pulse-border 1.5s ease-in-out infinite;
}
```

### Indeterminate progress bar
```css
@keyframes indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
.progress-bar {
  height: 4px;
  background: #222;
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}
.progress-bar::after {
  content: '';
  position: absolute;
  height: 100%;
  width: 25%;
  background: #E8C8A0;
  border-radius: 2px;
  animation: indeterminate 1.5s ease-in-out infinite;
}
```

---

## 13. Error Handling

| Scenario | UI behavior |
|----------|-------------|
| No selfie uploaded | "Run Pipeline" button stays disabled; tooltip: "Upload a selfie first" |
| No product uploaded | Button disabled; tooltip: "Upload a product image first" |
| Classification fails | Step 1 card turns red, error message shown, Step 2 remains idle, user can retry |
| Generation fails (blocked) | Step 2 card turns red, shows "IMAGE_BLOCKED" with reason, Step 1 stays green |
| Generation fails (timeout) | Step 2 card turns red, shows "TIMEOUT" with elapsed time |
| Generation fails (503) | Step 2 card turns red, shows "SERVER_BUSY — try again" |
| Network error | Status bar below button turns red: "Network error — check connection" |
| SSE stream interrupted | Client detects stream close without `generate_done` event, shows "Connection lost" error |
| Proxy image download fails | Drop zone shows red border briefly, error toast below the URL input |

---

## 14. Implementation Checklist

For the implementing engineer:

- [ ] Create `backend/src/routes/pipeline.ts`
- [ ] Add classification logic: new function `classifyProduct(productBase64, keyIndex)` that calls Gemini text model with the product image and a classification prompt returning `{ category, confidence, reasoning }`
- [ ] Add category-specific prompt assembly: given a category, build the full generation prompt with the category-specific framing instructions
- [ ] Extract the 12 per-category prompt blocks from `TRYON_V2_PROMPT` in `gemini.ts` into a shared data structure (array of `{ id, name, framingPrompt }`) that both `pipeline.ts` and `gemini.ts` can import
- [ ] Implement SSE streaming on `POST /pipeline/generate`
- [ ] Implement the HTML/CSS/JS inline template (same pattern as `playground.ts`)
- [ ] Register the router in `backend/src/index.ts`
- [ ] Add localStorage history with 150px canvas thumbnails
- [ ] Test on Chrome, Safari, Firefox (SSE fetch+ReadableStream compatibility)
- [ ] Verify mobile layout on iPad-sized viewport

---

## 15. Open Questions (for discussion)

1. **Prompt override**: Should the dashboard allow editing the category-specific prompt before generation (like playground allows editing the prompt)? Useful for rapid prompt iteration, but adds complexity.

2. **Classification model**: Should classification use `gemini-2.5-flash` (text-only, fast, cheap) or the same image model? Text model is recommended — classification is a vision-understanding task, not an image-generation task.

3. **Separate vs combined prompt**: Currently `TRYON_V2_PROMPT` contains both the classification instruction ("STEP 1 — IDENTIFY THE PRODUCT") and the framing instructions in a single mega-prompt. The pipeline dashboard splits this into two calls. Should the production `generateTryOnV2` also be refactored to use two calls, or should this remain a dashboard-only experiment?

4. **A/B comparison**: Should the dashboard support running the same inputs through multiple models side-by-side? (e.g., NB1 vs NB2 vs Pro). This would be extremely valuable for prompt debugging but doubles/triples API cost per test.

5. **Shareable results**: Should the dashboard generate a shareable URL (e.g., `/pipeline/result/<id>`) so engineers can share specific test results in Slack? Would require server-side storage (even temporary in-memory).
