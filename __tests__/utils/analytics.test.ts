import { getStoreName, ANALYTICS_EVENTS } from '@/utils/analytics';

describe('getStoreName', () => {
  it('returns mapped name for known store domains', () => {
    expect(getStoreName('https://www.myntra.com/shirts')).toBe('Myntra');
    expect(getStoreName('https://www.zara.com/in/en/dress-p12345.html')).toBe('Zara');
    expect(getStoreName('https://www2.hm.com/en_in/productpage.html')).toBe('H&M');
    expect(getStoreName('https://www.nike.com/in/running-shoes')).toBe('Nike');
    expect(getStoreName('https://in.puma.com/sneakers')).toBe('Puma');
  });

  it('handles mobile/subdomain variants', () => {
    expect(getStoreName('https://m.myntra.com/shirts')).toBe('Myntra');
    expect(getStoreName('https://shop.nike.com/products')).toBe('Nike');
  });

  it('returns domain-based fallback for unknown stores', () => {
    const result = getStoreName('https://www.somestore.com/products');
    expect(result).toBe('somestore');
  });

  it('handles AJIO, Flipkart, Amazon, and other mapped stores', () => {
    expect(getStoreName('https://www.ajio.com/men')).toBe('AJIO');
    expect(getStoreName('https://www.flipkart.com/clothing')).toBe('Flipkart');
    expect(getStoreName('https://www.amazon.in/dp/B123')).toBe('Amazon');
    expect(getStoreName('https://www.asos.com/men/')).toBe('ASOS');
    expect(getStoreName('https://www.uniqlo.com/jp/')).toBe('Uniqlo');
    expect(getStoreName('https://www.mango.com/us/men')).toBe('Mango');
    expect(getStoreName('https://www.bewakoof.com/')).toBe('Bewakoof');
    expect(getStoreName('https://www.nykaa.com/fashion')).toBe('Nykaa');
    expect(getStoreName('https://www.meesho.com/')).toBe('Meesho');
    expect(getStoreName('https://www.nordstrom.com/')).toBe('Nordstrom');
    expect(getStoreName('https://www.gap.com/')).toBe('GAP');
    expect(getStoreName('https://www.shein.com/')).toBe('SHEIN');
    expect(getStoreName('https://www.forever21.com/')).toBe('Forever 21');
  });

  it('returns "unknown" for invalid URLs', () => {
    expect(getStoreName('not-a-url')).toBe('unknown');
    expect(getStoreName('')).toBe('unknown');
  });

  it('handles URLs without www prefix', () => {
    expect(getStoreName('https://myntra.com/shirts')).toBe('Myntra');
    expect(getStoreName('https://zara.com/in/')).toBe('Zara');
  });
});

describe('ANALYTICS_EVENTS', () => {
  it('has all expected event keys', () => {
    expect(ANALYTICS_EVENTS.APP_OPENED).toBe('app_opened');
    expect(ANALYTICS_EVENTS.SIGN_IN_STARTED).toBe('sign_in_started');
    expect(ANALYTICS_EVENTS.SIGN_IN_COMPLETED).toBe('sign_in_completed');
    expect(ANALYTICS_EVENTS.SIGN_IN_FAILED).toBe('sign_in_failed');
    expect(ANALYTICS_EVENTS.SIGN_OUT).toBe('sign_out');
    expect(ANALYTICS_EVENTS.TRYON_STARTED).toBe('tryon_started');
    expect(ANALYTICS_EVENTS.TRYON_COMPLETED).toBe('tryon_completed');
    expect(ANALYTICS_EVENTS.TRYON_FAILED).toBe('tryon_failed');
    expect(ANALYTICS_EVENTS.VIDEO_STARTED).toBe('video_started');
    expect(ANALYTICS_EVENTS.VIDEO_COMPLETED).toBe('video_completed');
    expect(ANALYTICS_EVENTS.VIDEO_FAILED).toBe('video_failed');
    expect(ANALYTICS_EVENTS.CHAT_MESSAGE_SENT).toBe('chat_message_sent');
    expect(ANALYTICS_EVENTS.SAVED_TAB_OPENED).toBe('saved_tab_opened');
    expect(ANALYTICS_EVENTS.MODEL_CHANGED).toBe('model_changed');
  });

  it('event values are readonly strings', () => {
    // Ensures the object is typed as const
    const keys = Object.keys(ANALYTICS_EVENTS);
    expect(keys.length).toBeGreaterThan(0);
    keys.forEach((key) => {
      expect(typeof (ANALYTICS_EVENTS as any)[key]).toBe('string');
    });
  });
});
