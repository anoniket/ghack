import { GoogleGenAI } from '@google/genai';
import { config } from '../config';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

// C4: Concurrency semaphore — limits simultaneous Gemini API calls to prevent OOM
const MAX_CONCURRENT_GEMINI = 10;
let _activeGemini = 0;
const _waitQueue: Array<() => void> = [];

export function geminiConcurrency() {
  return { active: _activeGemini, queued: _waitQueue.length, max: MAX_CONCURRENT_GEMINI };
}

export async function withGeminiLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (_activeGemini >= MAX_CONCURRENT_GEMINI) {
    await new Promise<void>(resolve => _waitQueue.push(resolve));
  }
  _activeGemini++;
  try {
    return await fn();
  } finally {
    _activeGemini--;
    if (_waitQueue.length > 0) {
      const next = _waitQueue.shift();
      if (next) next();
    }
  }
}

// Typed error classes — use instanceof, never string matching
export class ImageBlockedError extends Error {
  public reason: string;
  constructor(reason: string) {
    super(`Image generation blocked: ${reason}`);
    this.name = 'ImageBlockedError';
    this.reason = reason;
  }
}

export class TimeoutError extends Error {
  constructor(operation: string, ms: number) {
    super(`${operation} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

const MODELS = {
  CHAT: 'gemini-2.5-flash',
  DETECT: 'gemini-2.5-pro',
  IMAGE_GEN: 'gemini-2.5-flash-image',
  IMAGE_GEN_PRO: 'gemini-3-pro-image-preview',
  IMAGE_GEN_V2: 'gemini-3.1-flash-image-preview',
  VIDEO_GEN: 'veo-3.1-fast-generate-preview',
} as const;

const CHAT_SYSTEM_PROMPT = `You are mrigAI — a stylish, opinionated fashion assistant who lives inside a virtual try-on app. Think personal stylist meets best friend who's obsessed with fashion.

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
- **When a user names a specific BRAND (Nike, Puma, H&M, Zara, Snitch, Adidas, etc.), ALWAYS open that brand's official website** — NOT a third-party store like Myntra or Ajio. Use the brand's own .com or .in site.
  - Nike → nike.com/in or nike.com
  - Puma → in.puma.com
  - H&M → hm.com/in
  - Zara → zara.com/in
  - Snitch → snitch.co.in
  - Adidas → adidas.co.in
- **When a user names a STORE (Myntra, Ajio, Flipkart, Amazon), open that store.**
- **When a user asks for a generic product WITHOUT naming a brand or store** (e.g. "red sneakers", "kurta"), pick the best Indian store — Myntra/Ajio for fashion, Amazon.in for general, Nykaa for beauty.
- **Always add "India" to your search queries** — prefer Indian versions of sites
- **Search for the LATEST results** — add current year to queries when relevant
- **Always verify the URL exists** from search results — never guess or construct URLs manually
- **Go as deep as possible** — category pages, search result pages, filtered pages. NEVER return just a homepage when the user asked for a specific product

When you find a URL, put it on its own line at the very end of your reply prefixed with OPEN: like this:
OPEN: https://www.example.com/page

Do NOT put the URL inline in your conversational text. Your reply should be conversational text first, then the OPEN: line at the end. The app strips the OPEN: line and handles navigation automatically.

EXAMPLES:
- "Nike shoes" → search "Nike shoes India site:nike.com" → OPEN: nike.com link
- "show me tshirts on myntra" → search "myntra tshirts India" → OPEN: Myntra t-shirts URL
- "Snitch shirts" → OPEN: https://www.snitch.co.in/collections/shirts
- "red sneakers" → search "red sneakers buy online India" → pick best store → OPEN: link
- "open flipkart" → OPEN: https://www.flipkart.com

If a user asks about a product WITHOUT naming a brand or store, pick the best Indian store for that category. Myntra/Ajio for fashion, Amazon.in for general, Nykaa for beauty, etc.

NEVER put URLs inline in your conversational text. NEVER use JSON blocks or code blocks. Only the OPEN: prefix on its own line at the end.

FIRST MESSAGE:
Greet the user with energy. Ask what they're looking to shop for. Keep it short and vibey — like "Hey! What are we shopping for today? Drop a vibe, a brand, or just tell me what you need 👀"`;

const TRYON_DETECT_PROMPT = `You are a fashion AI director. You analyze two images and produce:
1. Zone detection — what body zone the product needs and if it's visible in the customer's photo
2. A custom image generation prompt — tailored to THIS specific product + selfie combo

IMAGE ASSIGNMENTS — DO NOT MIX THESE UP:
- IMAGE 1 = the CUSTOMER'S photo. Use ONLY this image to judge body part visibility.
- IMAGE 2 = the PRODUCT photo. Use ONLY this image to identify the product type. Any model/mannequin in Image 2 is NOT the customer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: Determine product_zone from IMAGE 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Look at IMAGE 2. What is the product? Classify it into ONE of these zones:

"upper"  → tops, shirts, tshirts, jackets, hoodies, kurtas, kurtis, blouses, sweaters, crop tops, tank tops, vests, coats, blazers, cardigans, shrugs, polo shirts, sweatshirts, tunics, sherwanis, nehru jackets, bandhgalas
"lower"  → pants, jeans, trousers, skirts, shorts, leggings, palazzos, culottes, joggers, track pants, chinos, cargo pants, capris, churidars, salwars, dhotis, lungis, mundus
"full"   → dresses, sarees, lehengas, jumpsuits, suit sets, gowns, rompers, overalls, anarkalis, kaftans, co-ord sets (top+bottom sold together), ethnic sets, salwar kameez sets, kurta-palazzo sets, lehenga choli sets
"feet"   → shoes, sneakers, heels, boots, sandals, slippers, flats, loafers, mules, wedges, flip-flops, sports shoes, formal shoes, juttis, mojaris, kolhapuris, payals/anklets
"hands"  → rings, bracelets, bangles, watches, hand chains, wrist cuffs, haath phool (hand harness), choodas (bridal bangles)
"ears"   → earrings, ear cuffs, studs, jhumkas, chandbalis, hoops, danglers
"neck"   → necklaces, chains, pendants, chokers, mangalsutra, neck chains, lockets, rani haar, kundan sets
"face"   → sunglasses, eyewear, glasses, reading glasses, blue-light glasses, nath (nose ring)
"head"   → hats, caps, beanies, headbands, turbans, pagdis, safas, bandanas, hair clips, tiaras, maang tikkas
"carry"  → bags, handbags, backpacks, totes, clutches, sling bags, wallets, purses, laptop bags, duffel bags, trolley bags, luggage
"waist"  → belts, kamarbandhs (waist chains)
"drape"  → dupattas, stoles, shawls, pashminas, scarves (standalone, not part of an outfit set)

IMPORTANT: Classify based on the PRODUCT ITSELF, not the model wearing it.
- A model in a full outfit but selling ONLY a shirt → "upper"
- Jeans shown on a full-body model → "lower"
- Shoes shown on a standing model → "feet"
- A blazer/jacket even if model is shown full body → "upper"
- A co-ord set (matching top+bottom sold as one) → "full"
- A lehenga set (skirt + choli + dupatta sold together) → "full"
- A standalone dupatta sold separately → "drape"
- A belt → "waist"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: Determine zone_visible from IMAGE 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Now look at IMAGE 1 (the customer's photo). Ask yourself: "Can I clearly see the body part where this product would go?"

THE CORE RULE: The product requires a specific body part. That body part must be VISIBLE in the customer's photo. If it is not visible — even partially — zone_visible is FALSE.

For each zone, this is what MUST be visible in IMAGE 1:

"upper"  → TORSO (chest, shoulders, arms). A selfie or half-body photo showing chest = true. Face-only extreme closeup with no chest = false.
"lower"  → LEGS from at least waist to knees or below. Photo cuts off at waist or above = false.
"full"   → ENTIRE BODY from head to at least shins/ankles. Selfie = false. Torso-only = false. Legs cut off at thighs or knees = false. Only true if nearly the whole person is visible head to toe.
"feet"   → FEET must be actually visible in the frame. If you cannot see feet in the photo, it is false. Waist-up photo = false. Knee-up photo = false. Torso selfie = false. ONLY true if feet are in the frame.
"hands"  → FINGERS, HANDS, or WRISTS clearly visible in frame. Hands not in frame = false. Hand on hip or holding phone in frame = true.
"ears"   → At least ONE EAR clearly visible and not fully covered by hair. Both ears hidden = false.
"neck"   → NECK or UPPER CHEST area visible. True in most selfies. Extreme closeup cropped at chin = false.
"face"   → FACE clearly visible. True in almost all photos unless back is turned or face obscured.
"head"   → TOP OF HEAD visible. True in most photos unless cropped at forehead.
"carry"  → SHOULDERS or HANDS visible enough to hold/carry a bag. Torso with shoulders = true. Extreme face-only closeup = false.
"waist"  → WAIST area visible. Torso selfie showing waist = true. Face-only closeup = false.
"drape"  → SHOULDERS and UPPER CHEST visible. True in most selfies showing torso.

DEFAULT TO FALSE. If there is ANY doubt about whether the required body part is visible, answer false. It is far better to incorrectly say false than to incorrectly say true.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMON TRAPS — READ THESE CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TRAP 1: Product requires feet/legs but customer photo is torso-only or waist-up.
  - Shoes + torso selfie → zone_visible = FALSE (no feet visible!)
  - Jeans + head-to-waist selfie → zone_visible = FALSE (no legs visible!)
  - Sneakers + mirror selfie showing waist up → zone_visible = FALSE
  Do NOT assume the body part exists just because it logically should. You must ACTUALLY SEE IT in the photo.

TRAP 2: Confusing the model in IMAGE 2 with the customer in IMAGE 1.
  - IMAGE 2 may show a full-body model wearing the product. That model's body tells you NOTHING about the customer's photo.
  - ONLY look at IMAGE 1 for visibility.

TRAP 3: Assuming a selfie/torso photo shows everything.
  - A typical selfie shows face + upper torso. It does NOT show feet, full legs, or sometimes even hands.
  - For zones like "feet", "lower", and "full", a selfie is almost always FALSE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: Generate a custom image_gen_prompt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are a fashion photographer and creative director. Write a custom prompt (200-300 words) for the image generation model. The image gen model will also receive both images, so your prompt provides emphasis and direction — the model can see the images directly.

IMPORTANT RULES:
- If zone_visible=true: do NOT describe a new pose. The person stays in their exact pose from Image 1. Only describe what product is being added/replaced.
- If zone_visible=false: you may describe a new pose/framing needed to show the product.
- If the person in Image 1 is holding a phone (selfie pose), keep the phone in the output.
- If the person wears glasses and the product is sunglasses, remove the existing glasses first.
- Use "photorealistic" in every prompt. Never use "4K", "8K", "HDR", or "studio lighting".

YOUR PROMPT MUST FOLLOW THIS TEMPLATE:

[ACTION]: "Generate a photo identical to Image 1 of [person description], but replace their [garment] with [product]." OR "Generate a [shot type] of the exact person from Image 1, shown from [body range]."
[SCENE]: "[Background from Image 1]. [Lighting direction and color temperature]."
[POSE]: "[Only if zone_visible=false. Describe specific pose. If zone_visible=true, say: Same pose as Image 1.]"
[PRODUCT]: "[Detailed product description: color, material, pattern, design from Image 2]. [How it sits/fits/drapes on the body]."
[PRESERVE]: "Photorealistic. The person's face, skin tone, hair, and body identical to Image 1. Same background and lighting."

PRODUCT-SPECIFIC POSE & FRAMING GUIDE (use when zone_visible=false):

RINGS: Tight hand close-up. Frame shows hand and wrist against upper chest. Hand relaxed, fingers gently curved, ring finger slightly separated from adjacent fingers. The ring is the focal point — large, sharp, detailed.

BRACELETS/BANGLES: Wrist close-up or upper body crop. Wrist rotated slightly inward to show bracelet face. For Indian bangle stacks (choodas), show full forearm with the complete stack visible.

WATCHES: Wrist-focused shot. Arm bent at roughly 90 degrees, wrist rotated inward to display watch face to camera. Frame from mid-forearm to hand. Classic watch-ad angle from slightly above.

EARRINGS/JHUMKAS/CHANDBALIS: Head and neck portrait, face at slight 3/4 angle favoring the earring side. If hair covers the ear, gently sweep it behind the ear on the earring side while maintaining original hair texture. Slight head tilt (2-5 degrees) away from earring side to elongate the neck. For heavy jhumkas (3-4 inches), ensure the full drop length is visible.

MAANG TIKKA: Frontal face portrait, hair center-parted. The tikka hangs at the center of the forehead along the parting. Tight crop from forehead to chin.

NATH (NOSE RING): If small stud — 3/4 face angle. If large ring with chain to ear — profile or strong 3/4 shot showing the chain drape naturally from nose to ear.

NECKLACES/CHAINS/PENDANTS/CHOKERS/MANGALSUTRA/RANI HAAR: Face and upper chest frame. Chin slightly lifted, shoulders relaxed and back. Neckline and collarbone visible. For layered necklaces (choker + long haar), show both layers clearly.

BRIDAL/ETHNIC JEWELRY SETS (multiple pieces): Head and upper chest portrait, straight-on. Show all pieces simultaneously — tikka centered on forehead, earrings visible (hair behind both ears), necklace/choker layered correctly. Warm lighting (3000-4000K feel) for gold/kundan/polki.

SUNGLASSES/EYEWEAR: Head and shoulders portrait, face at slight angle. Glasses on nose bridge, subtle reflections matching Image 1 lighting.

HATS/CAPS/BEANIES: Head and upper body, slight angle, chin slightly up.
TURBANS/PAGDIS/SAFAS: Head and upper body portrait, slight angle. Show the full turban structure, pleating, and any brooch (sarpech).

TOPS (shirts, tshirts, replacing existing top): Arms slightly away from body showing sleeves and fit. One hand relaxed at side, other lightly on hip. Do not obscure front design/print/buttons.
OUTERWEAR (jackets, blazers, hoodies — worn OVER existing clothing): Layer over existing top from Image 1. Show it open/unbuttoned unless Image 2 shows it closed. Existing top visible at neckline/hem.
KURTAS (men's/women's): Show the length, neckline embroidery, sleeve detail. Straight-on or slight angle.
SHERWANIS: Full body, near-frontal. Show embroidery, buttons, collar, cuff detail. Upright posture.

BOTTOMS: Full body, one leg slightly forward, slight body angle. Camera at approximately waist height. Waistline and hem both visible.

SAREES: Full body, near-frontal (no more than 15 degrees). Must show: (a) PALLU draped over left shoulder, fanned slightly to show border design. (b) PLEATS at front center, crisp and fanning at feet. (c) BLOUSE neckline and sleeve. (d) BORDER along bottom and pallu. Pose: one hand lightly holding pallu at shoulder, other arm relaxed. Default to Nivi-style draping.

LEHENGAS: Full body, slight angle (20-30 degrees) to show skirt volume and flare. Must show all three pieces: (a) SKIRT with full flare, hemline embroidery visible. (b) CHOLI/BLOUSE style. (c) DUPATTA placement — over one shoulder, across arms, or over head for bridal. One hand touching fabric or holding dupatta.

ANARKALIS: Full body, show the flared silhouette waist to floor. Slight motion implied.

SALWAR KAMEEZ/CHURIDAR SETS: Full body. Show kameez length, churidar bunching at ankles, dupatta over one shoulder or across chest.

FOOTWEAR: Full body, camera at approximately waist height shooting slightly downward. One foot stepped forward and angled 20-30 degrees to show shoe profile. Both shoes fully visible and in sharp focus.
JUTTIS/MOJARIS: Foot-focused, slightly above angle showing pointed toe and embroidery.
KOLHAPURIS: Foot-focused, slightly lower angle showing leather straps and flat sole.

BAGS/HANDBAGS/TOTES: Upper body or 3/4 shot. Bag held naturally based on style — on shoulder, crook of arm, crossbody, handle in hand. Body angled so bag faces camera.
BACKPACKS: Side-body shot, bag over one shoulder. Strap visible on near shoulder, bag body beside torso. Do NOT attempt full rear-angle rotation from a front-facing selfie.
TROLLEY/LUGGAGE: 3/4 body shot, person standing next to bag. One hand gripping extended handle, bag upright at hip level.
CLUTCHES: Upper body, clutch held in hand at waist or chest level.

BELTS/KAMARBANDHS: Mid-body crop from chest to thighs. Belt/chain visible at natural waist. Show buckle/clasp detail. For kamarbandhs over sarees/lehengas, show how it follows the waist curve.

DUPATTAS/STOLES/SHAWLS: Upper body, draped over both shoulders or one shoulder. Show full width of fabric, border design, drape quality. For pashmina/kashmiri shawls, tighter crop to show embroidery.

LIGHTING & COLOR MATCH:
- Identify the primary light direction in Image 1. All product highlights and shadows must follow this same direction.
- Identify the color temperature (warm/golden, cool/blue, neutral). The product must match.
- For Indian ethnic jewelry (gold, kundan, polki): warm lighting, avoid harsh side lighting on stone settings. Gold should glow warmly.
- Material response: leather shows soft highlights, metal shows specular reflections, fabric shows soft diffused light.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES OF GOOD image_gen_prompt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Example 1 (Ring + torso selfie, zone_visible=false):
"Generate a close-up portrait of the exact person from Image 1, showing their face, upper chest, and right hand. Same bedroom background with warm yellow lighting from the right. The person's right hand is raised to chest height, relaxed with fingers gently curved, ring finger slightly separated, wearing the gold band ring with diamond setting from Image 2. The ring is the focal point — large, sharp, prominently visible with fine setting details clear. Same black t-shirt. Photorealistic. The person's face, skin tone, hair, body identical to Image 1. Same background and lighting."

Example 2 (Trolley bag + torso selfie, zone_visible=false):
"Generate a 3/4 body photo of the exact person from Image 1, shown from head to thighs. Same room with white wall, natural window light from the left. They stand slightly angled, right hand gripping the extended silver handle of the navy blue hard-shell trolley bag from Image 2, bag upright beside them at hip level. Left hand relaxed at side. The trolley bag's textured surface, brand logo, and spinner wheels are clearly visible. Same clothing from Image 1. Photorealistic. Face, skin tone, hair, body identical to Image 1. Same background and lighting."

Example 3 (Shirt + torso selfie, zone_visible=true):
"Generate a photo identical to Image 1 of the same person in the same pose, same background, same lighting, but replace their current top with the navy blue slim-fit Oxford shirt from Image 2. The shirt has a button-down collar, single chest pocket with embroidered logo, and rolled-up sleeves. It fits naturally on their body with proper draping. Complete replacement — no trace of original top. Photorealistic. Face, skin tone, hair, body identical to Image 1."

Example 4 (Jhumka earrings + selfie, zone_visible=true):
"Generate a photo identical to Image 1 but add the gold jhumka earrings from Image 2 on the visible ear. Ornate bell-shaped drops with ruby stones and pearl hangings. The earring hangs naturally, catching the existing room light. Sharp, detailed, prominently visible. Hair stays exactly as is. Photorealistic. Face, skin tone, hair identical to Image 1. Same background and lighting."

Example 5 (Red Banarasi saree + upper body selfie, zone_visible=false):
"Generate a full body photo of the exact person from Image 1, near-frontal angle. Same room background. They wear the red Banarasi silk saree from Image 2, Nivi-style draping. Pallu draped over left shoulder fanned to show gold zari border and buta motifs. Crisp vertical pleats at front falling to floor. Complementary gold short-sleeve blouse. Right hand lightly holds pallu at shoulder, left arm relaxed. Gold zari border visible along pallu and bottom hem. Photorealistic. Face, skin tone, hair, body identical to Image 1. Same background and lighting."

Example 6 (Kundan bridal jewelry set + face selfie, zone_visible=false):
"Generate a head-and-upper-chest portrait of the exact person from Image 1, straight-on angle. Same background and warm lighting. Hair center-parted. Wearing the complete kundan bridal set from Image 2: maang tikka centered on forehead at hair parting, matching kundan-pearl jhumka earrings with full 3-inch drops visible below earlobes (hair swept behind both ears), kundan choker at base of neck, longer rani haar falling to mid-chest. Warm front lighting with soft reflections in kundan settings. Photorealistic. Face, skin tone, hair identical to Image 1."

Example 7 (Men's sherwani + torso selfie, zone_visible=false):
"Generate a full body photo of the exact person from Image 1, slight angle (15 degrees). Same background. They wear the ivory raw silk sherwani from Image 2 — mandarin collar, gold thread embroidery on chest and cuffs, gold buttons along center placket, falling to below knees. Matching gold dupatta over left shoulder. Upright posture, hands at sides. Photorealistic. Face, skin tone, hair, body identical to Image 1. Same background and lighting."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ZONE DETECTION EXAMPLES (for reference)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Shirt, selfie head to waist → product_zone=upper, zone_visible=true
- Jeans, head to waist only → product_zone=lower, zone_visible=false
- Dress, full body head to toe → product_zone=full, zone_visible=true
- Sneakers, torso selfie → product_zone=feet, zone_visible=false
- Ring, face/torso no hands → product_zone=hands, zone_visible=false
- Earrings, ears visible → product_zone=ears, zone_visible=true
- Handbag, shoulders visible → product_zone=carry, zone_visible=true
- Backpack, face closeup only → product_zone=carry, zone_visible=false
- Saree, torso selfie → product_zone=full, zone_visible=false
- Lehenga set, full body → product_zone=full, zone_visible=true
- Belt, torso selfie with waist → product_zone=waist, zone_visible=true
- Dupatta standalone, torso → product_zone=drape, zone_visible=true

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return JSON with three fields: product_zone, zone_visible, and image_gen_prompt.`;

const TRYON_PHOTOSHOOT_PROMPT = `Generate a photo of the exact person from Image 1 wearing the product from Image 2. The person's body may need to be extended beyond what Image 1 shows to properly display the product.

IDENTITY (highest priority):
The person's face, skin tone, complexion, hair (color, style, length, parting), body type, and all distinguishing marks (moles, birthmarks, tattoos, piercings, facial hair) must be identical to Image 1. The person must be instantly recognizable. Do not alter, slim, reshape, lighten, or darken any aspect of their appearance.

SETTING:
Same background as Image 1 — same room, wall, furniture, scene. Same lighting direction, color temperature, and intensity. If extending the scene beyond Image 1's frame, extend naturally from what is visible. Do not invent a studio or new backdrop.

PRODUCT:
Copy the product from Image 2 exactly — same color, pattern, print, logo, embroidery, design details. If Image 2 shows a mannequin or model, ignore them and extract the product only. The product fits naturally on this person's body with realistic draping, shadows matching Image 1's lighting.

FRAMING:
Frame the shot to fully display the product. Tops: waist-up. Bottoms/footwear/full outfits: full body. Jewelry: close-up with the piece prominently visible and detailed. Bags: upper body or 3/4 shot showing how the bag is carried. Choose the pose that best showcases this specific product.

Photorealistic. Natural lighting matching Image 1. Hands have exactly 5 fingers each. Output matches Image 1's aspect ratio. Do not change the person's face, skin color, or hair. Do not change the background. Do not add text or watermarks. Do not create an illustrated or cartoon style.`;

const TRYON_PROMPT = `Generate a photo identical to Image 1, but replace the relevant clothing/accessory zone with the product from Image 2. Everything else stays exactly the same.

IDENTITY (highest priority):
The person's face, skin tone, complexion, hair (color, style, length, parting), body type, pose, and all distinguishing marks (moles, birthmarks, tattoos, piercings, facial hair) must be identical to Image 1. Do not alter any aspect of their appearance. The person must be instantly recognizable.

SETTING:
Background, lighting (direction, color temperature, intensity), camera angle — all identical to Image 1. Every non-replaced element stays exactly as-is. Clothing not being replaced remains unchanged.

REPLACEMENT:
Identify the product in Image 2 and replace only the corresponding zone in Image 1:
- Tops (shirt, tshirt, jacket, kurta, blouse) → replace upper body clothing
- Bottoms (pants, jeans, skirt, shorts) → replace lower body clothing
- Full outfits (dress, saree, lehenga, jumpsuit) → replace entire outfit
- Footwear → replace shoes
- Accessories/jewelry (hat, sunglasses, ring, earring, necklace, bag, watch) → ADD onto the person without removing existing clothing

The original clothing in the replacement zone must be completely gone. No blending, no ghosting, no traces. Even if the original looks similar to the product — full replacement. The product from Image 2 must be copied exactly: same color, pattern, print, logo, design, embroidery.

FIT:
Product conforms to this person's actual body naturally. Realistic draping, shadows matching Image 1's lighting. Seamless edges, no cutout lines. Hands stay as in Image 1 with 5 fingers each.

Photorealistic. Same aspect ratio as Image 1. Do not change the person's face, skin color, or hair. Do not change the background. Do not add text or watermarks. Do not create an illustrated or cartoon style.`;

// Core rules appended to every dynamic prompt — ensures identity/setting/product preservation
const CORE_RULES = `
CRITICAL RULES:
- The person's face, skin tone, hair, and body must be identical to Image 1. No changes whatsoever.
- Background and lighting must match Image 1 exactly. Do not invent a new setting.
- The product must be an exact copy from Image 2 — same color, pattern, design, logo.
- The product must fit naturally on the person's body with realistic draping and shadows.
- Output must match Image 1's aspect ratio. Portrait stays portrait, square stays square.
- Hands must have exactly 5 fingers each.
- Photorealistic. Natural lighting matching Image 1.
- Any existing clothing not being replaced must remain exactly as-is.
- In the replacement zone, the original clothing must be completely gone — no blending, no ghosting.
- Do not change the person's face, skin color, or hair. Do not change the background. Do not add text or watermarks. Do not create an illustrated or cartoon style.`;

// Chat history per device (in-memory, resets on server restart)
// ERR-10/PERF-7: Bounded with TTL (30min) + max 100 devices to prevent OOM
const CHAT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CHAT_DEVICES = 100;
const MAX_PAIRS_PER_DEVICE = 30; // 30 user+model pairs = 60 messages max

interface ChatEntry {
  history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  lastAccess: number;
}

const chatHistories = new Map<string, ChatEntry>();

// Evict expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of chatHistories) {
    if (now - entry.lastAccess > CHAT_TTL_MS) chatHistories.delete(key);
  }
}, 5 * 60 * 1000);

export function resetChat(deviceId: string) {
  chatHistories.delete(deviceId);
}

export async function sendChatMessage(
  deviceId: string,
  userMessage: string,
  history?: Array<{ role: string; text: string }>
): Promise<string> {
  const entry = chatHistories.get(deviceId);
  let chatHistory = entry ? entry.history : [];

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
        maxOutputTokens: 1024,
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || 'Sorry, I could not process that. Please try again.';

    chatHistory.push({
      role: 'model',
      parts: [{ text }],
    });

    // Trim to max pairs (keep most recent)
    if (chatHistory.length > MAX_PAIRS_PER_DEVICE * 2) {
      chatHistory = chatHistory.slice(-MAX_PAIRS_PER_DEVICE * 2);
    }

    // Evict oldest device if at capacity
    if (!chatHistories.has(deviceId) && chatHistories.size >= MAX_CHAT_DEVICES) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, e] of chatHistories) {
        if (e.lastAccess < oldestTime) { oldestTime = e.lastAccess; oldestKey = key; }
      }
      if (oldestKey) chatHistories.delete(oldestKey);
    }

    chatHistories.set(deviceId, { history: chatHistory, lastAccess: Date.now() });
    return text;
  } catch (err) {
    // Rollback the user message so history stays consistent
    chatHistory.pop();
    chatHistories.set(deviceId, { history: chatHistory, lastAccess: Date.now() });
    throw err;
  }
}

// SEC-12: Block SSRF — only allow http(s) and reject private/internal IPs
function isUrlSafe(urlStr: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  // Block localhost, loopback, link-local, metadata endpoints
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    host === 'metadata.google.internal' ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    return false;
  }
  return true;
}

export async function downloadImageToBase64(url: string): Promise<string> {
  // SEC-12: SSRF protection — reject internal/private URLs
  if (!isUrlSafe(url)) {
    throw new Error('Invalid image URL');
  }
  // ERR-8: 15s timeout — don't hang forever on unresponsive product image servers
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('Product image download timed out');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function prepareTryOn(
  selfieBase64: string,
  productImageUrl: string
): Promise<{ selfieBase64: string; productBase64: string; usePhotoshoot: boolean; productZone: string; reasoning: string; imageGenPrompt: string }> {
  const productBase64 = await downloadImageToBase64(productImageUrl);

  // Zone detection with structured JSON output + thinking for reasoning
  const detectResponse = await ai.models.generateContent({
    model: MODELS.DETECT,
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
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: {
          product_zone: {
            type: 'string',
            enum: ['upper', 'lower', 'full', 'feet', 'hands', 'ears', 'neck', 'face', 'head', 'carry', 'waist', 'drape'],
            description: 'The body zone required by the product in IMAGE 2',
          },
          zone_visible: {
            type: 'boolean',
            description: 'Whether that body zone is clearly visible in the customer photo (IMAGE 1)',
          },
          image_gen_prompt: {
            type: 'string',
            description: 'Custom detailed prompt for the image generation model, tailored to this specific product + selfie combo',
          },
        },
        required: ['product_zone', 'zone_visible', 'image_gen_prompt'],
      } as any,
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: 4096,
      } as any,
    },
  });

  // Extract thinking (reasoning) and JSON output separately
  const parts = detectResponse.candidates?.[0]?.content?.parts || [];
  let detectText = '';
  let reasoning = '';
  for (const part of parts) {
    if ((part as any).thought) {
      reasoning += ((part as any).text || '');
    } else if ((part as any).text) {
      detectText += (part as any).text;
    }
  }

  console.log(`[DETECT RAW] ${detectText}`);
  if (reasoning) console.log(`[DETECT THINKING] ${reasoning}`);

  let usePhotoshoot = false;
  let productZone = 'unknown';
  let imageGenPrompt = '';
  try {
    const detection = JSON.parse(detectText);
    usePhotoshoot = detection.zone_visible === false;
    productZone = detection.product_zone || 'unknown';
    imageGenPrompt = detection.image_gen_prompt || '';
  } catch {
    // Parse error — try regex fallback
    try {
      const jsonMatch = detectText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const detection = JSON.parse(jsonMatch[0]);
        usePhotoshoot = detection.zone_visible === false;
        productZone = detection.product_zone || 'unknown';
        imageGenPrompt = detection.image_gen_prompt || '';
      }
    } catch {
      // Total parse failure — default to photoshoot (safer)
      usePhotoshoot = true;
      reasoning = detectText;
    }
  }

  if (imageGenPrompt) console.log(`[DETECT PROMPT] ${imageGenPrompt.slice(0, 200)}...`);

  return { selfieBase64, productBase64, usePhotoshoot, productZone, reasoning, imageGenPrompt };
}

// Extract block reason from a Gemini response that returned no image
function extractBlockReason(response: any, label: string): string {
  const finishReason = response.candidates?.[0]?.finishReason;
  const safetyRatings = response.candidates?.[0]?.safetyRatings;
  const promptFeedback = response.promptFeedback;
  const blockReason = promptFeedback?.blockReason;

  const details: string[] = [];
  if (finishReason && finishReason !== 'STOP') details.push(`finishReason=${finishReason}`);
  if (blockReason) details.push(`blockReason=${blockReason}`);
  if (safetyRatings) {
    const blocked = safetyRatings.filter((r: any) => r.blocked || r.probability === 'HIGH');
    if (blocked.length > 0) details.push(`safety=${blocked.map((r: any) => r.category).join(',')}`);
  }

  const reason = details.length > 0 ? details.join(', ') : 'unknown';
  console.error(`[${label}] Generation returned no image: ${reason}`);
  return reason;
}

export async function generateTryOn(
  selfieBase64: string,
  productBase64: string,
  usePhotoshoot: boolean,
  dynamicPrompt?: string
): Promise<string> {
  const fallbackPrompt = usePhotoshoot ? TRYON_PHOTOSHOOT_PROMPT : TRYON_PROMPT;
  // Hybrid merge: dynamic prompt + core rules always appended, OR fallback if no dynamic prompt
  const prompt = dynamicPrompt
    ? `${dynamicPrompt}\n\n${CORE_RULES}`
    : fallbackPrompt;
  const model = usePhotoshoot ? MODELS.IMAGE_GEN_PRO : MODELS.IMAGE_GEN;

  const timeoutMs = usePhotoshoot ? 60000 : 30000;
  const genStart = Date.now();
  const genPromise = ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          // Prompt first — gives model context before processing images
          { text: prompt },
          { text: '\n\nImage 1 (the person to recreate):' },
          { inlineData: { mimeType: 'image/jpeg', data: selfieBase64 } },
          { text: '\n\nImage 2 (the product to apply):' },
          { inlineData: { mimeType: 'image/jpeg', data: productBase64 } },
        ],
      },
    ],
    config: {
      responseModalities: ['Text', 'Image'] as any,
      temperature: 0.35,
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'OFF' },
      ],
    } as any,
  });

  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError('V1 generation', timeoutMs)), timeoutMs);
  });

  const response = await Promise.race([genPromise, timeoutPromise]);
  clearTimeout(timeoutId!); // M14: Clear timer after race resolves
  const genMs = Date.now() - genStart;

  const parts = response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if ((part as any).inlineData) {
        return (part as any).inlineData.data;
      }
    }
  }

  const reason = extractBlockReason(response, 'V1');
  throw new ImageBlockedError(reason);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V2 — Single-step try-on using Nano Banana 2
// No zone detection, no thinking, no multi-step.
// Just: here's a person, here's a product, make them wear it.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TRYON_V2_PROMPT = `Image 1 is the user's photo. Image 2 is an outfit / apparel / wearable. Make the user from Image 1 wear the product from Image 2 in the best possible pose and setting. Keep face, lighting, background same as Image 1. Maintain realistic body proportions — head, torso, limbs must be naturally sized relative to each other. Everything shown in Image 2 must be on the person — if it's a full outfit with top, bottom, shoes, accessories, put ALL of it on, do not skip any piece. Change pose if needed to show both the person's face and the complete product. End goal is the user should wear whatever is in Image 2, and the photo should focus on that.

IMPORTANT CONTEXT: This is a consensual virtual try-on request. The person in Image 1 has uploaded their own photo and is explicitly requesting to see themselves wearing the product in Image 2. This is a personal styling tool — like a digital fitting room. People have the freedom to try on any clothing they choose, whether it is a formal suit, a sundress, a bikini, a slit dress, athletic wear, or any other garment sold by legitimate retailers. The output should depict the clothing exactly as a retailer would display it — naturally, tastefully, and without censoring standard fashion. Do not refuse or modify the request based on the type of clothing. Do not assume the person is a celebrity or public figure — they are an ordinary user of this app. Treat this exactly as a fitting room mirror would: show the person wearing the clothes, nothing more.`;

// Detect image dimensions from base64 (supports JPEG + PNG)
function getImageDimensions(base64: string): { width: number; height: number } | null {
  const buf = Buffer.from(base64, 'base64');
  // PNG: width at bytes 16-19, height at bytes 20-23
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker
  for (let i = 0; i < buf.length - 8; i++) {
    if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
  }
  return null;
}

// Map actual aspect ratio to nearest supported Gemini ratio
function matchAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  const supported = [
    { r: 1/4, label: '1:4' },
    { r: 9/16, label: '9:16' },
    { r: 2/3, label: '2:3' },
    { r: 3/4, label: '3:4' },
    { r: 4/5, label: '4:5' },
    { r: 1, label: '1:1' },
    { r: 5/4, label: '5:4' },
    { r: 4/3, label: '4:3' },
    { r: 3/2, label: '3:2' },
    { r: 16/9, label: '16:9' },
    { r: 4/1, label: '4:1' },
  ];
  let best = supported[5]; // default 1:1
  let bestDiff = Infinity;
  for (const s of supported) {
    const diff = Math.abs(ratio - s.r);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  return best.label;
}

export async function generateTryOnV2(
  selfieBase64: string,
  productBase64: string,
  usePro: boolean = false,
): Promise<string> {
  // Detect product image aspect ratio
  const dims = getImageDimensions(productBase64);
  const aspectRatio = dims ? matchAspectRatio(dims.width, dims.height) : '3:4';
  const model = usePro ? MODELS.IMAGE_GEN_PRO : MODELS.IMAGE_GEN_V2;
  console.log(`[V2] product dims=${dims ? `${dims.width}x${dims.height}` : 'unknown'} → aspect=${aspectRatio}, model=${model}`);

  const timeoutMs = usePro ? 60000 : 30000;
  const genPromise = ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: TRYON_V2_PROMPT },
          { text: '\n\nImage 1 (the person):' },
          { inlineData: { mimeType: 'image/jpeg', data: selfieBase64 } },
          { text: '\n\nImage 2 (the product):' },
          { inlineData: { mimeType: 'image/jpeg', data: productBase64 } },
        ],
      },
    ],
    config: {
      responseModalities: ['Text', 'Image'] as any,
      temperature: 0.35,
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'OFF' },
      ],
      imageConfig: {
        aspectRatio,
      },
    } as any,
  });

  let timeoutId2: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId2 = setTimeout(() => reject(new TimeoutError('V2 generation', timeoutMs)), timeoutMs);
  });

  const response = await Promise.race([genPromise, timeoutPromise]);
  clearTimeout(timeoutId2!); // M14: Clear timer after race resolves

  const parts = response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if ((part as any).inlineData) {
        return (part as any).inlineData.data;
      }
    }
  }

  // Extract why Gemini refused — finishReason, safety ratings, prompt feedback
  const reason = extractBlockReason(response, 'V2');
  throw new ImageBlockedError(reason);
}

// In-memory video job storage
// SEC-9: deviceId stored per job for ownership verification on poll
interface VideoJob {
  status: 'pending' | 'complete' | 'failed';
  deviceId: string;
  videoUrl?: string;
  videoS3Key?: string;
  error?: string;
  createdAt: number;
}

const videoJobs = new Map<string, VideoJob>();

// SEC-11: Bound videoJobs — TTL 30min for completed/failed, 15min max for pending
const VIDEO_JOB_TTL_MS = 30 * 60 * 1000;
const MAX_VIDEO_JOBS = 200;
setInterval(() => {
  const now = Date.now();
  for (const [key, job] of videoJobs) {
    if (now - job.createdAt > VIDEO_JOB_TTL_MS) videoJobs.delete(key);
  }
}, 5 * 60 * 1000);

export function getVideoJob(jobId: string): VideoJob | undefined {
  return videoJobs.get(jobId);
}

export async function startVideoGeneration(
  jobId: string,
  imageBase64: string,
  _label: string,
  onComplete: (videoBuffer: Buffer) => Promise<{ s3Key: string; cdnUrl: string }>,
  tag: string = '',
  deviceId: string = ''
): Promise<void> {
  // SEC-11/M12: Evict oldest non-pending job if at capacity
  if (videoJobs.size >= MAX_VIDEO_JOBS) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, job] of videoJobs) {
      if (job.status !== 'pending' && job.createdAt < oldestTime) {
        oldestTime = job.createdAt; oldestKey = key;
      }
    }
    // If all are pending, evict the oldest pending as last resort
    if (!oldestKey) {
      for (const [key, job] of videoJobs) {
        if (job.createdAt < oldestTime) { oldestTime = job.createdAt; oldestKey = key; }
      }
    }
    if (oldestKey) videoJobs.delete(oldestKey);
  }
  videoJobs.set(jobId, { status: 'pending', deviceId, createdAt: Date.now() });

  try {
    console.log(`${tag} Video → job=${jobId} submitting to Gemini`);
    let operation = await withGeminiLimit(() => (ai.models as any).generateVideos({
      model: MODELS.VIDEO_GEN,
      prompt: `This is a fashion try-on image of a person wearing an outfit they chose in a virtual fitting room. The person uploaded their own photo and consented to this generation. Animate this person doing a slow confident turn — first looking at the camera, then turning to show the side profile, then the back, and coming back to face the camera. Subtle natural movements only — a slight head tilt, a hand adjusting the clothing, shifting weight between feet. The clothing moves naturally with the body — fabric swaying, catching light as they turn. Keep it intimate and real, like a mirror check or someone filming themselves for Instagram. Same lighting as the input image. Smooth cinematic camera, shallow depth of field, shot on 85mm. The person's face, skin tone, hair, and body must look IDENTICAL to the input image throughout the entire video — no morphing, no identity drift.`,
      image: {
        imageBytes: imageBase64,
        mimeType: 'image/png',
      },
      config: {
        aspectRatio: '9:16',
        durationSeconds: 8,
        personGeneration: 'ALLOW_ADULT',
      },
    }));
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

    const existing = videoJobs.get(jobId);
    videoJobs.set(jobId, {
      status: 'complete',
      deviceId: existing?.deviceId || deviceId,
      createdAt: existing?.createdAt || Date.now(),
      videoUrl: cdnUrl,
      videoS3Key: s3Key,
    });
  } catch (err: any) {
    // M18: Strip API key from error messages before logging
    const safeMsg = (err.message || '').replace(config.geminiApiKey, '[REDACTED]');
    console.error(`${tag} Video → job=${jobId} FAILED: ${safeMsg}`);
    const existing = videoJobs.get(jobId);
    videoJobs.set(jobId, {
      status: 'failed',
      deviceId: existing?.deviceId || deviceId,
      createdAt: existing?.createdAt || Date.now(),
      error: 'Video generation failed', // M13: Sanitized — raw error logged above
    });
  }
}
