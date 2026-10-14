import { z } from 'zod';

export type ControlDefinition = { label: string; min: number; max: number; defaultValue: number; unit?: string };
const control = (label: string, defaultValue = 0, min = -100, max = 100, unit?: string): ControlDefinition =>
  ({ label, min, max, defaultValue, unit });

const basicDefinitions = {
  brightness: control('亮度'), exposure: control('曝光'), contrast: control('对比度'),
  highlights: control('高光'), shadows: control('阴影'), whites: control('白色色阶'),
  blacks: control('黑色色阶'), midtones: control('中间调'),
  saturation: control('饱和度'), vibrance: control('自然饱和度'), temperature: control('色温'),
  tint: control('色调'), hue: control('整体色相', 0, -180, 180, '°'),
  sharpen: control('锐化'), softness: control('柔化'), clarity: control('清晰度'),
  fade: control('褪色感'), vignette: control('暗角'), grain: control('颗粒'),
  strength: control('风格强度', 100, 0),
  vignetteMidpoint: control('暗角中点', 50, 0), vignetteRoundness: control('暗角圆度', 0, 0),
  vignetteFeather: control('暗角羽化', 50, 0), grainSize: control('颗粒大小', 0, 0),
  grainRoughness: control('颗粒粗糙度', 50, 0),
  gradingShadowHue: control('阴影色相', 0, 0, 360, '°'), gradingShadowSaturation: control('阴影饱和度', 0, 0),
  gradingMidtoneHue: control('中间调色相', 0, 0, 360, '°'), gradingMidtoneSaturation: control('中间调饱和度', 0, 0),
  gradingHighlightHue: control('高光色相', 0, 0, 360, '°'), gradingHighlightSaturation: control('高光饱和度', 0, 0),
  gradingBlending: control('分级混合', 50, 0), gradingBalance: control('分级平衡'),
  blackWhiteMix: control('黑白强度', 0, 0),
  lightEnabled: control('光照开关', 1, 0, 1), colorEnabled: control('色彩开关', 1, 0, 1),
  detailEnabled: control('质感开关', 1, 0, 1), hslEnabled: control('HSL开关', 1, 0, 1),
  curvesEnabled: control('曲线开关', 1, 0, 1), gradingEnabled: control('分级开关', 1, 0, 1),
  blackWhiteEnabled: control('黑白开关', 1, 0, 1), vignetteEnabled: control('暗角开关', 1, 0, 1),
  grainEnabled: control('颗粒开关', 1, 0, 1),
};

export const colorBands = [
  { id: 'Red', label: '红', hue: 0, swatch: '#f26963' },
  { id: 'Orange', label: '橙', hue: 30, swatch: '#eea15b' },
  { id: 'Yellow', label: '黄', hue: 60, swatch: '#e9cd64' },
  { id: 'Green', label: '绿', hue: 120, swatch: '#78bd87' },
  { id: 'Cyan', label: '青', hue: 180, swatch: '#6cc7cc' },
  { id: 'Blue', label: '蓝', hue: 240, swatch: '#6b9be8' },
  { id: 'Purple', label: '紫', hue: 270, swatch: '#a58ade' },
  { id: 'Magenta', label: '洋红', hue: 300, swatch: '#df7eb6' },
] as const;
export type ColorBand = (typeof colorBands)[number]['id'];
export type HslKey = `hsl${ColorBand}${'Hue' | 'Saturation' | 'Luminance'}`;
type BlackWhiteKey = `blackWhite${ColorBand}`;
export const curveChannels = [
  { id: 'Rgb', label: 'RGB', color: '#e4e9ed' }, { id: 'Red', label: '红', color: '#f26963' },
  { id: 'Green', label: '绿', color: '#78bd87' }, { id: 'Blue', label: '蓝', color: '#6b9be8' },
] as const;
export type CurveChannel = (typeof curveChannels)[number]['id'];
export const curveAnchors = [0, 25, 50, 75, 100] as const;
export const curveInputValues = [0, 64, 128, 191, 255] as const;
export type CurveKey = `curve${CurveChannel}${(typeof curveAnchors)[number]}`;
export type RecipeKey = keyof typeof basicDefinitions | HslKey | CurveKey | BlackWhiteKey;
export type AdjustmentRecipe = Record<RecipeKey, number>;

const hslDefinitions = Object.fromEntries(colorBands.flatMap((band) => [
  [`hsl${band.id}Hue`, control(`${band.label}色色相`)],
  [`hsl${band.id}Saturation`, control(`${band.label}色饱和度`)],
  [`hsl${band.id}Luminance`, control(`${band.label}色明度`)],
])) as Record<HslKey, ControlDefinition>;
const curveDefinitions = Object.fromEntries(curveChannels.flatMap((channel) =>
  curveAnchors.map((anchor, index) => [`curve${channel.id}${anchor}`,
    control(`${channel.label}曲线${anchor}%`, curveInputValues[index], 0, 255)]),
)) as Record<CurveKey, ControlDefinition>;
const blackWhiteDefinitions = Object.fromEntries(colorBands.map((band) =>
  [`blackWhite${band.id}`, control(`黑白${band.label}色明度`)],
)) as Record<BlackWhiteKey, ControlDefinition>;

export const controlDefinitions: Record<RecipeKey, ControlDefinition> = {
  ...basicDefinitions, ...hslDefinitions, ...curveDefinitions, ...blackWhiteDefinitions,
};
export const recipeKeys = Object.keys(controlDefinitions) as RecipeKey[];
export const emptyRecipe = Object.fromEntries(recipeKeys.map((key) =>
  [key, controlDefinitions[key].defaultValue],
)) as AdjustmentRecipe;

export type ModuleId = 'light' | 'color' | 'detail' | 'hsl' | 'curves' | 'grading' | 'blackWhite' | 'vignette' | 'grain';
export type RecipeModule = { id: ModuleId; name: string; enabledKey: RecipeKey; keys: RecipeKey[]; advanced?: boolean; hint: string };
export const recipeModules: RecipeModule[] = [
  { id: 'light', name: '光照', enabledKey: 'lightEnabled', keys: ['brightness', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'midtones'], hint: '白色与黑色色阶作用于两端，中间调主要调整中等亮度。' },
  { id: 'color', name: '色彩', enabledKey: 'colorEnabled', keys: ['temperature', 'tint', 'saturation', 'vibrance', 'hue'], hint: '色温调整冷暖；整体色相会旋转画面中的所有颜色。' },
  { id: 'detail', name: '质感', enabledKey: 'detailEnabled', keys: ['sharpen', 'softness', 'clarity', 'fade'], hint: '清晰度调整局部明暗反差，负值更柔和；褪色感抬起暗部。' },
  { id: 'hsl', name: '单色细调 · HSL', enabledKey: 'hslEnabled', keys: Object.keys(hslDefinitions) as RecipeKey[], advanced: true, hint: '选择一种颜色调整；色相范围约 ±30°，相邻颜色平滑过渡。' },
  { id: 'curves', name: '曲线', enabledKey: 'curvesEnabled', keys: Object.keys(curveDefinitions) as RecipeKey[], advanced: true, hint: '五个固定输入点可上下拖动；输出数值 0–255。RGB 控制明暗，单通道控制偏色。' },
  { id: 'grading', name: '色彩分级', enabledKey: 'gradingEnabled', keys: ['gradingShadowHue', 'gradingShadowSaturation', 'gradingMidtoneHue', 'gradingMidtoneSaturation', 'gradingHighlightHue', 'gradingHighlightSaturation', 'gradingBlending', 'gradingBalance'], advanced: true, hint: '分别为阴影、中间调和高光着色；正平衡偏向高光，负平衡偏向阴影。' },
  { id: 'blackWhite', name: '黑白混色', enabledKey: 'blackWhiteEnabled', keys: ['blackWhiteMix', ...Object.keys(blackWhiteDefinitions) as RecipeKey[]], advanced: true, hint: '先提高黑白强度，再按原来的颜色控制转换后的灰度明暗。' },
  { id: 'vignette', name: '暗角细调', enabledKey: 'vignetteEnabled', keys: ['vignette', 'vignetteMidpoint', 'vignetteRoundness', 'vignetteFeather'], advanced: true, hint: '正暗角压暗边缘，负值提亮；中点、圆度与羽化控制覆盖范围。' },
  { id: 'grain', name: '颗粒细调', enabledKey: 'grainEnabled', keys: ['grain', 'grainSize', 'grainRoughness'], advanced: true, hint: '颗粒为固定噪声图案，同一照片和配方重复处理保持一致。' },
];

export function resetRecipeModule(recipe: AdjustmentRecipe, moduleId: ModuleId): AdjustmentRecipe {
  const module = recipeModules.find((item) => item.id === moduleId)!;
  const next = { ...recipe, [module.enabledKey]: 1 };
  for (const key of module.keys) next[key] = emptyRecipe[key];
  return next;
}

export function effectiveRecipe(recipe: AdjustmentRecipe): AdjustmentRecipe {
  const next = { ...recipe };
  for (const module of recipeModules) {
    if (recipe[module.enabledKey] === 0) for (const key of module.keys) next[key] = emptyRecipe[key];
  }
  return next;
}

const finiteNumber = z.number().finite().optional().catch(undefined);
export const recipeInputSchema = z.object(Object.fromEntries(recipeKeys.map((key) => [key, finiteNumber])) as Record<RecipeKey, typeof finiteNumber>).partial();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeRecipe(input: unknown): AdjustmentRecipe {
  const parsed = recipeInputSchema.safeParse(input);
  const value = parsed.success ? parsed.data : {};
  return Object.fromEntries(recipeKeys.map((key) => {
    const raw = Number.isFinite(value[key]) ? Number(value[key]) : emptyRecipe[key];
    const definition = controlDefinitions[key];
    return [key, Math.round(clamp(raw, definition.min, definition.max))];
  })) as AdjustmentRecipe;
}

export const presetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  source: z.enum(['builtin', 'ai', 'manual']),
  prompt: z.string().max(500).optional(),
  description: z.string().max(160).optional(),
  tags: z.array(z.string().max(20)).max(10),
  favorite: z.boolean(),
  recipe: z.record(z.string(), z.number()),
  previewType: z.enum(['portrait', 'landscape', 'food', 'indoor']),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().optional(),
  previewDataUrl: z.string().max(500_000).optional(),
});

export type Preset = Omit<z.infer<typeof presetSchema>, 'recipe'> & { recipe: AdjustmentRecipe };
