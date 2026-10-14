import { emptyRecipe, type Preset } from './recipe';
import { sampleImageUrl } from '../lib/deployment';

const now = '2026-01-01T00:00:00.000Z';
const make = (id: string, name: string, description: string, recipe: Partial<Preset['recipe']>, tags: string[]): Preset => ({
  id, name, description, source: 'builtin', tags, favorite: false, previewType: 'portrait',
  recipe: { ...emptyRecipe, ...recipe }, previewDataUrl: sampleImageUrl('portrait'), createdAt: now, updatedAt: now,
});

export const builtinPresets: Preset[] = [
  make('clean', '清透自然', '提亮阴影，保留自然肤色', { exposure: 8, contrast: -6, highlights: -12, shadows: 18, vibrance: 10 }, ['自然', '通用']),
  make('warm-skin', '暖肤人像', '柔暖肤色与轻微柔化', { brightness: 5, temperature: 18, tint: 4, softness: 8, vibrance: 6 }, ['人像', '暖色']),
  make('film', '复古胶片', '低对比、暖高光和细颗粒', { contrast: -14, highlights: -16, shadows: 10, temperature: 9, saturation: -8, grain: 18, vignette: 10 }, ['胶片', '复古']),
  make('cinema', '冷调电影', '冷色阴影与收敛饱和度', { exposure: -3, contrast: 18, highlights: -20, shadows: -8, temperature: -20, saturation: -12, vignette: 14 }, ['电影', '冷色']),
  make('japanese', '日系柔和', '低反差、明亮而克制', { brightness: 8, contrast: -18, highlights: -10, shadows: 22, temperature: 6, softness: 10 }, ['日系', '柔和']),
  make('food', '食物增色', '增强暖色与食物质感', { contrast: 10, saturation: 12, vibrance: 20, temperature: 12, sharpen: 12 }, ['美食', '鲜明']),
];

builtinPresets[5] = { ...builtinPresets[5], previewType: 'food', previewDataUrl: sampleImageUrl('food') };

export function cloneUserPreset(preset: Preset, id: string, timestamp: string): Preset {
  const suffix = ' 副本';
  return {
    ...preset,
    id,
    name: `${preset.name.slice(0, 40 - suffix.length)}${suffix}`,
    source: preset.source === 'builtin' ? 'manual' : preset.source,
    favorite: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: undefined,
  };
}

export function renameUserPreset(preset: Preset, name: string, timestamp: string): Preset {
  return { ...preset, name: name.trim().slice(0, 40), updatedAt: timestamp };
}

export function resolvePresetDefaultName(existing?: Preset, suggested?: { name: string }) {
  return existing?.name || suggested?.name || '我的调色模板';
}
