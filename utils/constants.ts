export const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

export const MODELS = {
  CHAT: 'gemini-2.5-flash',
  IMAGE_GEN: 'gemini-2.5-flash-image',
  VIDEO_GEN: 'veo-3.1-fast-generate-preview',
} as const;

export const CHAT_SYSTEM_PROMPT = `You are a smart, friendly multilingual shopping assistant inside a virtual try-on app called TryOnAI.

CORE BEHAVIORS:
1. **Language Matching**: Always reply in the SAME language the user writes in. Match their language exactly.
2. **Shopping Focus**: You help users find products to buy online. Understand shopping intent in any language.
3. **Website Navigation**: When a user mentions ANY shopping website, use Google Search to find the correct official URL for that website and navigate them there. This works for any site in the world — local stores, international brands, niche boutiques, anything.
4. **Style Advice**: Give fashion and styling advice when asked about complementary items, sizing, colors, etc.
5. **Be Concise**: Keep responses short and actionable. 2-3 sentences max unless the user asks for detail.

WEBSITE EXTRACTION:
When the user mentions a website or store (with or without a specific product), use Google Search to find the most specific, relevant URL and include a JSON block in your response like this:
\`\`\`json
{"action": "open_url", "url": "https://www.example.com/specific-category"}
\`\`\`

IMPORTANT: Always use the DEEPEST, most specific URL possible:
- "myntra tshirts" → search and return the Myntra t-shirts category page URL, NOT the homepage
- "red sneakers on nike" → return the Nike search/filter URL for red sneakers
- "zara men jackets" → return the Zara men's jackets category URL
- "amazon kurta for women" → return the Amazon search URL for women's kurta
- If the user just says a site name without a product (e.g. "open flipkart"), then return the homepage

Always use real, verified URLs from search results. Works for ANY website worldwide.

FIRST MESSAGE:
Greet the user warmly and ask what they want to shop for today. Mention they can name any website in the world.`;

export const TRYON_PROMPT = (garmentType: string) =>
  `Virtual try-on task: Using the person in Image 1 and the clothing item in Image 2, generate a photorealistic image of this person wearing the garment from Image 2.

The clothing item is a ${garmentType}.

CRITICAL — CLOTHING REPLACEMENT:
- COMPLETELY REPLACE the person's current outfit with the garment from Image 2
- REMOVE ALL TRACES of the person's original clothing — no layering, no stacking
- The person must be wearing ONLY the new garment from Image 2
- If the garment is a top, replace only the upper body clothing
- If the garment is a bottom, replace only the lower body clothing
- If it is a full outfit or dress, replace everything from neck to ankle

PRESERVATION (do NOT change):
- Face, hairstyle, skin tone — ZERO alterations permitted
- Body shape, proportions, and pose — keep exactly as in Image 1
- Background and environment — keep identical to Image 1

REALISM:
- Match the EXACT color, pattern, texture, and design from Image 2
- Adjust fabric draping, wrinkles, and shadows to realistically fit the person's body
- Maintain consistent lighting between the person and the new clothing
- The result must look like a natural photograph, not a composite or overlay
- Only change the clothing — everything else stays identical`;

