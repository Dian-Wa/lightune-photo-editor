import { controlDefinitions, recipeKeys, type RecipeKey } from './recipe.ts';

export const chineseExplanationInstruction = 'name、description、warnings 中的所有文字必须使用简体中文。说明参数时使用中文名称，例如“橙色明度”“褪色感”“色温”“高光”，禁止夹带 hslOrangeLuminance、fade、temperature、exposure 等英文参数名或英文缩写。recipe 对象的字段名仍严格使用规定的英文键，不得翻译。';

const chineseLabel = (key: RecipeKey) => controlDefinitions[key].label.replace(/RGB/g, '综合色').replace(/HSL/g, '单色细调');
const parameterNames = new Map(recipeKeys.map((key) => [key.toLowerCase(), key]));
const parameterPattern = new RegExp(`\\b(${[...recipeKeys].sort((a, b) => b.length - a.length).join('|')})\\b`, 'gi');

export function chineseExplanation(text: string, fallback: string): string {
  const translated = text.replace(/[Ａ-Ｚａ-ｚ]/g, (letter) => letter.normalize('NFKC'))
    .replace(parameterPattern, (key) => chineseLabel(parameterNames.get(key.toLowerCase())!))
    .replace(/\bRGB\b/gi, '综合色').replace(/\bHSL\b/gi, '色相、饱和度与明度');
  return /\p{Script=Latin}/u.test(translated) ? fallback : translated;
}

export function localizeRecipeExplanation<T extends { name: string; description: string; warnings?: string[]; recipe: Record<string, number> }>(result: T): T {
  const changes = recipeKeys.filter((key) => typeof result.recipe[key] === 'number' && result.recipe[key] !== controlDefinitions[key].defaultValue)
    .slice(0, 6).map((key) => `${chineseLabel(key)}设为${result.recipe[key].toLocaleString('zh-CN', { useGrouping: false, maximumFractionDigits: 8 })}`);
  const fallback = changes.length ? `${changes.join('，')}。可结合原图继续微调。` : '保留自然色彩与层次，可结合原图继续微调。';
  return { ...result, name: chineseExplanation(result.name, '自定义调色'), description: chineseExplanation(result.description, fallback),
    warnings: result.warnings?.map((warning) => chineseExplanation(warning, '请结合原图检查色彩与明暗，必要时降低风格强度。')) };
}

// Final UI boundary: apply regardless of whether a result came from a browser service or an older proxy.
export function recipeExplanationMessage(result: { name?: string; description?: string; warnings?: string[]; recipe: Record<string, number> }) {
  const localized = localizeRecipeExplanation({ ...result, name: result.name || '自定义调色', description: result.description || '可结合原图继续微调。' });
  const title = `已生成「${localized.name}」，可继续微调后保存`;
  const explanation = [localized.description, ...(localized.warnings || [])].filter(Boolean).join('；');
  return { title, explanation: chineseExplanation(`${title}；${explanation}`, '已生成调色配方，可结合原图继续微调后保存。'), localized };
}
