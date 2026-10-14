import { z } from 'zod';
import { controlDefinitions, normalizeRecipe, recipeKeys, recipeModules } from '../src/domain/recipe.ts';

const responseSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(160),
  recipe: z.record(z.string(), z.number()),
  warnings: z.array(z.string().max(120)).max(5).default([]),
});

export function parseModelRecipe(text: string) {
  try {
    const parsed = responseSchema.parse(JSON.parse(text));
    return { ...parsed, recipe: normalizeRecipe(parsed.recipe) };
  } catch { throw new Error('AI 返回格式无效'); }
}

export async function requestRecipe(prompt: string, previewType: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('尚未配置 OPENAI_API_KEY，请先复制 .env.example 为 .env');
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'gpt-5.6-terra';
  const controls = recipeKeys.map((key) => {
    const definition = controlDefinitions[key];
    return `${key}（${definition.label}）：${definition.min}~${definition.max}，默认 ${definition.defaultValue}`;
  }).join('；');
  const modules = recipeModules.map((module) => `${module.name}：${module.hint}`).join('\n');
  const system = `你是专业调色师。把中文描述转换为调色配方。场景：${previewType}。只输出 JSON，字段为 name, description, recipe, warnings。recipe 是扁平的数值对象，可仅返回需要修改的参数，遗漏参数自动使用默认值。不要输出数组或嵌套对象。支持参数：${controls}。\n模块说明：\n${modules}\n曲线字段表示输入 0、64、128、191、255 时的输出值，默认是恒等曲线；色相为角度，HSL 色相除外，它以 -100~100 表示约 ±30°。Enabled 字段只取 0 或 1；关闭模块保留参数但不参与效果。黑白混色需要 blackWhiteMix 大于 0，通常黑白效果设为 100。风格强度通常为 100。不需要的参数保持默认，避免过度叠加所有高级效果。`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0.3, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'AI 密钥无效' : `AI 服务暂时不可用（${response.status}）`);
      const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return parseModelRecipe(body.choices?.[0]?.message?.content || '');
    } catch (error) { lastError = error; }
    finally { clearTimeout(timeout); }
  }
  if (lastError instanceof Error && lastError.name === 'AbortError') throw new Error('AI 请求超时，请稍后重试');
  throw lastError instanceof Error ? lastError : new Error('AI 请求失败');
}
