import { describe, expect, it } from 'vitest';
import { parseModelRecipe } from './aiRecipe';

describe('parseModelRecipe', () => {
  it('validates metadata and normalizes every recipe field', () => {
    const result = parseModelRecipe(JSON.stringify({
      name: ' 暖日胶片 ',
      description: '自然、轻暖',
      recipe: { temperature: 160, contrast: -18 },
      warnings: ['高光可能偏暖'],
    }));
    expect(result.name).toBe('暖日胶片');
    expect(result.recipe.temperature).toBe(100);
    expect(result.recipe.contrast).toBe(-18);
    expect(result.recipe.strength).toBe(100);
  });

  it('rejects malformed model output', () => {
    expect(() => parseModelRecipe('not json')).toThrow('AI 返回格式无效');
  });

  it('accepts professional AI controls without losing legacy recipe fields', () => {
    const result = parseModelRecipe(JSON.stringify({ name: '冷暖分级', description: '蓝色阴影与暖高光',
      recipe: { brightness: 5, hslOrangeSaturation: -18, gradingShadowHue: 220,
        gradingShadowSaturation: 22, gradingHighlightHue: 40, gradingHighlightSaturation: 18,
        curveRgb50: 150, blackWhiteMix: 0 }, warnings: [] }));
    expect(result.recipe).toMatchObject({ brightness: 5, hslOrangeSaturation: -18,
      gradingShadowHue: 220, gradingShadowSaturation: 22, curveRgb50: 150, curveRed50: 128 });
  });
});
