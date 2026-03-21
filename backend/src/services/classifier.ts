import { GoogleGenAI } from '@google/genai';
import { config } from '../config';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Product Classification & Category-Specific Prompts
// Classifies product images and returns tailored try-on prompts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Product Categories ──────────────────────────────────────────────

export const PRODUCT_CATEGORIES = [
  'FOOTWEAR',
  'TOP',
  'BOTTOM',
  'FULL_OUTFIT',
  'RING',
  'BRACELET',
  'EARRING',
  'NECKLACE',
  'SUNGLASSES',
  'BAG',
  'BELT',
  'DUPATTA',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

function isValidCategory(value: string): value is ProductCategory {
  return PRODUCT_CATEGORIES.includes(value as ProductCategory);
}

// ── Gemini Client (reuse multi-key round-robin from gemini.ts pattern) ──

const aiClients = config.geminiApiKeys.map(key => new GoogleGenAI({ apiKey: key }));
let _nextKeyIndex = 0;

function getAI(): GoogleGenAI {
  if (aiClients.length === 0) throw new Error('No Gemini API keys configured');
  const client = aiClients[_nextKeyIndex % aiClients.length];
  _nextKeyIndex++;
  return client;
}

// Detect MIME type from base64 magic bytes (same logic as gemini.ts)
function detectMimeType(base64: string): string {
  const buf = Buffer.from(base64.slice(0, 16), 'base64');
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  return 'image/jpeg';
}

// ── Selfie Description ──────────────────────────────────────────────

/**
 * Describe a selfie in one line using Gemini Flash.
 * Returns something like: "The user is a young woman with long black hair standing in a garden wearing a red lehenga"
 */
export async function describeSelfie(selfieBase64: string): Promise<string> {
  try {
    const client = getAI();
    const mime = detectMimeType(selfieBase64);

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mime, data: selfieBase64 } },
            { text: 'Describe this person in exactly one short sentence starting with "The user is". Include their gender, approximate age, visible features (hair, glasses, facial hair etc), what they are wearing, and where they are (background). Keep it under 30 words. Example: "The user is a young woman with long black hair standing in a garden wearing a blue lehenga"' },
          ],
        },
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 500,
      },
    });

    const desc = response.text || '';
    console.log(`[Classifier] Selfie description: ${desc}`);
    return desc || 'The user is the person in the first image';
  } catch (err: any) {
    console.error(`[Classifier] Selfie description failed: ${err.message}`);
    return 'The user is the person in the first image';
  }
}

// ── Classification ──────────────────────────────────────────────────

const CLASSIFICATION_MODEL = 'gemini-2.5-flash';

const CLASSIFICATION_PROMPT = `You are a product classifier for a fashion virtual try-on system. Look at this product image and classify it into EXACTLY ONE of these categories. Reply with ONLY the category name — no explanation, no punctuation, no extra words.

Categories:
FOOTWEAR — shoes, sneakers, heels, sandals, boots, juttis, kolhapuris, mojaris, chappals, wedges, loafers, floaters
TOP — t-shirt, shirt, blouse, short kurti (above knee), crop top, tank top, jacket, blazer, hoodie, sweater, cardigan, vest, polo, tunic (above knee)
BOTTOM — pants, jeans, trousers, shorts, skirt, palazzos, salwar, dhoti pants, leggings, churidar, culottes, joggers, cargo pants
FULL_OUTFIT — dress, gown, saree, lehenga, anarkali, long kurta (below knee), kurta set, jumpsuit, romper, co-ord set, sherwani, suit (full), kaftan, maxi dress, abaya, salwar kameez set
RING — finger ring, engagement ring, cocktail ring, statement ring, band
BRACELET — bracelet, bangle, kada, watch, wristband, charm bracelet, cuff, bangles set
EARRING — earring, jhumka, studs, hoops, danglers, chandbali, ear cuff, drops
NECKLACE — necklace, mangalsutra, choker, pendant, chain, haar, rani haar, mala, locket
SUNGLASSES — sunglasses, eyeglasses, spectacles, aviators, wayfarers
BAG — handbag, purse, tote, clutch, sling bag, backpack, crossbody, potli, wallet
BELT — belt, waist belt, kamarband
DUPATTA — dupatta, stole, shawl, chunni, scarf, muffler, wrap, pashmina

KEY RULES:
- If it is a kurta/kurti that goes BELOW the knee, classify as FULL_OUTFIT
- If it is a kurta/kurti that is ABOVE the knee (short kurti), classify as TOP
- A saree is ALWAYS FULL_OUTFIT
- A lehenga is ALWAYS FULL_OUTFIT (even if only the skirt is shown — it implies a full outfit)
- A blouse alone (without saree) is TOP
- If you see a full set (top + bottom together), classify as FULL_OUTFIT
- If unsure between two categories, pick the one that requires showing MORE of the body in the try-on

Reply with ONLY the EXACT category name from the list above (e.g. FULL_OUTFIT not FULL, FOOTWEAR not FOOT). One word or phrase, nothing else.`;

/**
 * Classify a product image into one of the defined product categories.
 * Uses Gemini 2.5 Flash text model with temperature 0 for deterministic output.
 * Falls back to FULL_OUTFIT on any error (safest default — shows the most body).
 */
export async function classifyProduct(productBase64: string): Promise<ProductCategory> {
  try {
    const client = getAI();
    const mime = detectMimeType(productBase64);

    const response = await client.models.generateContent({
      model: CLASSIFICATION_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: CLASSIFICATION_PROMPT },
            { inlineData: { mimeType: mime, data: productBase64 } },
          ],
        },
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 20,
      },
    });

    const raw = (response.text || '').trim().toUpperCase().replace(/[^A-Z_]/g, '');
    if (isValidCategory(raw)) {
      console.log(`[Classifier] Classified product as: ${raw}`);
      return raw;
    }

    // Try to fuzzy-match if model returned something close
    // Check both directions: raw contains category OR category contains raw
    const match = PRODUCT_CATEGORIES.find(cat => raw.includes(cat) || cat.includes(raw));
    if (match) {
      console.log(`[Classifier] Fuzzy-matched product as: ${match} (raw: ${raw})`);
      return match;
    }

    console.warn(`[Classifier] Unrecognized category "${raw}", falling back to FULL_OUTFIT`);
    return 'FULL_OUTFIT';
  } catch (err: any) {
    console.error(`[Classifier] Classification failed: ${err.message}, falling back to FULL_OUTFIT`);
    return 'FULL_OUTFIT';
  }
}

// ── In-Memory LRU Cache ─────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_ENTRIES = 5000;

interface CacheEntry {
  category: ProductCategory;
  createdAt: number;
}

// Map preserves insertion order — we use this for LRU eviction
const classificationCache = new Map<string, CacheEntry>();

/**
 * Get a cached classification for a product image URL.
 * Returns undefined if not cached or expired.
 */
export function getCachedClassification(productImageUrl: string): ProductCategory | undefined {
  const entry = classificationCache.get(productImageUrl);
  if (!entry) return undefined;

  // Check TTL
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    classificationCache.delete(productImageUrl);
    return undefined;
  }

  // Move to end for LRU (delete + re-set puts it at the end of Map iteration order)
  classificationCache.delete(productImageUrl);
  classificationCache.set(productImageUrl, entry);

  return entry.category;
}

/**
 * Cache a classification result for a product image URL.
 * Evicts the least-recently-used entry if at capacity.
 */
export function cacheClassification(productImageUrl: string, category: ProductCategory): void {
  // If already exists, delete first so re-insertion moves it to end (most recent)
  if (classificationCache.has(productImageUrl)) {
    classificationCache.delete(productImageUrl);
  }

  // Evict LRU entries if at capacity
  while (classificationCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = classificationCache.keys().next().value;
    if (oldestKey !== undefined) {
      classificationCache.delete(oldestKey);
    } else {
      break;
    }
  }

  classificationCache.set(productImageUrl, {
    category,
    createdAt: Date.now(),
  });
}

// Periodic cleanup of expired entries (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of classificationCache) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      classificationCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ── Category-Specific Try-On Prompts ────────────────────────────────

const CATEGORY_PROMPTS: Record<ProductCategory, string> = {

  FOOTWEAR: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the footwear from the PRODUCT PHOTO.

FRAMING: Full body shot, head to toe. Camera positioned at knee-to-waist height to give the footwear visual prominence. The person's feet and the footwear must occupy the bottom 20-25% of the frame. One foot slightly forward, turned 30 degrees outward to show the shoe's profile, silhouette, and side detailing. The other foot planted naturally.

FACE: The person's face MUST be clearly visible at the top of the frame — smaller due to full-body framing, but sharp, in focus, and recognizable. Front-facing or slight 3/4 angle. Never crop the head, never turn them away.

IDENTITY PRESERVATION: The person's face, facial structure, skin tone, hair, body shape, height, and weight must be IDENTICAL to the CUSTOMER PHOTO. Do not alter, slim, beautify, or morph any feature. Skin must have natural texture — not airbrushed.

PRODUCT ACCURACY: Reproduce the EXACT footwear from the PRODUCT PHOTO — correct color, material, texture, sole thickness, strap placement, buckle/lace details, heel height, toe shape. Whether it is sneakers, heels, juttis, kolhapuris, mojaris, sandals, boots, or chappals — every design element must match precisely. The footwear must fit naturally on the person's feet with correct proportions.

OUTFIT COHERENCE: Keep the person's existing outfit ONLY if it works with the new footwear. If it clashes, replace with a simple complementary outfit — clean jeans and a plain tee for casual footwear, tailored trousers and a blouse for formal heels, a kurta with churidar for ethnic juttis/kolhapuris. The footwear is the hero — the outfit should not compete.

REALISM: Natural shadows beneath the shoes on the ground surface. Correct lighting on shoe material — leather sheen, suede matte, fabric texture, metallic embellishments catching light. The footwear must look worn on actual feet, not pasted. Ground plane perspective must be consistent.

DO NOT: Change the shoe color, swap the material, alter the sole design, add or remove laces/straps/buckles, change the brand logo, modify the heel height, or generate a different shoe model. Do not change the person's face, body shape, or skin tone.`,

  TOP: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the top/upper garment from the PRODUCT PHOTO.

FRAMING: Mid-thigh to head crop. The person fills 85% of the frame vertically. Body angled 15-25 degrees from camera for a natural, flattering pose. The full garment must be visible from shoulder seam to hem — collar, neckline, sleeves, cuffs, buttons, prints, and hemline all clearly shown. Do not crop any part of the garment.

FACE: Face must be clearly visible in the upper portion of the frame. Front-facing or natural 3/4 angle. Sharp, in focus, well-lit. Never obscured by hair, collar, or shadows.

IDENTITY PRESERVATION: Face, facial structure, bone geometry, skin tone, skin texture (including pores, marks, blemishes), hair, body shape, shoulder width, bust, arms, and proportions must be IDENTICAL to the CUSTOMER PHOTO. Do not smooth, slim, reshape, or beautify anything. The person does not change — the garment adapts to their body.

PRODUCT ACCURACY: Reproduce the EXACT garment from the PRODUCT PHOTO — correct color, fabric texture, pattern (stripes, checks, florals, prints), weave, collar style, sleeve length, button count, embroidery, embellishments, and fit (loose, fitted, oversized). Whether it is a t-shirt, shirt, blouse, short kurti, crop top, jacket, blazer, hoodie, or sweater — match every design detail. Fabric drapes realistically on the person's specific body shape — wrinkles where fabric bunches, smooth where it stretches.

OUTFIT COHERENCE: Replace ONLY the upper body clothing. Keep existing bottoms if they work with the new top. If they clash, swap for complementary bottoms — blue jeans for casual tops, tailored trousers for blazers, palazzos or a skirt for a dressy blouse. Existing accessories and jewelry can stay if they complement the look.

REALISM: Fabric must react to the body — natural draping at the bust, creasing at the elbows if sleeves are bent, gentle pull across the shoulders if fitted. Lighting on the fabric must match the scene. Shadows under the collar and at sleeve openings. No floating fabric, no unnatural stiffness.

DO NOT: Change the fabric pattern, swap colors, alter the print, modify the neckline/collar style, add or remove sleeves, change button count or placement, alter the fit (fitted vs loose), or generate a different garment. Do not change the person's face, body shape, or skin tone.`,

  BOTTOM: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the bottom garment from the PRODUCT PHOTO.

FRAMING: Full body, head to toe. The person fills 85-90% of the vertical frame. Body angled 20-30 degrees. One leg straight, the other slightly forward to show the garment's drape and silhouette. The entire bottom garment must be visible — waistband to hem, including how it falls around the ankles/shoes.

FACE: Face clearly visible at the top of the frame. Front-facing or slight 3/4 angle. Sharp, recognizable, well-lit. The face is smaller in a full-body shot but must remain the identity anchor.

IDENTITY PRESERVATION: Face, skin tone, body shape, hip width, waist, thigh proportions, leg length — everything IDENTICAL to the CUSTOMER PHOTO. Do not slim the legs, narrow the hips, or change body proportions. Natural skin texture, not airbrushed.

PRODUCT ACCURACY: Reproduce the EXACT bottom from the PRODUCT PHOTO — correct color, fabric, pattern, fit (slim, straight, wide-leg, flared), rise (high, mid, low), length, pocket placement, stitching details, embroidery, and hardware (buttons, zippers). Whether it is jeans, trousers, palazzos, salwar, dhoti pants, a skirt, shorts, leggings, churidar, or culottes — every detail must match. The garment must drape naturally on the person's specific body — fabric tension at the thighs if fitted, flowing movement if wide-leg.

OUTFIT COHERENCE: Replace ONLY the lower body clothing. Keep the existing top if it works with the new bottom. If it clashes, replace with a simple complementary top — plain tee for casual bottoms, a tucked blouse for formal trousers, a short kurti for ethnic palazzos or salwar. The bottom garment is the hero.

REALISM: Natural creasing at knees and hips. Fabric falls correctly with gravity — heavier fabrics hang straight, lighter fabrics may flutter slightly. Correct shadows between the legs and on the ground. Waistband sits naturally at the person's actual waist/hip level.

DO NOT: Change the fabric, alter the color/wash, modify the fit (slim vs wide), change the rise, add or remove pockets/stitching, alter the length, or generate different bottoms. Do not change the person's face, body shape, hip width, or skin tone.`,

  FULL_OUTFIT: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the complete outfit from the PRODUCT PHOTO.

FRAMING: Full body, head to toe. The person fills 85-90% of the vertical frame. Body at 20-30 degrees from camera. For sarees: pallu draped over the left shoulder with front pleats visible at the feet, one hand may hold the pallu. For lehengas: the full skirt flare visible with the dupatta if included. For anarkalis/gowns: the full length and flare visible. For kurta sets: both the kurta and bottom visible entirely. One foot slightly forward for a natural stance.

FACE: Face MUST be clearly visible at the top of the frame. Front-facing or natural 3/4 angle. Well-lit, sharp, recognizable. Never obscured by dupatta, pallu, veil, or hair.

IDENTITY PRESERVATION: The person's face, skin tone, body proportions, height, weight, build — everything IDENTICAL to the CUSTOMER PHOTO. The outfit adapts to their body, not the reverse. Do not make them look like the model in the PRODUCT PHOTO. Natural skin with visible texture.

PRODUCT ACCURACY: Reproduce the EXACT outfit from the PRODUCT PHOTO — correct fabric, color, pattern, embroidery, border work, sequin placement, mirror work, zari, print, draping style, sleeve design, neckline, and fit. Whether it is a saree, lehenga, anarkali, long kurta, jumpsuit, gown, sherwani, co-ord set, kaftan, or salwar kameez — every design element must match precisely. If the outfit has multiple pieces (e.g., lehenga choli + dupatta, kurta + salwar + dupatta), ALL pieces must be shown correctly.

OUTFIT COHERENCE: This IS the complete outfit — replace everything the person is wearing from neck to toe. If the outfit includes specific accessories (like a matching dupatta or belt), include them. Keep existing jewelry only if it complements the outfit. Add simple complementary footwear if feet are visible — ethnic juttis/heels for traditional wear, heels/sneakers for western.

REALISM: Fabric drapes according to its weight and texture — silk has sheen and flow, cotton is crisp, chiffon is sheer and light, velvet is heavy and rich. Embroidery and embellishments catch light naturally. Pleats, gathers, and folds match how the actual fabric would behave on this person's body. Natural shadows in fabric folds.

DO NOT: Change the outfit color, fabric, embroidery, border work, draping style, or any design element. Do not simplify the pattern, remove embellishments, or generate a different outfit. Do not change the person's face, body shape, weight, or skin tone.`,

  RING: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the ring from the PRODUCT PHOTO.

FRAMING: Waist-up crop. Face clearly visible in upper 30% of frame. Ring hand lightly touching jawline or chin, fingers relaxed and gently curved (not spread or stiff), ring finger naturally separated from adjacent fingers. Ring is the focal point — sharp, detailed, and prominent. The hand-on-chin pose looks natural and stylish, bringing the ring into frame near the face.

FACE: Face is the identity anchor — clearly visible in the upper portion, front-facing or slight 3/4 angle. Sharp, well-lit, natural expression. The face and the ring hand are both in focus.

IDENTITY PRESERVATION: Face, skin tone, hand size, finger proportions, nail shape — all IDENTICAL to the CUSTOMER PHOTO. The ring must look naturally worn on their actual hand, not pasted. Skin texture on the hands must be realistic.

PRODUCT ACCURACY: Reproduce the EXACT ring from the PRODUCT PHOTO — correct metal color (gold, silver, rose gold, platinum), stone type and color (diamond, ruby, emerald, pearl, kundan), stone cut, setting style (prong, bezel, cluster), band width, design details (filigree, engraving, pave), and overall profile. The ring must be sized proportionally to the person's finger.

OUTFIT COHERENCE: Keep the person's existing outfit if it complements the ring. If the current outfit distracts or clashes, replace with something simple and elegant — a solid-color top with a complementary neckline that does not compete with the ring. For traditional rings, a subtle ethnic outfit works. Nails should be clean and presentable.

REALISM: Metal must have correct reflections and shine — gold is warm, silver is cool, platinum has a subtle gray sheen. Gemstones must refract and reflect light naturally. The ring casts a tiny shadow on the finger. Correct scale — the ring fits the person's actual finger width.

DO NOT: Change the metal color, swap stones, alter the band design, modify engravings, or generate a different ring. Do not change the person's face, hand shape, or skin tone.`,

  BRACELET: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the bracelet/bangle/watch from the PRODUCT PHOTO.

FRAMING: Waist-up crop. Face clearly visible in the upper portion of the frame. One hand lightly adjusting opposite sleeve cuff or gently resting on the other forearm, wrist turned slightly toward camera to showcase the bracelet/watch face. Relaxed, candid body language — not stiff or posed. For bangles, they are clustered naturally at the narrower part of the forearm. The wrist accessory is the focal point while the face remains clearly identifiable.

FACE: Clearly visible, front-facing or 3/4 angle. Well-lit and sharp. The person's identity must be unmistakable.

IDENTITY PRESERVATION: Face, skin tone, arm shape, wrist circumference, hand proportions — all IDENTICAL to the CUSTOMER PHOTO. The accessory must look naturally worn on their actual wrist, not floating or pasted.

PRODUCT ACCURACY: Reproduce the EXACT accessory from the PRODUCT PHOTO — correct material (gold, silver, thread, leather, beads, kundan, lac), width, design details (engravings, stones, charms, meenakari work, dial markings for watches), clasp type, and color. Whether it is a delicate chain bracelet, chunky kada, a set of glass bangles, a leather-strap watch, or a charm bracelet — every detail must match. For bangle sets, show the correct number and arrangement.

OUTFIT COHERENCE: Keep the person's existing outfit if it complements the accessory. If it clashes, swap for something that lets the wrist piece shine — rolled-up sleeves for watches, a sleeveless or short-sleeve top for bangles. For ethnic bangles/kada, a simple kurta or saree blouse works. The wrist accessory is the hero.

REALISM: Metal bangles and watches catch and reflect light with correct specularity. Glass bangles have translucency. Leather straps show grain. The accessory sits at the correct position on the wrist — watches on top, bangles slide slightly with gravity. Natural shadows where the accessory meets the skin.

DO NOT: Change the metal type, alter engravings/meenakari, swap strap material, modify the watch dial, change bangle count, or generate a different accessory. Do not change the person's face, wrist size, or skin tone.`,

  EARRING: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the earring from the PRODUCT PHOTO.

FRAMING: Chest-up crop with the face as the primary anchor. Head turned 20-30 degrees showing three-quarter face view, slight chin lift to elongate neck. Hero earring fully visible on the camera-facing ear, hair tucked or swept behind that ear. Full drop visible from hook to lowest element. Opposite ear may be partially hidden — favor the hero earring side.

FACE: The face is the dominant element in this frame. Clearly visible, well-lit, natural expression. Both eyes visible (the head is turned slightly, not in full profile). The earring complements the face — they are shown together as a styled look.

IDENTITY PRESERVATION: Face, facial structure, skin tone, ear shape, earlobe — all IDENTICAL to the CUSTOMER PHOTO. Hair texture and color preserved exactly. Do not alter the face shape, jawline, or neck to flatter the earring.

PRODUCT ACCURACY: Reproduce the EXACT earring from the PRODUCT PHOTO — correct metal, stones, design, length, weight impression, movement (danglers should hang naturally). Whether it is jhumkas, chandbalis, studs, hoops, drops, ear cuffs, or statement pieces — match every element including filigree, kundan work, pearl drops, chain links, and color gradients. Both earrings should be visible if possible — the hero earring in full detail, the other partially visible on the far side.

OUTFIT COHERENCE: Keep the person's existing outfit if it flatters the earrings. Neckline matters — a V-neck or open neckline for statement earrings, a collared shirt for studs. If the current top competes with the earrings, replace with a simple solid-color top with an appropriate neckline. Remove competing necklaces if they clash with statement earrings.

REALISM: Earrings hang with correct weight — heavy jhumkas pull slightly on the earlobe, light studs sit flush. Metal and stones catch light naturally. Earrings sway slightly if danglers (implied by the angle). Correct shadow cast on the neck by larger earrings.

DO NOT: Change the earring design, swap metal color, alter stone arrangement, modify the drop length, or generate different earrings. Do not change the person's face, ear shape, or skin tone.`,

  NECKLACE: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the necklace from the PRODUCT PHOTO.

FRAMING: Bust-up crop. Face clearly visible in the upper half of the frame. Shoulders relaxed and slightly angled (not squared to camera), chin lifted subtly to elongate the neckline. Pendant centered on chest, chain draped naturally and visible on both sides of neck. Collarbone area exposed to frame the necklace. The full necklace must be in frame — from clasp line at the back of the neck to the lowest pendant point.

FACE: Clearly visible, front-facing or slight angle, well-lit. The face and the necklace are both stars of this frame — the necklace frames the face, the face gives context to the necklace.

IDENTITY PRESERVATION: Face, skin tone, neck length, shoulder width, collarbone definition, chest proportions — all IDENTICAL to the CUSTOMER PHOTO. Do not alter the neck to make it longer or slimmer for the necklace.

PRODUCT ACCURACY: Reproduce the EXACT necklace from the PRODUCT PHOTO — correct chain type (box chain, rope, snake, figaro, kundan, temple), pendant design, stone settings, metal color, length (choker sits at the throat, princess at the collarbone, matinee at the chest, opera below), and all embellishments. Whether it is a mangalsutra, choker, rani haar, pendant chain, layered necklace, or mala — every bead, stone, and link must match. For layered necklaces, each strand at its correct length.

OUTFIT COHERENCE: The neckline of the outfit is critical. If the current top has a neckline that hides the necklace, replace it with an appropriate one — V-neck, round neck, or off-shoulder depending on the necklace length. Chokers need an open neckline. Long necklaces work with most necklines. Remove competing earrings only if they clash with a statement necklace. The necklace is the hero.

REALISM: Chain links or beads drape with gravity, following the contour of the neck and chest. Metal has correct reflections — gold is warm, silver is cool. Pendants hang at the correct angle based on gravity and chain stiffness. The necklace rests on the actual skin of the person, with tiny shadows where it touches the body. Stones and gems refract light naturally.

DO NOT: Change the chain type, alter pendant design, swap metal color, modify stone settings, change the necklace length, or generate a different necklace. Do not change the person's face, neck length, or skin tone.`,

  SUNGLASSES: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the sunglasses from the PRODUCT PHOTO.

FRAMING: Head-and-shoulders crop. The face is the centerpiece — large and prominent in the frame. Face directly facing the camera. The sunglasses are centered on the nose bridge with both lenses fully visible. The temples (arms) of the sunglasses extend past the ears naturally. Enough of the shoulders visible to give the image a styled look, not just a floating head.

FACE: The face IS the frame for the sunglasses. It must be clearly recognizable despite the eyes being covered — jawline, chin, nose, mouth, forehead, and cheekbones all clearly visible and matching the CUSTOMER PHOTO exactly. The sunglasses should look like a natural addition, not a mask.

IDENTITY PRESERVATION: Facial structure, bone geometry, jawline, chin, nose bridge width, lip shape, skin tone, skin texture, forehead proportions, hair — all IDENTICAL to the CUSTOMER PHOTO. The sunglasses sit on the person's actual nose bridge and ears. Do not reshape the face to fit the sunglasses.

PRODUCT ACCURACY: Reproduce the EXACT sunglasses from the PRODUCT PHOTO — correct frame shape (aviator, wayfarer, round, cat-eye, square, oversized, rectangular), frame color, frame material (metal, acetate, plastic), lens color and opacity (gradient, mirrored, polarized tint), temple design, nose pad style, and any branding or logo placement. The sunglasses must be proportionally correct for the person's face width.

OUTFIT COHERENCE: Keep the person's existing outfit if it creates a cohesive look with the sunglasses. Sporty sunglasses pair with casual wear, elegant frames with polished outfits. If the outfit clashes, swap for something complementary — a clean tee and jacket for aviators, a dressy top for cat-eye frames. Hair should be styled to not obscure the sunglasses temples.

REALISM: Lenses have correct reflections based on their type — mirror lenses reflect the environment, gradient lenses are darker at top, polarized lenses have a subtle color cast. The frame casts a small shadow on the cheeks. The sunglasses sit naturally on the nose bridge — not floating above or sinking into the face. Temples press gently against the sides of the head. Eyes may be faintly visible through lighter lenses.

DO NOT: Change the frame shape, swap lens color, alter frame material/color, modify the temple design, or generate different sunglasses. Do not change the person's face shape, nose bridge, or skin tone.`,

  BAG: `Virtual try-on: Make the person in the CUSTOMER PHOTO carry/wear the bag from the PRODUCT PHOTO.

FRAMING: Mid-thigh to head crop. Face clearly visible in the upper portion. The bag is on the camera-facing side of the body with a CLEAR gap between the bag and the body so the bag's full front face is visible. The bag front is angled squarely toward the camera to show the design, hardware, and any branding. The person's hand holds the strap or handle naturally. For crossbody bags, the strap is visible across the torso.

FACE: Clearly visible, front-facing or 3/4 angle. Well-lit and sharp. The person and the bag together tell a style story.

IDENTITY PRESERVATION: Face, body shape, arm length, hand proportions, skin tone — all IDENTICAL to the CUSTOMER PHOTO. The bag must look like the person is naturally holding/wearing it, not photoshopped on.

PRODUCT ACCURACY: Reproduce the EXACT bag from the PRODUCT PHOTO — correct material (leather, canvas, fabric, jute, velvet), color, hardware color (gold, silver, gunmetal), closure type (zip, flap, drawstring, clasp), handle/strap style (top handle, shoulder strap, chain, crossbody), pocket placement, logo/branding, stitching, pattern (quilted, textured, printed), and proportions. Whether it is a tote, clutch, sling bag, backpack, crossbody, potli, or wallet — every design element must match. The bag must be correctly scaled relative to the person's body.

OUTFIT COHERENCE: Keep the person's existing outfit if it complements the bag. If it clashes, replace with a styled but simple outfit that lets the bag stand out — jeans and a top for casual bags, a dress or tailored outfit for formal/evening bags, ethnic wear for potli bags. The bag is the hero accessory.

REALISM: Leather has correct grain and sheen, canvas is matte, metallics reflect light. Hardware (buckles, chains, clasps) catches light with correct specularity. The strap/handle deforms slightly under gravity where it bends. The bag has volume and structure — not flat or deflated. Natural shadow where the bag is close to the body.

DO NOT: Change the bag material, swap colors, alter hardware, modify the strap/handle style, change the closure type, or generate a different bag. Do not change the person's face, body shape, or skin tone.`,

  BELT: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the belt from the PRODUCT PHOTO.

FRAMING: Waist-up or mid-thigh to head crop — the face MUST be included and clearly visible. The belt is at the natural waist/hip level, clearly visible and not obscured by hands, arms, or the top's hem. The buckle faces the camera squarely. Enough torso visible above and below the belt to show how it cinches or sits on the outfit.

FACE: Clearly visible in the upper portion of the frame. Front-facing or 3/4 angle, well-lit. The person is identifiable — the belt is an accessory to their look, not a standalone item.

IDENTITY PRESERVATION: Face, body shape, waist circumference, hip width, torso proportions — all IDENTICAL to the CUSTOMER PHOTO. The belt sits on the person's actual waist/hip, not a reshaped body. Do not slim the waist or alter proportions.

PRODUCT ACCURACY: Reproduce the EXACT belt from the PRODUCT PHOTO — correct material (leather, fabric, chain, elastic, woven), width, color, buckle design (prong, plate, D-ring, hook, ornamental), hardware color, stitching, pattern (plain, braided, studded, embossed), and any embellishments. Whether it is a classic leather belt, a fabric kamarband, a chain belt, or a statement waist belt — every detail must match. The belt must be correctly proportioned for the person's waist.

OUTFIT COHERENCE: The belt needs an outfit that shows it off. If the current outfit hides the belt (e.g., an untucked oversized top), adjust — tuck the top in, or replace with a fitted top and pants/skirt that lets the belt be visible. For kamarbands, pair with ethnic wear — a saree or lehenga. The belt is the hero — the outfit should frame it.

REALISM: Leather belts show natural bending around the body's curves. The buckle has correct weight and metallic reflections. Belt loops (if on pants) hold the belt correctly. The belt creates a natural cinch or sits relaxed depending on fit. Slight shadow beneath the belt where it lifts off the fabric.

DO NOT: Change the belt material, swap buckle design, alter the width, modify the color/pattern, or generate a different belt. Do not change the person's face, waist size, or skin tone.`,

  DUPATTA: `Virtual try-on: Make the person in the CUSTOMER PHOTO wear the dupatta/stole/shawl from the PRODUCT PHOTO.

FRAMING: Waist-up crop minimum (can go to mid-thigh if needed to show full drape length). Face clearly visible in the upper portion. The dupatta is draped over both shoulders or in the traditional style — one end over the left shoulder, the other falling in front. One hand may hold the fabric edge to show the texture, pattern, and border work. The drape covers enough surface area to showcase the fabric's beauty.

FACE: Clearly visible, front-facing or 3/4 angle. Well-lit and sharp. The dupatta frames the face and shoulders — it should complement the face, not hide it. Never let the dupatta cover the face.

IDENTITY PRESERVATION: Face, skin tone, shoulder width, body proportions, hair — all IDENTICAL to the CUSTOMER PHOTO. The dupatta drapes on the person's actual shoulders and body shape.

PRODUCT ACCURACY: Reproduce the EXACT dupatta/stole/shawl from the PRODUCT PHOTO — correct fabric (chiffon, georgette, silk, cotton, net, pashmina, wool), color, pattern (printed, embroidered, bandhani, block print, digital print), border design (lace, gota, zari, tassels, pom-pom), texture (sheer, opaque, textured), and weight. Whether it is a light chiffon chunni, a heavy Pashmina shawl, a sequined party dupatta, or a cotton stole — the fabric behavior must match its weight and material. Show enough of the fabric that the pattern and border work are clearly visible.

OUTFIT COHERENCE: The dupatta needs an outfit that makes sense with it. If the current outfit works — keep it. If not, pair with complementary clothing — a simple kurta for an ethnic dupatta, a plain top for a printed stole, a dress or sweater for a pashmina shawl. The dupatta is the hero accessory. Remove competing scarves or neckpieces.

REALISM: Fabric drapes according to its weight — chiffon floats and has translucency at edges, silk flows with a liquid drape, pashmina has body and warmth, cotton hangs with crisp folds. Wind or movement may cause light fabrics to flutter subtly. The fabric interacts with the body — pressing slightly where it rests on shoulders, hanging freely where it falls. Border details and embellishments are crisp and visible.

DO NOT: Change the fabric type, swap colors, alter the border/print design, modify embellishments, or generate a different dupatta/stole. Do not change the person's face, body shape, or skin tone.`,

};

// ── Public API ───────────────────────────────────────────────────────

const IDENTITY_SUFFIX = `. Make them wear the product from the second image. Preserve their exact face, body, and proportions from their photo. Keep their pose and body angle where visible — if the photo only shows the upper body, naturally extend to a full body standing pose consistent with their visible posture. The product image is ONLY a product reference — if a model is wearing it, completely ignore that model's pose, stance, and body position. Extract only the product design from the product image, nothing else. Anatomically correct human body — exactly five fingers on each hand, natural finger curvature, two arms, two legs. Sharp photorealistic quality.

`;

/**
 * Get the category-specific try-on prompt for a given product category.
 * Prepends selfie description + identity preservation instruction to every prompt.
 * @param selfieDescription - one-line description of the user from Gemini Flash (e.g. "The user is a young man with glasses wearing a grey sweatshirt")
 */
export function getPromptForCategory(category: ProductCategory, selfieDescription?: string): string {
  const prompt = CATEGORY_PROMPTS[category];
  const desc = selfieDescription || 'The user is the person in the first image';
  const prefix = desc + IDENTITY_SUFFIX;
  if (!prompt) {
    console.warn(`[Classifier] No prompt found for category "${category}", using FULL_OUTFIT`);
    return prefix + CATEGORY_PROMPTS.FULL_OUTFIT;
  }
  return prefix + prompt;
}
