// PostHog analytics event names and helpers

export const ANALYTICS_EVENTS = {
  APP_OPENED: 'app_opened',
  SIGN_IN_STARTED: 'sign_in_started',
  SIGN_IN_COMPLETED: 'sign_in_completed',
  SIGN_IN_FAILED: 'sign_in_failed',
  SIGN_OUT: 'sign_out',
  ONBOARDING_SELFIE_CAPTURED: 'onboarding_selfie_captured',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  TRYON_STARTED: 'tryon_started',
  TRYON_COMPLETED: 'tryon_completed',
  TRYON_FAILED: 'tryon_failed',
  VIDEO_STARTED: 'video_started',
  VIDEO_COMPLETED: 'video_completed',
  VIDEO_FAILED: 'video_failed',
  STORE_BROWSED: 'store_browsed',
  PRODUCT_DETECTED: 'product_detected',
  TRYON_SAVED: 'tryon_saved',
  TRYON_DELETED: 'tryon_deleted',
  TRYON_SHARED: 'tryon_shared',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  CHAT_STORE_SUGGESTION_TAPPED: 'chat_store_suggestion_tapped',
  SELFIE_ADDED: 'selfie_added',
  SELFIE_UPLOAD_FAILED: 'selfie_upload_failed',
  MODEL_CHANGED: 'model_changed',
  SAVED_TAB_OPENED: 'saved_tab_opened',
  VISIT_STORE_TAPPED: 'visit_store_tapped',
  RETRY_AFTER_ERROR: 'retry_after_error',
} as const;

const STORE_NAME_MAP: Record<string, string> = {
  myntra: 'Myntra',
  zara: 'Zara',
  hm: 'H&M',
  nike: 'Nike',
  puma: 'Puma',
  ajio: 'AJIO',
  flipkart: 'Flipkart',
  amazon: 'Amazon',
  asos: 'ASOS',
  uniqlo: 'Uniqlo',
  mango: 'Mango',
  bewakoof: 'Bewakoof',
  nykaa: 'Nykaa',
  meesho: 'Meesho',
  tatacliq: 'Tata CLiQ',
  nordstrom: 'Nordstrom',
  gap: 'GAP',
  shein: 'SHEIN',
  urbanoutfitters: 'Urban Outfitters',
  forever21: 'Forever 21',
};

/**
 * Extracts a human-readable store name from a URL.
 * Falls back to the domain itself for unknown stores.
 */
export function getStoreName(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // Strip "www." and extract the main domain part (e.g., "myntra" from "www.myntra.com")
    const stripped = hostname.replace(/^www\./, '');
    const domainParts = stripped.split('.');
    // Use the second-level domain for matching (handles "m.myntra.com", "shop.nike.com", etc.)
    // For two-part domains like "myntra.com", domainParts[0] is the key.
    // For subdomains like "m.myntra.com", we check the part before the TLD.
    for (const part of domainParts) {
      const mapped = STORE_NAME_MAP[part];
      if (mapped) {
        return mapped;
      }
    }
    // Return the main domain without TLD as a fallback (e.g., "shopify" from "shopify.com")
    return domainParts.length >= 2
      ? domainParts[domainParts.length - 2]
      : stripped;
  } catch {
    return 'unknown';
  }
}
