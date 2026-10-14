export function sampleImageUrl(previewType: string): string {
  return `${import.meta.env.BASE_URL}sample-${previewType}.png`;
}

export function presetPreviewUrl(url: string): string {
  const sample = /^\/sample-(portrait|landscape|food|indoor)\.png$/.exec(url);
  return sample ? sampleImageUrl(sample[1]) : url;
}

export function recipeApiUrl(): string {
  const backend = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  return `${backend}/api/recipes/generate`;
}

export function aiAvailable(): boolean {
  return import.meta.env.VITE_STATIC_MODE !== 'true' || Boolean(import.meta.env.VITE_API_BASE_URL);
}
