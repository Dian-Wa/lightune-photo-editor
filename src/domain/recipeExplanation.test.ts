import { describe, expect, it } from 'vitest';
import { localizeRecipeExplanation, recipeExplanationMessage } from './recipeExplanation';

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
  it('converts the latest screenshot at the final display boundary, including legacy proxy results', () => {
    const result = recipeExplanationMessage({ name: '清透日系胶片肖像', description: '肤色以橙色为主，橙色饱和降低可避免偏黄；可根据实际画面调整strength；肤质颗粒未单独添加，可用grain参数增强质感；曲线下压蓝色通道营造日系青橙色调，使用原片偏蓝的画面需回调。',
      warnings: ['建议调整strength，可用grain参数增强质感'], recipe: { strength: 80, grain: 10 } });
    expect(result.explanation).toContain('调整风格强度');
    expect(result.explanation).toContain('颗粒参数增强质感');
    expect(result.explanation).not.toMatch(/\p{Script=Latin}/u);
  });
  it('handles case variants, full-width English, and accented Latin text', () => {
    const result = recipeExplanationMessage({ name: '中文名称', description: '调整ＳＴＲＥＮＧＴＨ，降低ＧＲＡＩＮ', warnings: ['加入café风格'], recipe: { grain: 12 } });
    expect(result.explanation).toContain('调整风格强度，降低颗粒');
    expect(result.explanation).not.toMatch(/\p{Script=Latin}/u);
  });
});
