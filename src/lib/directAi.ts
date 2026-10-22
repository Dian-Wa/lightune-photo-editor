import { z } from 'zod';
import { controlDefinitions, normalizeRecipe, recipeKeys, recipeModules } from '../domain/recipe';
import { chineseExplanationInstruction, localizeRecipeExplanation } from '../domain/recipeExplanation';

export type DirectAiConfig = { baseUrl: string; apiKey: string; model: string; jsonMode: boolean };
export const defaultAiConfig: DirectAiConfig = { baseUrl: '', apiKey: '', model: '', jsonMode: false };
const storageKey = 'lightune.ai-settings.v1';

export function loadAiSettings(): DirectAiConfig {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return { ...defaultAiConfig, baseUrl: typeof value?.baseUrl === 'string' ? value.baseUrl : '',
      model: typeof value?.model === 'string' ? value.model : '', jsonMode: value?.jsonMode === true };
  } catch { return { ...defaultAiConfig }; }
}

export function rememberAiSettings(config: DirectAiConfig) {
  // Deliberately whitelist non-secret fields: credentials never enter browser storage.
  localStorage.setItem(storageKey, JSON.stringify({ baseUrl: config.baseUrl, model: config.model, jsonMode: config.jsonMode }));
}

export function chatEndpoint(baseUrl: string): string {
  let url: URL;
  try { url = new URL(baseUrl.trim()); } catch { throw new Error('请输入完整的 HTTPS 接口地址'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('接口地址须使用 HTTPS，不能包含账号、密码、查询参数或片段');
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
  return url.toString();
}

const resultSchema = z.object({
  name: z.string().trim().min(1).max(40), description: z.string().trim().min(1).max(160),
  recipe: z.record(z.string(), z.number().finite()), warnings: z.array(z.string().max(120)).max(5).default([]),
});

export function parseDirectRecipe(content: unknown) {
  try {
    if (typeof content !== 'string') throw new Error();
    const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = resultSchema.parse(JSON.parse(text));
    if (!recipeKeys.some((key) => Object.hasOwn(parsed.recipe, key))) throw new Error();
    return localizeRecipeExplanation({ ...parsed, recipe: normalizeRecipe(parsed.recipe) });
  } catch { throw new Error('AI 返回的配方格式无效，请重试或更换模型'); }
}

function systemPrompt(previewType: string) {
  const controls = recipeKeys.map((key) => {
    const item = controlDefinitions[key];
    return `${key}（${item.label}）：${item.min}~${item.max}，默认 ${item.defaultValue}`;
  }).join('；');
  return `你是专业调色师。把用户描述转换为调色配方。场景：${previewType}。只输出 JSON 对象，字段为 name（40字内名称）、description（160字内说明）、recipe（扁平数值对象）、warnings（最多5条简短提示的数组）。recipe 至少包含一个支持参数，未修改参数可省略。支持参数：${controls}。\n模块：${recipeModules.map((m) => `${m.name}：${m.hint}`).join('\n')}\n曲线字段为输入0、64、128、191、255对应的输出，默认恒等曲线。Enabled仅取0或1。黑白效果需blackWhiteMix=100。strength通常为100。避免过度叠加效果。`;
}

export async function requestDirectRecipe(config: DirectAiConfig, prompt: string, previewType: string, signal?: AbortSignal) {
  const endpoint = chatEndpoint(config.baseUrl);
  if (!config.apiKey.trim() || !config.model.trim()) throw new Error('请填写 API 密钥和模型名称');
  if (prompt.trim().length < 2 || prompt.trim().length > 500) throw new Error('请输入 2–500 字的调色描述');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
      body: JSON.stringify({ model: config.model.trim(), temperature: 0.3, stream: false,
        ...(config.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'system', content: `${systemPrompt(previewType)}\n${chineseExplanationInstruction}` }, { role: 'user', content: prompt.trim() }] }),
    });
    if (!response.ok) {
      const messages: Record<number, string> = { 400: '请求参数不被服务支持，请核对模型并尝试关闭 JSON 模式',
        401: 'API 密钥无效或已过期', 403: '服务拒绝访问，请检查密钥权限', 404: '接口或模型不存在，请核对地址和模型名称',
        429: '请求过于频繁或服务额度不足' };
      throw new Error(messages[response.status] || `AI 服务请求失败（HTTP ${response.status}）`);
    }
    let body;
    try { body = await response.json(); } catch { throw new Error('接口没有返回有效 JSON，请核对接口地址'); }
    return parseDirectRecipe(body?.choices?.[0]?.message?.content);
  } catch (error) {
    if (timedOut) throw new Error('AI 请求超过 60 秒，请稍后重试');
    if (controller.signal.aborted) throw new Error('已取消 AI 请求');
    if (error instanceof TypeError) throw new Error('连接失败：请检查网络、接口地址，以及服务商是否允许浏览器跨域（CORS）请求');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
