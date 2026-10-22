import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore, Copy, Crop, Download, FileDown, FileUp, Heart, ImagePlus,
  LayoutTemplate, Pencil, Plus, RotateCcw, RotateCw, Save, Search, Settings2, SlidersHorizontal, Sparkles, WandSparkles,
  Trash2, Undo2, Upload, X,
} from 'lucide-react';
import PhotoCanvas, { createPresetThumbnail, exportAdjustedImage } from './components/PhotoCanvas';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropTools from './components/CropTools';
import { builtinPresets, cloneUserPreset, renameUserPreset, resolvePresetDefaultName } from './domain/presets';
import { emptyRecipe, normalizeRecipe, type AdjustmentRecipe, type Preset, type RecipeKey } from './domain/recipe';
import { clearPresetStore, deletePreset, loadSession, loadUserPresets, parsePresetBackup, savePreset, savePresetBatch, saveSession } from './lib/presetStore';
import { calculateOutputSize, estimateEncodedBytes } from './lib/imageMath';
import { aiAvailable, presetPreviewUrl, recipeApiUrl, sampleImageUrl } from './lib/deployment';
import { loadAiSettings, rememberAiSettings, requestDirectRecipe } from './lib/directAi';
import { recipeExplanationMessage, chineseExplanation } from './domain/recipeExplanation';
import { cropSourceRect, fitCropToAspect, fullCrop, normalizeCrop, type CropRect } from './lib/crop';

const sampleNames: Record<Preset['previewType'], string> = { portrait: '内置旅行人像样片', landscape: '内置风景样片', food: '内置美食样片', indoor: '内置室内样片' };
type Tab = 'builtin' | 'mine' | 'favorite';
type MobileTool = 'none' | 'filter' | 'template' | 'adjust' | 'crop' | 'ai' | 'export';
type ExportFormat = 'jpeg' | 'png' | 'webp';

const downloadJson = (value: unknown, name: string) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

function Topbar({ canUndo, canRedo, exporting, saving, presetsReady, onUndo, onRedo, onReset, onImport, onSave, onExport }: {
  canUndo: boolean; canRedo: boolean; exporting: boolean; saving: boolean; presetsReady: boolean; onUndo: () => void; onRedo: () => void; onReset: () => void; onImport: () => void; onSave: () => void; onExport: () => void;
}) {
  return <header className="topbar">
    <div className="brand"><span className="brand-mark">☼</span><strong>光调</strong><span className="brand-sub">本地调色工作台</span></div>
    <nav className="tool-actions" aria-label="编辑工具">
      <button className="tool-primary" onClick={onImport}><ImagePlus size={18} />导入照片</button>
      <span className="divider" />
      <button disabled={!canUndo} onClick={onUndo}><Undo2 size={17} />撤销</button>
      <button disabled={!canRedo} onClick={onRedo}><RotateCw size={17} />重做</button>
      <button onClick={onReset}><RotateCcw size={17} />重置</button>
      <span className="divider" />
      <button disabled={saving || !presetsReady} onClick={onSave}><Save size={17} />{saving ? '保存中…' : '保存为模板'}</button>
    </nav>
    <button className="export-top" disabled={exporting} onClick={onExport}><Upload size={18} />{exporting ? '导出中' : '导出'}</button>
  </header>;
}

export default function App() {
  const proxyAvailable = aiAvailable();
  const [aiMode, setAiMode] = useState<'direct' | 'proxy'>('direct');
  const [aiConfig, setAiConfig] = useState(loadAiSettings);
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const aiController = useRef<AbortController | null>(null);
  useEffect(() => () => aiController.current?.abort(), []);
  const [tab, setTab] = useState<Tab>('builtin');
  const [mobileTool, setMobileTool] = useState<MobileTool>('filter');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 800px)').matches));
  const [crop, setCrop] = useState<CropRect>(fullCrop);
  const [cropDraft, setCropDraft] = useState<CropRect>(fullCrop);
  const [cropAspect, setCropAspect] = useState<number | null>(null);
  const [cropEditing, setCropEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [userPresets, setUserPresets] = useState<Preset[]>([]);
  const [presetsReady, setPresetsReady] = useState(false);
  const [selectedId, setSelectedId] = useState('clean');
  const [history, setHistory] = useState<AdjustmentRecipe[]>([builtinPresets[0].recipe]);
  const [cursor, setCursor] = useState(0);
  const recipe = history[cursor];
  const [dirty, setDirty] = useState(false);
  const [imageUrl, setImageUrl] = useState(sampleImageUrl('portrait'));
  const [isSample, setIsSample] = useState(true);
  const [fileName, setFileName] = useState('内置旅行人像样片');
  const [prompt, setPrompt] = useState('温暖的日系胶片感，低对比，肤色自然');
  const [previewType, setPreviewType] = useState('portrait');
  const [aiBusy, setAiBusy] = useState(false);
  const [recipeSource, setRecipeSource] = useState<'manual' | 'ai'>('manual');
  const [aiDraft, setAiDraft] = useState<{ name: string; description: string }>();
  const [notice, setNotice] = useState('图片仅在本地处理');
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [quality, setQuality] = useState(90);
  const [maxEdge, setMaxEdge] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [saveDialog, setSaveDialog] = useState<{ mode: 'create' | 'save-as'; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>();
  const photoInput = useRef<HTMLInputElement>(null);
  const presetInput = useRef<HTMLInputElement>(null);
  const aiDetails = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(max-width: 800px)');
    const sync = () => {
      setIsMobile(media.matches);
      if (aiDetails.current) aiDetails.current.open = !media.matches;
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    void Promise.all([loadUserPresets(), loadSession()]).then(([presets, session]) => {
      setUserPresets(presets);
      if (session) { setHistory([session.recipe]); setCursor(0); setSelectedId(session.selectedId); setPrompt(session.prompt); setPreviewType(session.previewType); setRecipeSource(session.recipeSource || 'manual'); setAiDraft(session.aiDraft); setImageUrl(sampleImageUrl(session.previewType)); setFileName(sampleNames[session.previewType]); }
      setPresetsReady(true);
    }).catch(() => { setPresetsReady(true); setNotice('本地数据读取失败，请检查浏览器存储权限'); });
  }, []);
  useEffect(() => {
    if (!presetsReady) return;
    const timer = window.setTimeout(() => { void saveSession({ recipe, selectedId, prompt, previewType: previewType as Preset['previewType'], recipeSource, aiDraft }); }, 250);
    return () => window.clearTimeout(timer);
  }, [presetsReady, recipe, selectedId, prompt, previewType, recipeSource, aiDraft]);
  useEffect(() => () => { if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const pushRecipe = (next: AdjustmentRecipe, markDirty = true) => {
    setHistory((current) => [...current.slice(0, cursor + 1), next].slice(-60));
    setCursor((current) => Math.min(current + 1, 59));
    if (markDirty) setDirty(true);
  };
  const updateField = (field: RecipeKey, value: number) => pushRecipe(normalizeRecipe({ ...recipe, [field]: value }));
  const activePresets = useMemo(() => {
    const alive = userPresets.filter((preset) => !preset.deletedAt);
    const pool = tab === 'builtin' ? builtinPresets : tab === 'mine' ? alive : [...builtinPresets, ...alive].filter((preset) => preset.favorite);
    const needle = query.trim().toLowerCase();
    return needle ? pool.filter((preset) => `${preset.name} ${preset.tags.join(' ')}`.toLowerCase().includes(needle)) : pool;
  }, [query, tab, userPresets]);
  const recycled = userPresets.filter((preset) => preset.deletedAt);
  const croppedPixels = imageSize ? cropSourceRect(imageSize.width, imageSize.height, crop) : undefined;
  const outputSize = croppedPixels ? calculateOutputSize(croppedPixels.width, croppedPixels.height, maxEdge) : undefined;
  const estimatedBytes = outputSize ? estimateEncodedBytes(outputSize.width, outputSize.height, format, quality / 100) : undefined;

  const selectPreset = (preset: Preset) => {
    if (dirty && !window.confirm('当前有未保存的调整，确认切换模板吗？')) return;
    setSelectedId(preset.id); setHistory([preset.recipe]); setCursor(0); setDirty(false); setRecipeSource(preset.source === 'ai' ? 'ai' : 'manual'); setAiDraft(preset.source === 'ai' ? { name: preset.name, description: preset.description || 'AI 调色模板' } : undefined); setNotice(`已应用「${preset.name}」`);
  };
  const importPhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setNotice('请选择 JPG、PNG 或 WebP 图片');
    if (file.size > 20 * 1024 * 1024) return setNotice('图片不能超过 20MB');
    if (dirty && !window.confirm('导入新照片会保留当前参数，是否继续？')) return;
    const next = URL.createObjectURL(file); setImageUrl(next); setIsSample(false); setFileName(file.name.replace(/\.[^.]+$/, '')); setCrop(fullCrop); setCropDraft(fullCrop); setCropAspect(null); setCropEditing(false); setNotice('照片已载入，原图不会上传');
  };
  const selectedUserPreset = userPresets.find((preset) => preset.id === selectedId && !preset.deletedAt);
  const selectedBuiltinPreset = builtinPresets.find((preset) => preset.id === selectedId);
  const persistCurrent = async (name: string, existing?: Preset) => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) return setNotice('请填写模板名称');
    if (trimmed.length > 40) return setNotice('模板名称不能超过 40 个字符');
    setSaving(true); setNotice('正在保存模板…');
    try {
      const timestamp = new Date().toISOString();
      const source = recipeSource === 'ai' ? 'ai' : existing?.source === 'ai' ? 'ai' : 'manual';
      let previewDataUrl = existing?.previewDataUrl;
      try { previewDataUrl = await createPresetThumbnail(imageUrl, recipe, crop); } catch { /* 样片不可读取时仍保存参数 */ }
      const preset: Preset = { id: existing?.id || crypto.randomUUID(), name: trimmed, source,
        prompt: source === 'ai' ? prompt : undefined,
        description: source === 'ai' ? aiDraft?.description || existing?.description || 'AI 调色模板' : existing?.description || '自定义调色模板',
        tags: existing?.tags || (source === 'ai' ? ['AI 配方'] : ['自定义']),
        favorite: existing?.favorite || false, recipe: normalizeRecipe(recipe), previewDataUrl,
        previewType: previewType as Preset['previewType'], createdAt: existing?.createdAt || timestamp, updatedAt: timestamp };
      await savePreset(preset);
      setUserPresets((items) => [...items.filter((item) => item.id !== preset.id), preset]);
      setSelectedId(preset.id); setDirty(false); setTab('mine'); setSaveDialog(null);
      setRecipeSource(source);
      setAiDraft(source === 'ai' ? { name: trimmed, description: preset.description || 'AI 调色模板' } : undefined);
      setNotice(`${existing ? '已更新' : '已保存新模板'}「${trimmed}」`);
      try { await saveSession({ recipe: preset.recipe, selectedId: preset.id, prompt,
        previewType: preset.previewType, recipeSource: source,
        aiDraft: source === 'ai' ? { name: trimmed, description: preset.description || 'AI 调色模板' } : undefined }); }
      catch { setNotice(`模板「${trimmed}」已保存，但当前会话未能保存`); }
    } catch (error) { setNotice(`模板保存失败：${error instanceof Error ? error.message : '请检查浏览器本地存储'}`); }
    finally { setSaving(false); }
  };
  const openSaveDialog = (mode: 'create' | 'save-as') => {
    const baseName = selectedBuiltinPreset?.name || selectedUserPreset?.name;
    setSaveDialog({ mode, name: mode === 'save-as' && baseName ? `${baseName.slice(0, 37)} 副本` : resolvePresetDefaultName(undefined, aiDraft) });
    setNotice(mode === 'create' ? '请为当前参数命名并创建模板' : '请为当前参数命名并另存为模板');
  };
  const generateRecipe = async () => {
    if (aiBusy) return;
    if (aiMode === 'proxy' && !proxyAvailable) return setNotice('当前页面未配置代理，请使用浏览器直连');
    if (prompt.trim().length < 2) return setNotice('请至少输入 2 个字的调色描述');
    const controller = new AbortController(); aiController.current = controller;
    setAiBusy(true); setAiMessage('AI 正在理解你的调色意图…'); setNotice('AI 正在理解你的调色意图…');
    try {
      const body = aiMode === 'direct' ? await requestDirectRecipe(aiConfig, prompt, previewType, controller.signal) : await (async () => {
        const response = await fetch(recipeApiUrl(), { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt.trim(), previewType }) });
        const result = await response.json() as { name?: string; description?: string; recipe?: unknown; error?: string; warnings?: string[] };
        if (!response.ok) throw new Error(result.error || 'AI 请求失败');
        return result;
      })();
      if (controller.signal.aborted) return;
      const nextRecipe = normalizeRecipe(body.recipe);
      const result = recipeExplanationMessage({ ...body, recipe: nextRecipe });
      pushRecipe(nextRecipe); setRecipeSource('ai'); setAiDraft({ name: result.localized.name, description: result.localized.description });
      setNotice(result.title); setAiMessage(result.explanation);
    } catch (error) {
      const message = controller.signal.aborted ? '已取消 AI 请求' : error instanceof Error ? error.message : 'AI 请求失败';
      setAiMessage(message); setNotice(`${message}；手动调色仍可使用`);
    }
    finally { aiController.current = null; setAiBusy(false); }
  };
  const toggleFavorite = async (preset: Preset) => {
    if (preset.source === 'builtin') return setNotice('内置模板只读，可另存后收藏');
    const next = { ...preset, favorite: !preset.favorite, updatedAt: new Date().toISOString() }; await savePreset(next); setUserPresets((items) => items.map((item) => item.id === next.id ? next : item));
  };
  const recycle = async (preset: Preset) => { const next = { ...preset, deletedAt: new Date().toISOString() }; await savePreset(next); setUserPresets((items) => items.map((item) => item.id === next.id ? next : item)); setNotice('模板已移入回收站'); };
  const restore = async (preset: Preset) => { const { deletedAt: _deleted, ...next } = preset; await savePreset(next); setUserPresets((items) => items.map((item) => item.id === next.id ? next : item)); };
  const duplicate = async (preset: Preset) => {
    if (saving) return;
    if (dirty && selectedId !== preset.id && !window.confirm('当前有未保存的调整，确认复制其他模板吗？')) return setNotice('已取消复制，当前调整已保留');
    setSaving(true); setNotice('正在复制模板…');
    try {
      const copy = cloneUserPreset(preset, crypto.randomUUID(), new Date().toISOString());
      copy.recipe = normalizeRecipe(selectedId === preset.id ? recipe : preset.recipe);
      await savePreset(copy);
      setUserPresets((items) => [...items, copy]); setTab('mine'); setSelectedId(copy.id);
      setHistory([copy.recipe]); setCursor(0); setDirty(false);
      setRecipeSource(copy.source === 'ai' ? 'ai' : 'manual');
      setAiDraft(copy.source === 'ai' ? { name: copy.name, description: copy.description || 'AI 调色模板' } : undefined);
      setNotice(`已复制并选中「${copy.name}」，调整后点击“保存为模板”可更新副本`);
    } catch (error) { setNotice(`复制模板失败：${error instanceof Error ? error.message : '请检查浏览器本地存储'}`); }
    finally { setSaving(false); }
  };
  const resetBuiltin = (preset: Preset) => {
    if (selectedId !== preset.id && dirty && !window.confirm('当前有未保存的调整，确认切换并重置内置模板吗？')) return setNotice('已取消重置，当前调整已保留');
    setSelectedId(preset.id); setHistory([preset.recipe]); setCursor(0); setDirty(false);
    setRecipeSource('manual'); setAiDraft(undefined);
    setNotice(`「${preset.name}」已恢复为内置初始样式`);
  };
  const rename = async (preset: Preset) => {
    const name = window.prompt('新的模板名称（最多 40 个字符）', preset.name)?.trim(); if (!name || name === preset.name) return;
    if (name.length > 40) return setNotice('模板名称不能超过 40 个字符');
    const next = renameUserPreset(preset, name, new Date().toISOString());
    await savePreset(next); setUserPresets((items) => items.map((item) => item.id === next.id ? next : item));
    if (selectedId === next.id && next.source === 'ai') setAiDraft((draft) => ({ name, description: draft?.description || next.description || 'AI 调色模板' }));
    setNotice(`已重命名为「${name}」`);
  };
  const permanentlyDelete = async (preset: Preset) => {
    if (!window.confirm(`永久删除「${preset.name}」？此操作不可撤销。`)) return;
    await deletePreset(preset.id); setUserPresets((items) => items.filter((item) => item.id !== preset.id)); setNotice('模板已永久删除');
  };
  const exportImage = async () => {
    if (exporting) return;
    setExporting(true);
    setNotice('正在按原始分辨率处理…');
    try { const result = await exportAdjustedImage(imageUrl, recipe, { format, quality: quality / 100, maxEdge, name: fileName, crop }); setNotice(`导出完成 · ${result.width}×${result.height} · ${(result.bytes / 1024 / 1024).toFixed(1)}MB`); }
    catch (error) { setNotice(error instanceof Error ? error.message : '导出失败'); }
    finally { setExporting(false); }
  };
  const importPresets = async (file?: File) => {
    if (!file) return;
    try { const parsed = parsePresetBackup(await file.text()); await savePresetBatch(parsed); setUserPresets((items) => [...items.filter((item) => !parsed.some((incoming) => incoming.id === item.id)), ...parsed]); setNotice(`已导入 ${parsed.length} 个模板`); }
    catch (error) { setNotice(error instanceof Error ? error.message : '导入失败'); }
  };
  const clearData = async () => { if (!window.confirm('确认清除全部自定义模板？此操作不可撤销。')) return; await clearPresetStore(); setUserPresets([]); setNotice('本地自定义模板已清除'); };
  const selectMobileTool = (tool: Exclude<MobileTool, 'none'>) => {
    if (mobileTool === tool) { setMobileTool('none'); setCropEditing(false); return; }
    setMobileTool(tool);
    if (tool === 'filter') setTab('builtin');
    if (tool === 'template') setTab('mine');
    if (tool === 'crop') { setCropDraft(crop); setCropEditing(true); }
    else setCropEditing(false);
  };

  return <main className="app-shell" data-mobile-tool={mobileTool} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); importPhoto(event.dataTransfer.files[0]); }}>
    <Topbar canUndo={cursor > 0} canRedo={cursor < history.length - 1} exporting={exporting} saving={saving} presetsReady={presetsReady} onUndo={() => setCursor((value) => Math.max(0, value - 1))} onRedo={() => setCursor((value) => Math.min(history.length - 1, value + 1))} onReset={() => { setRecipeSource('manual'); setAiDraft(undefined); pushRecipe(emptyRecipe); }} onImport={() => photoInput.current?.click()} onSave={() => selectedUserPreset ? void persistCurrent(selectedUserPreset.name, selectedUserPreset) : openSaveDialog('save-as')} onExport={() => void exportImage()} />
    <input ref={photoInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => importPhoto(event.target.files?.[0])} />
    <input ref={presetInput} hidden type="file" accept="application/json" onChange={(event) => void importPresets(event.target.files?.[0])} />
    <div className="workspace">
      <aside className="preset-panel">
        <div className="tabs" role="tablist">
          <button className={tab === 'builtin' ? 'active' : ''} onClick={() => setTab('builtin')}>内置模板</button>
          <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>我的模板</button>
          <button className={tab === 'favorite' ? 'active' : ''} onClick={() => setTab('favorite')}>收藏</button>
        </div>
        <label className="search"><Search size={16} /><input aria-label="搜索模板" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模板或标签" /></label>
        <div className="preset-list">
          {activePresets.map((preset, index) => <article key={preset.id} className={`preset-item ${selectedId === preset.id ? 'selected' : ''}`}>
            <button className="preset-select" onClick={() => selectPreset(preset)}>
              <span className={`preset-thumb tone-${index % 6}`}>{preset.previewDataUrl ? <img src={presetPreviewUrl(preset.previewDataUrl)} alt="" /> : null}</span><span><strong>{preset.name}</strong><small>{preset.source === 'ai' ? chineseExplanation(preset.description || '', '自然调色配方，可结合原图继续微调。') : preset.description}</small></span>
            </button>
            <span className="preset-actions">
              <button aria-label={`复制 ${preset.name}`} title="复制模板" disabled={!presetsReady || saving} onClick={() => void duplicate(preset)}><Copy size={15} /></button>
              {preset.source === 'builtin' ? <button aria-label={`重置内置模板 ${preset.name}`} title="恢复内置初始样式" onClick={() => resetBuiltin(preset)}><RotateCcw size={15} /></button> : null}
              {preset.source !== 'builtin' ? <button aria-label={`重命名 ${preset.name}`} title="重命名模板" onClick={() => void rename(preset)}><Pencil size={15} /></button> : null}
              {preset.source !== 'builtin' ? <button aria-label={`${preset.favorite ? '取消收藏' : '收藏'} ${preset.name}`} title="收藏模板" onClick={() => void toggleFavorite(preset)}><Heart className={preset.favorite ? 'filled' : ''} size={15} /></button> : null}
              {preset.source !== 'builtin' ? <button aria-label={`删除 ${preset.name}`} title="移入回收站" onClick={() => void recycle(preset)}><Trash2 size={15} /></button> : null}
            </span>
          </article>)}
          {activePresets.length === 0 ? <div className="empty-list">这里还没有模板</div> : null}
        </div>
        <div className="library-tools">
          <button disabled={!presetsReady || saving} onClick={() => openSaveDialog('create')}><Plus size={15} />新建模板</button>
          <button onClick={() => presetInput.current?.click()}><FileUp size={15} />导入模板</button>
          <button onClick={() => downloadJson(userPresets.filter((item) => !item.deletedAt), '光调模板备份.json')}><FileDown size={15} />备份</button>
          <button onClick={() => setRecycleOpen(true)}><Trash2 size={15} />回收站 {recycled.length || ''}</button>
          <button className="mobile-clear" onClick={clearData}><Settings2 size={15} />清除数据</button>
        </div>
      </aside>
      <PhotoCanvas imageUrl={imageUrl} recipe={recipe} fileName={fileName} crop={crop}
        cropEditing={isMobile && mobileTool === 'crop' && cropEditing} cropDraft={cropDraft}
        onCropDraftChange={setCropDraft} onImageInfo={setImageSize} />
      <aside className="inspector">
        <section className="ai-panel">
          <div className="section-title"><Sparkles size={18} /><h2>AI 调色灵感</h2></div>
          <details className="ai-connection" ref={aiDetails} open>
            <summary>AI 服务配置</summary>
            <fieldset disabled={aiBusy}>
              <label>调用方式<select aria-label="AI 调用方式" value={aiMode} onChange={(event) => setAiMode(event.target.value as 'direct' | 'proxy')}><option value="direct">浏览器直连（自备密钥）</option><option value="proxy" disabled={!proxyAvailable}>原有代理{!proxyAvailable ? '（未配置）' : ''}</option></select></label>
              {aiMode === 'direct' ? <>
                <p className="connection-help">支持 OpenAI 兼容的 Chat Completions 接口。仅发送文字，需服务商允许浏览器跨域（CORS）。</p>
                <label>接口地址<input aria-label="AI 接口地址" type="url" autoComplete="off" spellCheck={false} placeholder="https://服务商域名/v1" value={aiConfig.baseUrl} onChange={(event) => setAiConfig((current) => ({ ...current, baseUrl: event.target.value }))} /></label>
                <p className="connection-help">填写含版本号的基础地址，或完整 /chat/completions 地址。</p>
                <label>API 密钥<div className="ai-key-row"><input aria-label="AI API 密钥" type={showAiKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder="仅保留在当前页面" value={aiConfig.apiKey} onChange={(event) => setAiConfig((current) => ({ ...current, apiKey: event.target.value }))} /><button type="button" aria-label={showAiKey ? '隐藏密钥' : '显示密钥'} onClick={() => setShowAiKey((value) => !value)}>{showAiKey ? '隐藏' : '显示'}</button></div></label>
                <label>模型名称<input aria-label="AI 模型名称" autoComplete="off" spellCheck={false} placeholder="填写服务商提供的模型 ID" value={aiConfig.model} onChange={(event) => setAiConfig((current) => ({ ...current, model: event.target.value }))} /></label>
                <label className="ai-json-mode"><input type="checkbox" checked={aiConfig.jsonMode} onChange={(event) => setAiConfig((current) => ({ ...current, jsonMode: event.target.checked }))} />启用 JSON 模式（服务商支持时使用）</label>
                <div className="ai-config-actions"><button type="button" onClick={() => { try { rememberAiSettings(aiConfig); setAiMessage('已记住地址和模型，密钥不会保存'); } catch { setAiMessage('浏览器不允许保存设置，当前页面仍可使用'); } }}>记住地址和模型</button><button type="button" onClick={() => { setAiConfig((current) => ({ ...current, apiKey: '' })); setShowAiKey(false); setAiMessage('已清空当前页面密钥'); }}>清空密钥</button></div>
                <p className="connection-help">仅填写你信任的服务地址，密钥将直接发送给该服务；刷新后需重新输入。密钥不进入模板或备份。</p>
              </> : null}
            </fieldset>
          </details>
          <textarea aria-label="AI 调色描述" maxLength={500} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <div className="ai-options"><select aria-label="样片类型" disabled={aiBusy} value={previewType} onChange={(event) => { const type = event.target.value; setPreviewType(type); if (isSample) { setImageUrl(sampleImageUrl(type)); setFileName(`内置${event.target.options[event.target.selectedIndex].text}样片`); } }}><option value="portrait">人像</option><option value="landscape">风景</option><option value="food">美食</option><option value="indoor">室内</option></select><span>{prompt.length}/500</span></div>
          <button className="generate" disabled={aiBusy} onClick={() => void generateRecipe()}><Sparkles size={17} />{aiBusy ? '正在生成…' : '生成配方'}</button>
          {aiBusy ? <button className="ai-cancel" onClick={() => aiController.current?.abort()}>取消生成</button> : null}
          <p className="privacy-note">{aiMode === 'direct' ? '浏览器直连你配置的 AI 服务，无需部署后端；照片始终留在本机' : '只发送文字描述，照片始终留在本机'}</p>
          {aiMessage ? <p className="ai-result" role="status">{aiMessage}</p> : null}
        </section>
        <AdjustmentPanel recipe={recipe} dirty={dirty} onFieldChange={updateField} onRecipeChange={pushRecipe} />
        <CropTools sourceSize={imageSize} crop={crop} draft={cropDraft} aspect={cropAspect} editing={cropEditing}
          onDraftChange={setCropDraft} onAspectChange={setCropAspect}
          onEdit={() => { setCropDraft(crop); setCropEditing(true); }}
          onApply={() => { setCrop(normalizeCrop(cropDraft)); setCropEditing(false); setMobileTool('none'); setNotice('裁剪已应用到预览和导出'); }}
          onCancel={() => { setCropDraft(crop); setCropEditing(false); setMobileTool('none'); setNotice('已取消本次裁剪'); }}
          onReset={() => { setCrop(fullCrop); setCropDraft(fullCrop); setCropAspect(null); setMobileTool('none'); setNotice('已还原完整照片'); }} />
        <section className="export-settings">
          <div className="section-title"><Download size={17} /><h2>导出设置</h2></div>
          <div className="export-grid"><label>格式<select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}><option value="jpeg">JPG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label><label>质量<select value={quality} onChange={(event) => setQuality(Number(event.target.value))}><option value="70">标准 70%</option><option value="90">高 90%</option><option value="100">最高 100%</option></select></label></div>
          <label className="edge-field">最长边<input type="number" min="0" value={maxEdge} onChange={(event) => setMaxEdge(Math.max(0, Number(event.target.value)))} /><span>0 = 原尺寸</span></label>
          <div className="export-estimate" aria-live="polite">{outputSize && estimatedBytes ? `预计 ${outputSize.width}×${outputSize.height} · 约 ${(estimatedBytes / 1024 / 1024).toFixed(1)} MB` : '正在读取图片尺寸…'}</div>
          <p>导出时自动移除 GPS 与原始元数据</p>
        </section>
      </aside>
    </div>
    <footer className="statusbar" aria-live="polite"><span className="status-dot" />{notice}<span className="status-spacer" /><button onClick={clearData}><Settings2 size={13} />清除本地数据</button></footer>
    <nav className="mobile-tools" role="tablist" aria-label="手机编辑工具">
      {([
        ['filter', '滤镜', WandSparkles], ['template', '模板', LayoutTemplate],
        ['adjust', '调色', SlidersHorizontal], ['crop', '裁剪', Crop],
        ['ai', 'AI', Sparkles], ['export', '导出', Download],
      ] as const).map(([tool, label, Icon]) => <button key={tool} type="button" role="tab"
        aria-selected={mobileTool === tool} onClick={() => selectMobileTool(tool)}><Icon size={20} /><span>{label}</span></button>)}
    </nav>
    {saveDialog ? <div className="modal-backdrop" role="presentation"><form className="modal preset-save-dialog" role="dialog" aria-modal="true" aria-labelledby="preset-save-title" onSubmit={(event) => { event.preventDefault(); void persistCurrent(saveDialog.name); }}>
      <header><h2 id="preset-save-title">{saveDialog.mode === 'create' ? '新建模板' : '另存为新模板'}</h2><button type="button" aria-label="关闭模板保存窗口" onClick={() => { setSaveDialog(null); setNotice('已取消保存，当前调整已保留'); }}><X size={18} /></button></header>
      <p>将当前已调整的全部参数保存为可复用模板。</p>
      <label htmlFor="preset-name">模板名称</label><input id="preset-name" autoFocus disabled={saving} maxLength={40} value={saveDialog.name} onChange={(event) => setSaveDialog((current) => current ? { ...current, name: event.target.value } : null)} />
      <div className="preset-save-actions"><button type="button" onClick={() => { setSaveDialog(null); setNotice('已取消保存，当前调整已保留'); }}>取消</button><button type="submit" disabled={saving || !saveDialog.name.trim()}>{saving ? '保存中…' : '保存新模板'}</button></div>
    </form></div> : null}
    {recycleOpen ? <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="recycle-title"><header><h2 id="recycle-title">模板回收站</h2><button aria-label="关闭回收站" onClick={() => setRecycleOpen(false)}><X size={18} /></button></header>{recycled.length ? recycled.map((preset) => <div className="recycle-row" key={preset.id}><span>{preset.name}</span><span className="recycle-actions"><button onClick={() => void restore(preset)}><ArchiveRestore size={15} />恢复</button><button className="danger" onClick={() => void permanentlyDelete(preset)}><Trash2 size={15} />永久删除</button></span></div>) : <p className="empty-list">回收站为空</p>}</section></div> : null}
  </main>;
}
