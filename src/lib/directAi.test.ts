import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatEndpoint, loadAiSettings, parseDirectRecipe, rememberAiSettings, requestDirectRecipe } from './directAi';

const config = { baseUrl: 'https://example.com/v1/', model: 'demo', apiKey: 'test-secret', jsonMode: false };
beforeEach(() => {
  const values: Record<string, string> = {};
  vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] || null,
    setItem: (key: string, value: string) => { values[key] = value; }, toJSON: () => values });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('direct browser AI', () => {
  it('accepts base and full endpoint URLs and rejects unsafe or ambiguous URLs', () => {
    expect(chatEndpoint(config.baseUrl)).toBe('https://example.com/v1/chat/completions');
    expect(chatEndpoint('https://example.com/custom/chat/completions/')).toBe('https://example.com/custom/chat/completions');
    for (const url of ['http://example.com', 'javascript:alert(1)', 'https://a:b@example.com', 'https://example.com?key=secret', 'https://example.com#x']) expect(() => chatEndpoint(url)).toThrow();
  });
  it('stores only explicitly remembered non-secret settings', () => {
    rememberAiSettings(config);
    expect(loadAiSettings()).toEqual({ ...config, apiKey: '' });
    expect(JSON.stringify(localStorage)).not.toContain(config.apiKey);
  });
  it('validates model JSON, normalizes ranges, and rejects invalid recipes', () => {
    expect(parseDirectRecipe('```json\n{"name":"暖调","description":"自然暖色","recipe":{"temperature":999}}\n```').recipe.temperature).toBe(100);
    for (const recipe of [{}, { unknown: 5 }, { brightness: 'bad' }, []]) expect(() => parseDirectRecipe(JSON.stringify({ name: 'a', description: 'b', recipe }))).toThrow();
  });
  it('sends only text to the selected service with optional JSON mode', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"name":"暖调","description":"自然","recipe":{"brightness":12}}' } }] })));
    vi.stubGlobal('fetch', request);
    const result = await requestDirectRecipe({ ...config, jsonMode: true }, '自然暖色', 'portrait');
    expect(result.recipe.brightness).toBe(12);
    const options = request.mock.calls[0][1];
    expect(options.credentials).toBe('omit');
    expect(options.redirect).toBe('error');
    const body = JSON.parse(options.body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(Object.keys(body)).toEqual(['model', 'temperature', 'stream', 'response_format', 'messages']);
    expect(body.messages[1]).toEqual({ role: 'user', content: '自然暖色' });
  });
  it('explains CORS/network failure without leaking provider responses or credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(requestDirectRecipe(config, '自然暖色', 'portrait')).rejects.toThrow('CORS');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('test-secret', { status: 401 })));
    await expect(requestDirectRecipe(config, '自然暖色', 'portrait')).rejects.toThrow('API 密钥无效');
  });
  it('aborts on cancellation and times out stalled requests', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const cancelled = expect(requestDirectRecipe(config, '自然暖色', 'portrait', controller.signal)).rejects.toThrow('已取消');
    controller.abort(); await cancelled;
    const expired = expect(requestDirectRecipe(config, '自然暖色', 'portrait')).rejects.toThrow('60 秒');
    await vi.advanceTimersByTimeAsync(60_000); await expired;
  });
});
