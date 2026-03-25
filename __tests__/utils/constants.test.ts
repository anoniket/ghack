import { isDemoMode, setDemoMode, API_URL, TAB_BAR_BASE_HEIGHT } from '@/utils/constants';

describe('isDemoMode / setDemoMode', () => {
  afterEach(() => {
    // Reset to default after each test
    setDemoMode(false);
  });

  it('defaults to false', () => {
    expect(isDemoMode()).toBe(false);
  });

  it('can be set to true', () => {
    setDemoMode(true);
    expect(isDemoMode()).toBe(true);
  });

  it('can be toggled back to false', () => {
    setDemoMode(true);
    expect(isDemoMode()).toBe(true);
    setDemoMode(false);
    expect(isDemoMode()).toBe(false);
  });

  it('handles multiple rapid toggles', () => {
    setDemoMode(true);
    setDemoMode(false);
    setDemoMode(true);
    setDemoMode(true);
    expect(isDemoMode()).toBe(true);
  });
});

describe('API_URL', () => {
  it('is a string', () => {
    expect(typeof API_URL).toBe('string');
  });

  it('falls back to localhost when env var not set', () => {
    // In test environment, EXPO_PUBLIC_API_URL is not set
    expect(API_URL).toBe('http://localhost:3000');
  });
});

describe('TAB_BAR_BASE_HEIGHT', () => {
  it('is a number', () => {
    expect(typeof TAB_BAR_BASE_HEIGHT).toBe('number');
  });

  it('is 58', () => {
    expect(TAB_BAR_BASE_HEIGHT).toBe(58);
  });
});
