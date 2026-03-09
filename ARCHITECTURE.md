# TryOnAI — Architecture & Flow Diagrams

## System Architecture

```
+─────────────────────────────────────────────────────────────────────+
|                        MOBILE APP (Expo/React Native)               |
|                                                                     |
|  +──────────+   +──────────────+   +─────────+   +──────────────+  |
|  |  Chat    |   |   WebView    |   | Saved   |   |   Profile    |  |
|  |  Screen  |   |   Browser    |   |  Tab    |   |    Tab       |  |
|  +────┬─────+   +──────┬───────+   +────┬────+   +──────┬───────+  |
|       |                |              |                  |          |
|  +────┴────────────────┴──────────────┴──────────────────┴───────+  |
|  |                    Client Services                            |  |
|  |  api.ts (HTTP + HMAC signing)  |  store.ts (Zustand state)   |  |
|  |  productDetector.js            |  logger.ts                  |  |
|  +───────────────────────┬───────────────────────────────────────+  |
+──────────────────────────┼──────────────────────────────────────────+
                           |
                    HTTPS + Device ID
                    + HMAC Signature
                           |
+──────────────────────────┼──────────────────────────────────────────+
|                  RAILWAY BACKEND (Express.js)                       |
|                                                                     |
|  Middleware: Device ID validation + HMAC auth + Rate limiting       |
|  (300 req/15min general, 20 req/15min for tryon/video)             |
|                                                                     |
|  +─────────────────────────────────────────────────────────────+    |
|  |                        API Routes                           |    |
|  |                                                             |    |
|  |  POST /api/tryon/prepare  ─── Zone detection (2.5 Pro)     |    |
|  |  POST /api/tryon/generate ─── Image generation             |    |
|  |  POST /api/chat           ─── Fashion AI chat              |    |
|  |  POST /api/video          ─── Start video generation       |    |
|  |  GET  /api/video/:jobId   ─── Poll video status            |    |
|  |  POST /api/upload-url     ─── S3 presigned upload URL      |    |
|  |  GET  /api/history        ─── Fetch try-on history         |    |
|  |  DELETE /api/history/:id  ─── Delete session               |    |
|  |  GET  /api/product-tryon  ─── Check previous try-on        |    |
|  +──────────┬──────────────────────────┬───────────────────────+    |
|             |                          |                            |
+─────────────┼──────────────────────────┼────────────────────────────+
              |                          |
     +────────┴────────+        +────────┴────────+
     |   Google AI     |        |      AWS        |
     |                 |        |                 |
     | Gemini 2.5 Pro  |        | S3 (media)     |
     |  (zone detect)  |        | DynamoDB       |
     | Gemini 2.5 Flash|        |  (sessions)    |
     |  (chat)         |        | CloudFront     |
     | Gemini 2.5 Flash|        |  (CDN)         |
     |  Image (tryon)  |        |                 |
     | Gemini 3 Pro    |        |                 |
     |  (photoshoot)   |        |                 |
     | Veo 3.1         |        |                 |
     |  (video gen)    |        |                 |
     +-----------------+        +-----------------+


```

---

## Try-On Flow (Main Use Case)

```
  User opens app
       |
       v
  +──────────+     "show me shirts"     +──────────+
  |   Chat   | ──────────────────────>  |  Gemini  |
  |  Screen  | <──────────────────────  |  2.5     |
  +──────────+   "Here's Myntra link"   |  Flash   |
       |                                +──────────+
       | User taps link
       v
  +──────────────────────────────────────────────────+
  |              WebView Browser                      |
  |                                                   |
  |  productDetector.js scans page                   |
  |       |                                           |
  |       v                                           |
  |  Found product image (>75% screen width)          |
  |       |                                           |
  |       v                                           |
  |  [Try This On] button appears                    |
  +────────────────────┬─────────────────────────────+
                       |
                 User taps button
                       |
          +────────────┴────────────+
          |                         |
          v                         v
  +--------------+          +--------------+
  | Read selfie  |          | Show loading |
  | from local   |          | overlay with |
  | file (base64)|          | progress bar |
  +--------------+          +--------------+
          |
          v
  +───────────────────────────────────────────+
  |        STEP 1: PREPARE (Zone Detection)    |
  |                                            |
  |  Client ──> POST /api/tryon/prepare        |
  |    { selfieBase64, productImageUrl }       |
  |                                            |
  |  Server:                                   |
  |    1. Download product image               |
  |    2. Gemini 2.5 Pro: zone detection       |
  |       - What zone? (upper/lower/feet/...)  |
  |       - Is zone visible in selfie?         |
  |    3. Cache selfie+product base64 (5 min)  |
  |                                            |
  |  Response: { usePhotoshoot, model,         |
  |              estimatedDuration }           |
  +───────────────────┬───────────────────────+
                      |
                      v
  +───────────────────────────────────────────+
  |        STEP 2: GENERATE (Image Gen)        |
  |                                            |
  |  Client ──> POST /api/tryon/generate       |
  |    { productImageUrl, usePhotoshoot }      |
  |                                            |
  |  Server:                                   |
  |    1. Read cached selfie+product base64    |
  |    2. If zone visible (usePhotoshoot=F):   |
  |       -> Gemini 2.5 Flash Image (fast)     |
  |    3. If zone hidden (usePhotoshoot=T):    |
  |       -> Gemini 3 Pro Image (photoshoot)   |
  |    4. Return base64 IMMEDIATELY            |
  |    5. Background: S3 upload + DynamoDB     |
  |                                            |
  |  Response: { resultBase64, sessionId,      |
  |              tryonS3Key, model }           |
  +───────────────────┬───────────────────────+
                      |
                      v
  +───────────────────────────────────────────+
  |           RESULT INJECTION                 |
  |                                            |
  |  1. Replace product image in WebView       |
  |     with try-on result (base64)            |
  |  2. Remove loading overlay                 |
  |  3. Show retry + video buttons             |
  |  4. Optimistically add to saved tab        |
  +───────────────────────────────────────────+
```

---

## Zone Detection Decision Tree

```
                    +──────────────+
                    | Product from |
                    |   IMAGE 2    |
                    +──────┬───────+
                           |
            What body zone does it need?
                           |
     +─────+─────+────+────+────+─────+─────+─────+
     |     |     |    |    |    |     |     |     |
   upper lower full feet hands ears neck  face  head
     |     |     |    |    |    |     |     |     |
     v     v     v    v    v    v     v     v     v
  +────────────────────────────────────────────────+
  |    Check IMAGE 1 (customer's selfie):          |
  |    Is that EXACT body zone visible?            |
  +────────────────────┬───────────────────────────+
                       |
              +────────┴────────+
              |                 |
           VISIBLE          HIDDEN
              |                 |
              v                 v
     +──────────────+  +───────────────+
     | zone_visible |  | zone_visible  |
     |   = true     |  |   = false     |
     |              |  |               |
     | Use FLASH    |  | Use PRO       |
     | (fast, ~17s) |  | (photoshoot,  |
     | Direct edit  |  |  ~40s)        |
     | of selfie    |  | Extends body  |
     +--------------+  | + dresses     |
                       +───────────────+
```

---

## Video Generation Flow

```
  User taps video button (after try-on)
       |
       v
  POST /api/video { sessionId, tryonS3Key }
       |
       v
  Server starts async Veo 3.1 job
       |
       v
  Returns { jobId } immediately
       |
       v
  Client polls GET /api/video/:jobId every 5s
       |
       +──> { status: "pending" }  ──> keep polling
       |
       +──> { status: "complete", videoUrl }
       |         |
       |         v
       |    Video modal opens
       |    (plays from CloudFront CDN)
       |
       +──> { status: "failed", error }
                 |
                 v
            Show error + retry button
```

---

## Data Persistence

```
  +───────────────────────────────────────────────────────+
  |                    DynamoDB                            |
  |                                                       |
  |  Table: TryOnSessions                                 |
  |  PK: deviceId (String)                               |
  |  SK: sessionId (String) — "ses_{timestamp}"           |
  |                                                       |
  |  Attributes:                                          |
  |    sourceUrl, selfieS3Key, tryonS3Key,               |
  |    videoS3Key, tryonCdnUrl, videoCdnUrl,             |
  |    model ("flash"|"pro"), createdAt (ISO)             |
  |                                                       |
  |  GSI: SourceUrlIndex                                  |
  |    PK: deviceId, SK: sourceUrl                       |
  |    -> "Was this product already tried on?"            |
  +───────────────────────────────────────────────────────+

  +───────────────────────────────────────────────────────+
  |                      S3 Bucket                         |
  |               tryonai-media                            |
  |                                                       |
  |  {deviceId}/                                          |
  |    selfies/   ── uploaded selfie photos               |
  |    tryons/    ── generated try-on images              |
  |    videos/    ── generated videos                     |
  |                                                       |
  |  -> CloudFront CDN for delivery                       |
  +───────────────────────────────────────────────────────+
```

---

## AI Models Used

```
  +─────────────────────+──────────────────+──────────────+
  |       Model         |     Purpose      |    Speed     |
  +─────────────────────+──────────────────+──────────────+
  | gemini-2.5-pro      | Zone detection   |   ~3-5s     |
  | gemini-2.5-flash    | Chat assistant   |   ~1-2s     |
  | gemini-2.5-flash-   | Try-on (normal)  |  ~15-25s    |
  |   image             | Flash mode       |              |
  | gemini-3-pro-image  | Try-on (pro)     |  ~30-45s    |
  |   -preview          | Photoshoot mode  |              |
  | veo-3.1-fast-       | Video generation |  ~30-60s    |
  |   generate-preview  |                  |              |
  +─────────────────────+──────────────────+──────────────+
```

---

## Security

```
  Client Request:
  +──────────────────────────────────────────+
  | Headers:                                  |
  |   x-device-id:  "dev_177296..."          |
  |   x-timestamp:  "1772990041428"          |
  |   x-signature:  SHA256(secret + "." +    |
  |                   deviceId + "." +        |
  |                   timestamp + "." +       |
  |                   path)                   |
  +──────────────────────────────────────────+
          |
          v
  Server validates:
    1. Device ID present
    2. Timestamp within 5 min
    3. HMAC signature matches
    4. Rate limit not exceeded
```
