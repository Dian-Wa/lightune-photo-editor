import { openDB } from 'idb';
import { normalizeRecipe, presetSchema, type Preset } from '../domain/recipe';
import type { EditorDocument } from '../domain/editorDocument';

const dbName = 'lightune-local';
const storeName = 'presets';

async function database() {
  if (typeof indexedDB === 'undefined') return null;
  return openDB(dbName, 3, { upgrade(db) {
    if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' });
    if (!db.objectStoreNames.contains('session')) db.createObjectStore('session');
    if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts',{keyPath:'id'});
  } });
}

export async function loadUserPresets(): Promise<Preset[]> {
  const db = await database();
  const presets = db ? (await db.getAll(storeName)) as Preset[] : [];
  return presets.map((preset) => ({ ...preset, recipe: normalizeRecipe(preset.recipe),filter:preset.filter?{...preset.filter,recipe:normalizeRecipe(preset.filter.recipe)}:undefined }));
}

export async function savePreset(preset: Preset) {
  const db = await database();
  if (!db) throw new Error('当前浏览器不支持本地模板存储');
  await db.put(storeName, preset);
}

export async function deletePreset(id: string) {
  const db = await database();
  if (db) await db.delete(storeName, id);
}

export async function savePresetBatch(presets: Preset[]) {
  const db = await database();
  if (!db) return;
  const tx = db.transaction(storeName, 'readwrite');
  await Promise.all([...presets.map((preset) => tx.store.put(preset)), tx.done]);
}

export async function clearPresetStore() {
  const db = await database();
  if (db) await Promise.all([db.clear(storeName), db.clear('session')]);
}

export type SavedSession = { recipe: Preset['recipe']; selectedId: string; prompt: string; previewType: Preset['previewType']; recipeSource?: 'manual' | 'ai'; aiDraft?: { name: string; description: string } };

export async function loadSession(): Promise<SavedSession | null> {
  const db = await database();
  const value = db ? await db.get('session', 'current') as SavedSession | undefined : undefined;
  return value ? { ...value, recipe: normalizeRecipe(value.recipe) } : null;
}

export async function saveSession(session: SavedSession) {
  const db = await database();
  if (db) await db.put('session', session, 'current');
}

export function parsePresetBackup(raw: string): Preset[] {
  const input = JSON.parse(raw) as unknown;
  if (!Array.isArray(input)) throw new Error('备份文件不是模板列表');
  return input.map((item) => {
    const parsed = presetSchema.safeParse(item);
    if (!parsed.success || parsed.data.source === 'builtin') throw new Error('备份中包含无效模板');
    return { ...parsed.data, recipe: normalizeRecipe(parsed.data.recipe),filter:parsed.data.filter?{...parsed.data.filter,recipe:normalizeRecipe(parsed.data.filter.recipe)}:undefined } as Preset;
  });
}

export type EditorDraft = { id:string; version:1; name:string; source:Blob; document:EditorDocument; updatedAt:string; thumbnail?:string };
export async function loadDrafts(): Promise<EditorDraft[]> {
  const db=await database();
  return db ? ((await db.getAll('drafts')) as EditorDraft[]).filter(draft=>draft.version===1).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)) : [];
}
export async function saveDraft(draft:EditorDraft) {
  const db=await database();
  if(!db) throw new Error('浏览器不支持本地草稿');
  await db.put('drafts',draft);
}
