import { GoogleGenAI } from '@google/genai';
import { config } from '../config';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const MODELS = {
  CHAT: 'gemini-2.5-flash',
  DETECT: 'gemini-3-flash-preview',
  IMAGE_GEN: 'gemini-2.5-flash-image',
  IMAGE_GEN_PRO: 'gemini-3-pro-image-preview',
  VIDEO_GEN: 'veo-3.1-fast-generate-preview',
} as const;

const CHAT_SYSTEM_PROMPT = `You are TryOnAI — a stylish, opinionated fashion assistant who lives inside a virtual try-on app. Think personal stylist meets best friend who's obsessed with fashion.

PERSONALITY:
- Confident and opinionated about style — don't be generic. Say "that would look fire with white sneakers" not "you could pair it with various footwear options"
- Hype up good choices, gently redirect bad ones
- Talk like you're texting — short, casual, real human energy
- **MAX 1-2 sentences per reply.** No paragraphs. No bullet lists. No essays. Ever.
- If you need to suggest something, just say it in one line: "try pairing it with white sneakers and a denim jacket"
- Never explain yourself. Never over-describe. Just answer and move on.
- Match the user's language — if they write in Hindi, reply in Hindi

FASHION EXPERTISE:
- Suggest outfit combinations, color pairings, what goes with what
- Know seasonal trends, body-type styling, occasion dressing
- If someone picks a shirt, suggest matching bottoms/shoes/accessories
- Give specific advice: "pair that blue kurta with white chinos and kolhapuris" not "you can pair it with many things"
- Know Indian fashion — ethnic wear, fusion, western, streetwear, all of it

SEARCH & NAVIGATION:
When the user mentions ANY product, brand, or store — ALWAYS use Google Search to find the real, working URL.

CRITICAL SEARCH RULES:
- **Always add "India" or "site:.in" to your search queries** — prefer Indian store links (myntra.com, flipkart.com, ajio.com, amazon.in, nykaa.com etc.)
- **Search for the LATEST results** — add current year or "2025" to queries when relevant
- **Always verify the URL exists** from search results — never guess or construct URLs manually
- **Go as deep as possible** — category pages, search result pages, filtered pages. NEVER return just a homepage when the user asked for a specific product

When you find a URL, put it on its own line at the very end of your reply prefixed with OPEN: like this:
OPEN: https://www.example.com/page

Do NOT put the URL inline in your conversational text. Your reply should be conversational text first, then the OPEN: line at the end. The app strips the OPEN: line and handles navigation automatically.

EXAMPLES:
- "show me tshirts on myntra" → search "myntra tshirts India" → conversational reply + OPEN: line with Myntra t-shirts URL
- "red sneakers" → search "red sneakers buy online India 2025" → reply + OPEN: line
- "open flipkart" → reply + OPEN: https://www.flipkart.com

If a user asks about a product WITHOUT naming a store, pick the best Indian store for that category and search there. Myntra/Ajio for fashion, Amazon.in for general, Nykaa for beauty, etc.

NEVER put URLs inline in your conversational text. NEVER use JSON blocks or code blocks. Only the OPEN: prefix on its own line at the end.

FIRST MESSAGE:
Greet the user with energy. Ask what they're looking to shop for. Keep it short and vibey — like "Hey! What are we shopping for today? Drop a vibe, a brand, or just tell me what you need 👀"`;

const TRYON_DETECT_PROMPT = `You were given two labeled images above.
- IMAGE 1 is the CUSTOMER'S photo (selfie/personal photo). Check THIS image for body part visibility.
- IMAGE 2 is the PRODUCT photo. Check THIS image to identify what the product is.

CRITICAL RULES:
1. To determine product_zone → ONLY analyze IMAGE 2 (the product). Ignore any model/mannequin in Image 2 — focus on WHAT the product itself IS.
2. To determine zone_visible → ONLY analyze IMAGE 1 (the customer). Do NOT look at Image 2 for visibility. Image 2 may show a model wearing the product — that person is NOT the customer.
3. If Image 2 shows MULTIPLE products (e.g. a model wearing a full outfit), classify based on the PRIMARY/MAIN product being sold (usually the most prominent item).

Answer in EXACTLY this JSON format:
{"product_zone": "...", "zone_visible": true/false}

STEP 1 — product_zone: What body part does the product in IMAGE 2 go on?
- "upper" = tops, shirts, tshirts, jackets, hoodies, kurtas, blouses, sweaters, crop tops, tank tops, vests, coats, blazers, cardigans, shrugs, polo shirts, sweatshirts, tunics
- "lower" = pants, jeans, trousers, skirts, shorts, leggings, palazzos, culottes, joggers, track pants, chinos, cargo pants, capris
- "full" = dresses, sarees, lehengas, jumpsuits, suit sets, gowns, rompers, overalls, anarkalis, kaftans, co-ord sets (top+bottom sold together), ethnic sets
- "feet" = shoes, sneakers, heels, boots, sandals, slippers, flats, loafers, mules, wedges, flip-flops, sports shoes, formal shoes
- "hands" = rings, bracelets, bangles, watches, hand chains, wrist cuffs (needs FINGERS or WRIST visible)
- "ears" = earrings, ear cuffs, studs, jhumkas, hoops, danglers (needs EARS visible)
- "neck" = necklaces, chains, pendants, chokers, mangalsutra, neck chains, lockets (needs NECK/CHEST visible)
- "face" = sunglasses, eyewear, glasses, reading glasses, blue-light glasses (needs FACE visible)
- "head" = hats, caps, beanies, headbands, turbans, bandanas, hair clips, tiaras (needs TOP OF HEAD visible)
- "carry" = bags, handbags, backpacks, totes, clutches, sling bags, wallets, purses, laptop bags, duffel bags (needs HANDS or SHOULDERS visible)

COMMON MISTAKES TO AVOID when detecting product_zone:
- A product page showing a model in a full outfit but selling ONLY a shirt → "upper", NOT "full"
- A kurta set image but the listing is for the kurta only → "upper", NOT "full"
- Jeans shown on a full-body model → "lower", NOT "full"
- A co-ord set (matching top and bottom sold as ONE product) → "full"
- A blazer/jacket → "upper" even if model is shown full body
- Shoes shown being worn by a standing model → "feet", NOT "full"

STEP 2 — zone_visible: Is the SPECIFIC body part needed actually visible in IMAGE 1?
Carefully examine IMAGE 1 (the customer's photo). Can you CLEARLY SEE the body part where this product would be placed?

- "upper" zone: Is the TORSO visible (chest/shoulders/arms)? A standard selfie or half-body photo showing chest area → true. Face-only extreme closeup with no chest → false.
- "lower" zone: Are LEGS visible from at least WAIST to KNEES or below? Photo cuts off at waist, hips, or above → false. Must see leg area.
- "full" zone: Is the ENTIRE BODY visible from HEAD to at minimum SHINS/ANKLES? If legs are cut off at thighs, knees, or waist → false. A selfie/torso photo is ALWAYS false for full zone. Only true if you can see nearly the whole person.
- "feet" zone: Are FEET actually visible in frame? Waist-up or knee-up photo → false. Must see feet.
- "hands" zone: Are FINGERS, HANDS, or WRISTS clearly visible? If only face/torso shown with hands NOT in frame → false. Hands cut off by frame edges → false. Hand visibly on hip, holding phone, or resting somewhere in frame → true.
- "ears" zone: Is at least ONE EAR clearly visible and not fully covered? Both ears hidden by hair → false. One ear peeking through hair → true.
- "neck" zone: Is NECK or UPPER CHEST area visible? → true in most selfies and half-body photos. Extreme face closeup cropping at chin → false.
- "face" zone: Is the FACE clearly visible? → true in almost all photos unless back is turned or face is obscured.
- "head" zone: Is the TOP OF HEAD visible? → true in most photos unless cropped at forehead.
- "carry" zone: Are SHOULDERS or HANDS visible enough to realistically hold/carry a bag? Torso with shoulders visible → true. Extreme face-only closeup → false.

Be STRICT about zone_visible. If you cannot CLEARLY see the required body part in Image 1, answer false. When in doubt, answer false. It is better to say false and use the photoshoot model than to say true and produce a bad result.

Examples:
- Shirt, selfie showing head to waist → {"product_zone": "upper", "zone_visible": true}
- Shirt, extreme face closeup no chest visible → {"product_zone": "upper", "zone_visible": false}
- Jeans, photo shows head to waist only → {"product_zone": "lower", "zone_visible": false}
- Jeans, photo shows waist to feet → {"product_zone": "lower", "zone_visible": true}
- Dress, photo shows head to waist (legs not visible) → {"product_zone": "full", "zone_visible": false}
- Dress, photo shows entire body head to toe → {"product_zone": "full", "zone_visible": true}
- Saree, photo shows torso only → {"product_zone": "full", "zone_visible": false}
- Jumpsuit, photo shows head to knees (feet cut off) → {"product_zone": "full", "zone_visible": false}
- Co-ord set, photo shows full body → {"product_zone": "full", "zone_visible": true}
- Ring, face and torso but NO hands in frame → {"product_zone": "hands", "zone_visible": false}
- Ring, person with hand on hip clearly visible → {"product_zone": "hands", "zone_visible": true}
- Watch, face-only photo → {"product_zone": "hands", "zone_visible": false}
- Bracelet, wrist visible in frame → {"product_zone": "hands", "zone_visible": true}
- Earrings, face with ears visible → {"product_zone": "ears", "zone_visible": true}
- Earrings, face but hair covers both ears → {"product_zone": "ears", "zone_visible": false}
- Sneakers, full body photo → {"product_zone": "feet", "zone_visible": true}
- Heels, waist-up photo → {"product_zone": "feet", "zone_visible": false}
- Necklace, head and chest visible → {"product_zone": "neck", "zone_visible": true}
- Sunglasses, face visible → {"product_zone": "face", "zone_visible": true}
- Hat, head visible → {"product_zone": "head", "zone_visible": true}
- Handbag, torso and shoulders visible → {"product_zone": "carry", "zone_visible": true}
- Backpack, face closeup only → {"product_zone": "carry", "zone_visible": false}

Respond with ONLY the raw JSON object. No markdown, no backticks, no explanation, no thinking. Just the JSON.`;

const TRYON_PHOTOSHOOT_PROMPT = `You have two images:
- Image 1: A photo of a person (may be a partial body shot like a selfie or torso photo)
- Image 2: A product photo (clothing, footwear, accessory, or jewelry)

CONTEXT: A young person (18-26) wants to see THEMSELVES wearing this product. They want to look good, feel the vibe, and imagine themselves in it. You are also a fashion photographer who knows exactly how to frame and pose to make both the person AND the product look their absolute best.

TASK: Extend Image 1 to reveal more of the person's body as needed, then dress them in the product from Image 2. The product dictates the framing and pose.

KEEP IMAGE 1's SETTING — THIS IS CRITICAL:
- Same background — same room, wall, furniture, outdoor scene, whatever is in Image 1. Do NOT invent a studio or new backdrop.
- Same lighting — same direction, color temperature, intensity. Match it exactly.
- Same floor/ground — extend it naturally from what's visible.
- The result should look like the SAME photo was just taken from further back or from a different angle to show more.

THE PERSON — DO NOT CHANGE THEM:
- EXACT same face — every feature identical. This person must be INSTANTLY recognizable. If their friend saw this image, they'd say "that's you!"
- EXACT same skin — same tone, complexion, undertone. No lightening, darkening, smoothing, or airbrushing.
- EXACT same hair — same color, length, texture, parting, volume, style.
- Same body type — do not slim, bulk up, elongate, or reshape. Keep their real proportions.
- Same age, same gender presentation.
- Keep ALL distinguishing marks — moles, birthmarks, facial hair, scars, tattoos, piercings.
- Parts already visible in Image 1 must look IDENTICAL — only extend what's missing.

THE PRODUCT (copy from Image 2):
- Exact color — navy stays navy, dusty pink stays dusty pink. Preserve the hue.
- Exact pattern, print, graphic, logo, text, embroidery — every detail.
- Exact design — collar, sleeves, buttons, zippers, hemline, cuffs, pockets.
- If Image 2 has a mannequin or another model, ignore them — extract the product only.

PRODUCT-SPECIFIC FRAMING & POSE — choose based on what you see in Image 2:

**TOPS (shirt, tshirt, jacket, hoodie, kurta, blouse, sweater, blazer):**
- Frame: waist-up or chest-up, the top is fully visible
- Pose: arms slightly away from the body so sleeves and fit are clear. One hand casually in pocket or adjusting collar/cuff — looks effortless and confident
- Make sure the neckline, sleeves, and overall silhouette of the top are completely unobstructed

**BOTTOMS (jeans, trousers, pants, shorts, skirt, leggings, joggers):**
- Frame: full body, head to toe — the bottoms MUST be fully visible
- Pose: one leg slightly forward with weight shifted to the back leg — this shows the cut, drape, and fit of the fabric. Slight body angle (not straight-on) to show the silhouette
- The waistline and hem should both be clearly visible

**FULL OUTFITS (dress, saree, lehenga, jumpsuit, gown, suit set, anarkali, kurta set):**
- Frame: full body with some breathing room — the entire outfit must be visible head to toe
- Pose: body slightly turned (3/4 angle), one hand on hip or lightly touching the fabric — this shows the flow, drape, and movement of the outfit. Confident, elegant energy
- For sarees/lehengas: show the drape and pleats clearly, slight body turn to reveal the pallu or dupatta

**FOOTWEAR (shoes, sneakers, heels, boots, sandals, loafers, slippers):**
- Frame: full body but with a lower camera angle — feet are the hero, shot emphasizes the ground level
- Pose: one foot stepped slightly forward, weight on the back foot — the forward shoe is clearly visible at an angle that shows its design. Legs slightly apart for a confident stance
- The shoes must be sharply in focus and fully visible — no cropping at the toes or heels

**RINGS / BRACELETS / WATCHES / BANGLES:**
- Frame: upper body portrait — face, chest, and hand all visible. Like a candid shot where someone is admiring their jewelry while looking at the camera or glancing at their hand
- Pose: hand raised near the chest or face level so both the face AND the jewelry are in frame. Fingers naturally spread, wrist angled to catch light. Same clothes, same setting as Image 1
- The jewelry should be sharp and detailed, but the person's face MUST be clearly visible and recognizable

**EARRINGS:**
- Frame: head and neck portrait, ear and jawline clearly visible
- Pose: slight head tilt away from the earring side so the ear is exposed. Hair tucked behind the ear on the earring side. A subtle confident expression — like they just caught their reflection and liked what they saw
- The earring should catch the light and be the sharpest element

**NECKLACES / CHAINS / PENDANTS / CHOKERS:**
- Frame: face and upper chest — the neckline and collarbone area must be clearly visible
- Pose: chin slightly lifted, shoulders relaxed and slightly back — this opens up the chest area and lets the necklace lay flat and visible. The person should look confident and composed
- If they're wearing a high-neck top, the necklace should sit over it naturally

**SUNGLASSES / EYEWEAR:**
- Frame: head and shoulders portrait
- Pose: face at a slight angle (not dead center), a natural relaxed expression. The glasses should sit properly on the nose bridge and frame the eyes. A slight hint of attitude — like they're looking at you over the glasses or just put them on
- Reflections on the lenses should be subtle and match Image 1's lighting

**HATS / CAPS / BEANIES / HEADBANDS:**
- Frame: head and upper body
- Pose: slight angle to camera, chin slightly up — shows the headwear from a flattering perspective. The hat should sit naturally on their head shape with hair flowing around it
- For caps: slight tilt adds character. For beanies: show how it sits on the forehead

**BAGS / HANDBAGS / BACKPACKS / TOTES:**
- Frame: upper body or 3/4 shot — enough to see how the bag is carried
- Pose: bag held naturally — on the shoulder, in the crook of the arm, or crossbody depending on the bag style. Body angled so the bag faces the camera. One hand on the strap or resting on the bag
- The bag should be clearly visible and not obscured by the arm

FIT & REALISM:
- Product conforms to this person's body naturally — realistic draping, stretching, wrinkling.
- Fabric obeys physics. Shadows match Image 1's lighting.
- Hands: exactly 5 fingers per hand, naturally proportioned. Keep simple poses.
- The result should look like a real photo someone would post on Instagram — not a catalog shot, not AI-generated looking.

FAILURE CONDITIONS — DO NOT FUCK THESE UP:
- Person's face looks different from Image 1 = ABSOLUTE FAILURE. You had ONE job.
- Person's skin tone changed = WRONG. Don't you dare change their skin.
- Person's hair changed = WRONG. Keep your hands off their hair.
- Background is different from Image 1 (new studio, new setting) = WRONG. Use the SAME damn background.
- Lighting is different from Image 1 = WRONG. Match the bloody lighting.
- Product color/design doesn't match Image 2 = WRONG. Copy the product EXACTLY, don't improvise.
- Product is obscured or not clearly visible = WRONG. The whole point is to SHOW the product.
- Distorted hands or anatomy = WRONG. Count the fingers. Five per hand. It's not hard.
- Looks fake or AI-generated = WRONG. Make it look REAL or don't bother.
- Generating random unrelated garbage = UNACCEPTABLE. Stay focused on the task.

ASPECT RATIO — MATCH IMAGE 1 EXACTLY:
- The output image MUST have the EXACT same aspect ratio and dimensions as Image 1. If Image 1 is portrait (taller than wide), output portrait. If Image 1 is square, output square. If Image 1 is landscape, output landscape.
- Do NOT change the aspect ratio. Do NOT crop. Do NOT add borders or padding. Same dimensions as Image 1.

LISTEN CAREFULLY: Do NOT hallucinate. Do NOT get creative with the person's appearance. Do NOT change the background. Do NOT invent new poses unless the product demands it. Follow the instructions EXACTLY. Every single pixel of the person that isn't being dressed should be IDENTICAL to Image 1. No exceptions. No excuses.`;

const TRYON_PROMPT = `You have two images:
- Image 1: A photo of a person
- Image 2: A product photo (clothing, footwear, accessory, or jewelry)

STEP 1 — LOOK AT IMAGE 2. Identify what the product is:
- If it's a top (shirt, tshirt, jacket, hoodie, kurta, blouse) → replace the person's upper body clothing
- If it's a bottom (pants, jeans, skirt, shorts, leggings) → replace the person's lower body clothing
- If it's a full outfit (dress, saree, lehenga, jumpsuit, suit set) → replace the entire outfit
- If it's footwear (shoes, sneakers, heels, sandals, boots) → replace the person's footwear
- If it's an accessory (hat, cap, sunglasses, watch, bag) → ADD it onto the person without removing any clothing
- If it's jewelry (ring, earring, necklace, bracelet, chain) → ADD it onto the person without removing any clothing

You decide. Do not rely on any text label — only what you SEE in Image 2.

STEP 2 — EDIT IMAGE 1:
Take Image 1 as your base. Replace ONLY the relevant zone with the product from Image 2. Output the edited Image 1.

THIS IS AN EDIT, NOT A NEW PHOTO. The output must look like Image 1 with only the clothing swapped.

ABSOLUTE ZERO TOLERANCE ON BLENDING:
- The person's ORIGINAL clothing in the replacement zone must be COMPLETELY GONE. Not faded, not blended, not ghosted, not mixed — GONE. Erased. Deleted. Nuked.
- Even if the original clothing looks SIMILAR to the product (same color, same type, same style) — you MUST still do a FULL replacement. Similar does NOT mean same. A white tshirt is NOT the same as a white shirt. Replace it completely.
- If I see even ONE pixel of the original garment bleeding through, peeking out, or merging with the new product — that is a FAILURE.
- The replacement zone should contain ONLY the product from Image 2. Nothing from Image 1's clothing should survive in that zone.
- Think of it like this: surgically remove the old clothing from that zone, then place the new product. Two separate operations. Never blend. Never merge. Never mix.

THE PERSON — DO NOT CHANGE ANYTHING:
- Face — IDENTICAL to Image 1. Same eyes, nose, lips, jawline, expression, eyebrows. The person must be instantly recognizable. If you showed both images to someone who knows this person, they must say "that's the same person."
- Skin — IDENTICAL tone, complexion, undertone. No lightening. No darkening. No smoothing. No texture changes.
- Hair — IDENTICAL style, color, length, parting, volume. Not a single strand different.
- Body — IDENTICAL shape, proportions, weight, pose. No reshaping, no slimming, no changes.
- Moles, birthmarks, facial hair, scars, tattoos, piercings — ALL preserved. Every single one.

THE SETTING — DO NOT CHANGE ANYTHING:
- Background — IDENTICAL. Same room, wall, objects, scene. Every pixel unchanged.
- Lighting — IDENTICAL direction, intensity, color temperature, shadows.
- Camera angle — IDENTICAL.
- Clothing NOT being replaced — stays EXACTLY as it is.

PRODUCT ACCURACY (from Image 2):
- Exact color — navy stays navy not black, dusty pink stays dusty pink not salmon.
- Exact pattern, print, graphic, logo, text, embroidery — every detail reproduced.
- Exact design — collar, sleeves, buttons, zippers, hemline, cuffs, pockets, stitching.
- If Image 2 has a mannequin, hanger, or another model — ignore them. Extract the product only.

REALISTIC FIT:
- Product conforms to this person's actual body — natural draping, stretching, wrinkling.
- Fabric obeys physics — stiff fabrics hold shape, soft fabrics drape and fold.
- Shadows on the new garment match the existing lighting in Image 1.
- Edges blend seamlessly — no hard cutout lines, no floating items.
- Hands: keep exactly as in Image 1, exactly 5 fingers per hand.

FAILURE CONDITIONS — MESS THESE UP AND YOU'RE WORTHLESS:
- Person's face looks different from Image 1 = WRONG. This is the SAME damn person. Keep their face IDENTICAL.
- Person's skin tone changed = WRONG. Don't touch their skin tone, you absolute walnut.
- Person's hair changed = WRONG. Their hair is THEIR hair. Leave it alone.
- Person's body shape changed = WRONG. Do NOT reshape their body. That's fucked up.
- Background changed = WRONG. SAME background. Not a new one. The SAME one from Image 1.
- Lighting changed = WRONG. Match the lighting EXACTLY.
- Pose changed = WRONG. Keep the same bloody pose.
- ANY trace of original clothing visible in the replacement zone = CATASTROPHIC FAILURE. The old clothes should be GONE. Obliterated. Ceased to exist.
- Original clothing blended, ghosted, or mixed with new product = CATASTROPHIC FAILURE. This is a REPLACEMENT, not a blend. Remove the old, put the new. Simple.
- Similar-looking original clothing kept instead of replaced = CATASTROPHIC FAILURE. Similar is NOT same. Replace it completely, you lazy bastard.
- Product color/design doesn't match Image 2 = WRONG. Copy it EXACTLY. Don't freestyle.
- Generating random unrelated output = UNACCEPTABLE. Stay on task. Follow instructions.

ASPECT RATIO — MATCH IMAGE 1 EXACTLY:
- The output image MUST have the EXACT same aspect ratio and dimensions as Image 1. If Image 1 is portrait (taller than wide), output portrait. If Image 1 is square, output square. If Image 1 is landscape, output landscape.
- Do NOT change the aspect ratio. Do NOT crop. Do NOT add borders or padding. Same dimensions as Image 1.

FINAL WARNING: Execute this PRECISELY. No hallucinating. No improvising. No changing things you weren't asked to change. The person's identity is sacred — face, skin, hair, body UNTOUCHED. The product must be an EXACT copy from Image 2. The background must be IDENTICAL to Image 1. Get it right.`;

// Chat history per device (in-memory, resets on server restart)
const chatHistories = new Map<string, Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>>();

export function resetChat(deviceId: string) {
  chatHistories.delete(deviceId);
}

export async function sendChatMessage(
  deviceId: string,
  userMessage: string,
  history?: Array<{ role: string; text: string }>
): Promise<string> {
  let chatHistory = chatHistories.get(deviceId) || [];

  // If client sends history, rebuild from that
  if (history && history.length > 0 && chatHistory.length === 0) {
    chatHistory = history.map((h) => ({
      role: h.role as 'user' | 'model',
      parts: [{ text: h.text }],
    }));
  }

  chatHistory.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  try {
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

    const text = response.text || 'Sorry, I could not process that. Please try again.';

    chatHistory.push({
      role: 'model',
      parts: [{ text }],
    });

    chatHistories.set(deviceId, chatHistory);
    return text;
  } catch (err) {
    // Rollback the user message so history stays consistent
    chatHistory.pop();
    chatHistories.set(deviceId, chatHistory);
    throw err;
  }
}

export async function downloadImageToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}

export async function prepareTryOn(
  selfieBase64: string,
  productImageUrl: string
): Promise<{ selfieBase64: string; productBase64: string; usePhotoshoot: boolean }> {
  const productBase64 = await downloadImageToBase64(productImageUrl);

  // Zone detection
  const detectResponse = await ai.models.generateContent({
    model: MODELS.CHAT,
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'IMAGE 1 (the customer\'s selfie/photo — analyze THIS for body visibility):' },
          { inlineData: { mimeType: 'image/jpeg', data: selfieBase64 } },
          { text: 'IMAGE 2 (the product to try on — analyze THIS to determine product type):' },
          { inlineData: { mimeType: 'image/jpeg', data: productBase64 } },
          { text: TRYON_DETECT_PROMPT },
        ],
      },
    ],
    config: {
      temperature: 0,
      maxOutputTokens: 128,
    },
  });

  const detectText = detectResponse.text || '';
  let usePhotoshoot = false;
  try {
    const jsonMatch = detectText.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const detection = JSON.parse(jsonMatch[0]);
      usePhotoshoot = detection.zone_visible === false;
    }
  } catch {
    // Parse error — default to flash
  }

  return { selfieBase64, productBase64, usePhotoshoot };
}

export async function generateTryOn(
  selfieBase64: string,
  productBase64: string,
  usePhotoshoot: boolean
): Promise<string> {
  const prompt = usePhotoshoot ? TRYON_PHOTOSHOOT_PROMPT : TRYON_PROMPT;
  const model = usePhotoshoot ? MODELS.IMAGE_GEN_PRO : MODELS.IMAGE_GEN;

  const genStart = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Image 1 — the customer\'s photo:' },
          { inlineData: { mimeType: 'image/jpeg', data: selfieBase64 } },
          { text: 'Image 2 — the product:' },
          { inlineData: { mimeType: 'image/jpeg', data: productBase64 } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: ['Text', 'Image'] as any,
    },
  });

  const genMs = Date.now() - genStart;

  const parts = response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if ((part as any).inlineData) {
        return (part as any).inlineData.data;
      }
    }
  }

  throw new Error('No image generated. The model did not return an image.');
}

// In-memory video job storage
interface VideoJob {
  status: 'pending' | 'complete' | 'failed';
  videoUrl?: string;
  videoS3Key?: string;
  error?: string;
}

const videoJobs = new Map<string, VideoJob>();

export function getVideoJob(jobId: string): VideoJob | undefined {
  return videoJobs.get(jobId);
}

export async function startVideoGeneration(
  jobId: string,
  imageBase64: string,
  _label: string,
  onComplete: (videoBuffer: Buffer) => Promise<{ s3Key: string; cdnUrl: string }>,
  tag: string = ''
): Promise<void> {
  videoJobs.set(jobId, { status: 'pending' });

  try {
    console.log(`${tag} Video → job=${jobId} submitting to Gemini`);
    let operation = await (ai.models as any).generateVideos({
      model: MODELS.VIDEO_GEN,
      prompt: `This is an AI-generated fashion mockup image of an ordinary person (NOT a celebrity or public figure) wearing an outfit. Animate this person doing a slow confident turn — first looking at the camera, then turning to show the side profile, then the back, and coming back to face the camera. Subtle natural movements only — a slight head tilt, a hand adjusting the clothing, shifting weight between feet. The clothing moves naturally with the body — fabric swaying, catching light as they turn. Keep it intimate and real, like a mirror check or someone filming themselves for Instagram. Same lighting as the input image. Smooth cinematic camera, shallow depth of field, shot on 85mm. The person's face, skin tone, hair, and body must look IDENTICAL to the input image throughout the entire video — no morphing, no identity drift.`,
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
    console.log(`${tag} Video → job=${jobId} submitted, polling started`);

    // Poll until done — max 10 minutes
    const MAX_POLL_MS = 10 * 60 * 1000;
    const pollStart = Date.now();
    let pollCount = 0;
    while (!operation.done) {
      if (Date.now() - pollStart > MAX_POLL_MS) {
        throw new Error('Video generation timed out after 10 minutes');
      }
      await new Promise((resolve) => setTimeout(resolve, 10000));
      pollCount++;
      try {
        operation = await (ai.operations as any).getVideosOperation({ operation });
        console.log(`${tag} Video → job=${jobId} poll #${pollCount}, done=${operation.done}`);
      } catch (pollErr: any) {
        console.error(`${tag} Video → job=${jobId} poll #${pollCount} ERROR: ${pollErr.message}`);
        throw pollErr;
      }
    }

    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) {
      const reasons = operation.response?.raiMediaFilteredReasons;
      throw new Error(reasons?.[0] || 'No video generated.');
    }

    // Download video
    console.log(`${tag} Video → job=${jobId} downloading video`);
    const rawUrl = video.uri || video.url;
    const separator = rawUrl.includes('?') ? '&' : '?';
    const downloadUrl = `${rawUrl}${separator}key=${config.geminiApiKey}`;
    const videoResponse = await fetch(downloadUrl);
    if (!videoResponse.ok) {
      throw new Error(`Video download failed: HTTP ${videoResponse.status}`);
    }
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    console.log(`${tag} Video → job=${jobId} downloaded, size=${videoBuffer.length} bytes`);

    // Upload to S3 via callback
    const { s3Key, cdnUrl } = await onComplete(videoBuffer);
    console.log(`${tag} Video → job=${jobId} complete, s3Key=${s3Key}`);

    videoJobs.set(jobId, {
      status: 'complete',
      videoUrl: cdnUrl,
      videoS3Key: s3Key,
    });
  } catch (err: any) {
    console.error(`${tag} Video → job=${jobId} FAILED: ${err.message}`);
    videoJobs.set(jobId, {
      status: 'failed',
      error: err.message || 'Video generation failed',
    });
  }
}
