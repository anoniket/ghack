/**
 * Tests for services/api.ts
 *
 * We test getDeviceId (which uses AsyncStorage + expo-application)
 * and the apiFetch behavior (auth headers, error handling) indirectly
 * through the exported API functions.
 */

// We need to mock fetch globally before importing
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import { setDemoMode } from '@/utils/constants';
import * as api from '@/services/api';

// Reset demo mode between tests
afterEach(() => {
  setDemoMode(false);
  mockFetch.mockReset();
});

describe('getDeviceId', () => {
  it('returns a device ID string', async () => {
    const id = await api.getDeviceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('caches the device ID on subsequent calls', async () => {
    const id1 = await api.getDeviceId();
    const id2 = await api.getDeviceId();
    expect(id1).toBe(id2);
  });
});

describe('apiFetch behavior (through exported functions)', () => {
  it('adds Authorization header with Clerk token in normal mode', async () => {
    setDemoMode(false);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [] }),
    });

    await api.getHistory();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer test-token-123');
  });

  it('adds x-device-id header in demo mode instead of auth token', async () => {
    setDemoMode(true);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [] }),
    });

    await api.getHistory();

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['x-device-id']).toBeDefined();
    expect(options.headers['Authorization']).toBeUndefined();
  });

  it('throws RATE_LIMITED on 429 response', async () => {
    setDemoMode(true);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
    });

    await expect(api.getHistory()).rejects.toThrow('RATE_LIMITED');
  });

  it('throws UNAUTHORIZED on 401 response', async () => {
    setDemoMode(true);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });

    await expect(api.getHistory()).rejects.toThrow('UNAUTHORIZED');
  });

  it('throws error message from response body on other errors', async () => {
    setDemoMode(true);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    });

    await expect(api.getHistory()).rejects.toThrow('Internal server error');
  });

  it('throws NETWORK_ERROR on TypeError with network message', async () => {
    setDemoMode(true);
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(api.getHistory()).rejects.toThrow('NETWORK_ERROR');
  });

  it('throws TIMEOUT on AbortError', async () => {
    setDemoMode(true);
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);

    await expect(api.getHistory()).rejects.toThrow('TIMEOUT');
  });

  it('sets Content-Type to application/json', async () => {
    setDemoMode(true);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: 'hello', url: null }),
    });

    await api.sendChat('hello');

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });
});

describe('API function signatures', () => {
  beforeEach(() => {
    setDemoMode(true);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          items: [],
          description: 'test',
          cached: true,
          count: 1,
          jobId: 'j1',
          status: 'complete',
          found: false,
        }),
    });
  });

  it('getHistory calls /api/history', async () => {
    await api.getHistory();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/history');
  });

  it('sendChat sends message and history in body', async () => {
    await api.sendChat('hello', [{ role: 'user', text: 'hi' }]);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/chat');
    const body = JSON.parse(options.body);
    expect(body.message).toBe('hello');
    expect(body.history).toEqual([{ role: 'user', text: 'hi' }]);
  });

  it('deleteSession calls DELETE /api/history/:id', async () => {
    await api.deleteSession('sess_abc');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/history/sess_abc');
    expect(options.method).toBe('DELETE');
  });

  it('deleteAllSessions calls DELETE /api/history', async () => {
    await api.deleteAllSessions();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/history');
    expect(options.method).toBe('DELETE');
  });

  it('describeSelfie sends POST with selfieBase64', async () => {
    await api.describeSelfie('base64data');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/selfie-describe');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.selfieBase64).toBe('base64data');
  });

  it('checkProductTryOn passes sourceUrl as query param', async () => {
    await api.checkProductTryOn('https://example.com/product');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/product-tryon');
    expect(url).toContain('sourceUrl=');
  });
});
