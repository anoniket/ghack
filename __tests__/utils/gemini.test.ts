import { extractUrlFromResponse, cleanResponseText } from '@/services/gemini';

describe('extractUrlFromResponse', () => {
  it('extracts URL from JSON action block', () => {
    const text = 'Here you go!\n```json\n{"action": "open_url", "url": "https://www.nike.com/in"}\n```';
    expect(extractUrlFromResponse(text)).toBe('https://www.nike.com/in');
  });

  it('extracts plain URL as fallback', () => {
    const text = 'Check out https://www.zara.com/in/ for cool stuff';
    expect(extractUrlFromResponse(text)).toBe('https://www.zara.com/in/');
  });

  it('returns null when no URL present', () => {
    expect(extractUrlFromResponse('Just a normal text response')).toBeNull();
    expect(extractUrlFromResponse('')).toBeNull();
  });

  it('prefers JSON block URL over plain URL', () => {
    const text = 'Visit https://example.com first\n```json\n{"action": "open_url", "url": "https://www.nike.com"}\n```';
    expect(extractUrlFromResponse(text)).toBe('https://www.nike.com');
  });
});

describe('cleanResponseText', () => {
  it('removes JSON action blocks from text', () => {
    const text = 'Here you go!\n```json\n{"action": "open_url", "url": "https://www.nike.com"}\n```';
    const cleaned = cleanResponseText(text);
    expect(cleaned).toBe('Here you go!');
    expect(cleaned).not.toContain('```json');
    expect(cleaned).not.toContain('open_url');
  });

  it('preserves text without JSON blocks', () => {
    const text = 'Just a normal response';
    expect(cleanResponseText(text)).toBe('Just a normal response');
  });

  it('handles empty string', () => {
    expect(cleanResponseText('')).toBe('');
  });

  it('handles text with only a JSON block', () => {
    const text = '```json\n{"action": "open_url", "url": "https://example.com"}\n```';
    expect(cleanResponseText(text)).toBe('');
  });
});
