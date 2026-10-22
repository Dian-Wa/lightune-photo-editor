import { describe, expect, it } from 'vitest';
import { localizeRecipeExplanation } from './recipeExplanation';

describe('Chinese recipe explanations', () => {
  it('translates the screenshot parameter names while preserving numeric recipe keys', () => {
    const result = localizeRecipeExplanation({ name: '清透日系胶片人像', description: '微调 hslOrangeLuminance；降低 fade，回调 temperature；提亮 exposure。',
      warnings: ['避免 highlights 过高'], recipe: { temperature: 12, exposure: 8 } });
    expect(result.description).toBe('微调 橙色明度；降低 褪色感，回调 色温；提亮 曝光。');
    expect(result.warnings).toEqual(['避免 高光 过高']);
    expect(result.recipe).toEqual({ temperature: 12, exposure: 8 });
  });
  it('uses a Chinese parameter summary when a provider ignores the language instruction', () => {
    const result = localizeRecipeExplanation({ name: 'Warm film', description: 'Warm cinematic look', warnings: ['Check clipping'], recipe: { temperature: 12 } });
    expect(result.name).toBe('自定义调色');
    expect(result.description).toContain('色温设为12');
    expect(JSON.stringify([result.name, result.description, result.warnings])).not.toMatch(/[a-z]/i);
  });
});
