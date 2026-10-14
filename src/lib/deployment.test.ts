import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleImageUrl, presetPreviewUrl, recipeApiUrl, aiAvailable } from './deployment';

afterEach(() => vi.unstubAllEnvs());

describe('deployment paths and AI availability', () => {
  it('serves samples under the configured GitHub repository path', () => {
    vi.stubEnv('BASE_URL', '/lightune-photo-editor/');
    expect(sampleImageUrl('food')).toBe('/lightune-photo-editor/sample-food.png');
    expect(presetPreviewUrl('/sample-portrait.png')).toBe('/lightune-photo-editor/sample-portrait.png');
  });

  it('keeps saved photo thumbnails and external URLs untouched', () => {
    vi.stubEnv('BASE_URL', '/lightune-photo-editor/');
    expect(presetPreviewUrl('data:image/jpeg;base64,example')).toBe('data:image/jpeg;base64,example');
    expect(presetPreviewUrl('https://example.com/picture.png')).toBe('https://example.com/picture.png');
  });

  it('retains the local API and only disables AI in the static build', () => {
    vi.stubEnv('VITE_STATIC_MODE', 'false');
    expect(recipeApiUrl()).toBe('/api/recipes/generate');
    expect(aiAvailable()).toBe(true);
    vi.stubEnv('VITE_STATIC_MODE', 'true');
    expect(aiAvailable()).toBe(false);
  });

  it('supports a separately configured AI backend without exposing any provider key', () => {
    vi.stubEnv('VITE_STATIC_MODE', 'true');
    vi.stubEnv('VITE_API_BASE_URL', 'https://editor-api.example.com/');
    expect(recipeApiUrl()).toBe('https://editor-api.example.com/api/recipes/generate');
    expect(aiAvailable()).toBe(true);
  });
});
