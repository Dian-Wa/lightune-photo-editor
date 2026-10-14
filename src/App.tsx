import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore, Copy, Download, FileDown, FileUp, Heart, ImagePlus,
  Pencil, RotateCcw, RotateCw, Save, Search, Settings2, Sparkles,
  Trash2, Undo2, Upload, X,
} from 'lucide-react';
import PhotoCanvas, { createPresetThumbnail, exportAdjustedImage } from './components/PhotoCanvas';
import AdjustmentPanel from './components/AdjustmentPanel';
import { builtinPresets, cloneUserPreset, renameUserPreset, resolvePresetDefaultName } from './domain/presets';
import { emptyRecipe, normalizeRecipe, type AdjustmentRecipe, type Preset, type RecipeKey } from './domain/recipe';
import { clearPresetStore, deletePreset, loadSession, loadUserPresets, parsePresetBackup, savePreset, savePresetBatch, saveSession } from './lib/presetStore';
import { calculateOutputSize, estimateEncodedBytes } from './lib/imageMath';
import { aiAvailable, presetPreviewUrl, recipeApiUrl, sampleImageUrl } from './lib/deployment';

const sampleNames: Record<Preset['previewType'], string> = { portrait: '内置旅行人像样片', landscape: '内置风景样片', food: '内置美食样片', indoor: '内置室内样片' };
type Tab = 'builtin' | 'mine' | 'favorite';
type ExportFormat = 'jpeg' | 'png' | 'webp';

const downloadJson = (value: unknown, name: string) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

function Topbar({ canUndo, canRedo, exporting, onUndo, onRedo, onReset, onImport, onSave, onExport }: {
  canUndo: boolean; canRedo: boolean; exporting: boolean; onUndo: () => void; onRedo: () => void; onReset: () => void; onImport: () => void; onSave: () => void; onExport: () => void;
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
      <button onClick={onSave}><Save size={17} />保存为模板</button>
    </nav>
    <button className="export-top" disabled={exporting} onClick={onExport}><Upload size={18} />{exporting ? '导出中' : '导出'}</button>
  </header>;
}

export default function App() {
  const aiEnabled = aiAvailable();
  const [tab, setTab] = useState<Tab>('builtin');
  const [query, setQuery] = useState('');
  const [userPresets, setUserPresets] = useState<Preset[]>([]);
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
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>();
  const photoInput = useRef<HTMLInputElement>(null);
  const presetInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void Promise.all([loadUserPresets(), loadSession()]).then(([presets, session]) => {
      setUserPresets(presets);
      if (session) { setHistory([session.recipe]); setCursor(0); setSelectedId(session.selectedId); setPrompt(session.prompt); setPreviewType(session.previewType); setRecipeSource(session.recipeSource || 'manual'); setAiDraft(session.aiDraft); setImageUrl(sampleImageUrl(session.previewType)); setFileName(sampleNames[session.previewType]); }
    }).catch(() => setNotice('本地数据读取失败'));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void saveSession({ recipe, selectedId, prompt, previewType: previewType as Preset['previewType'], recipeSource, aiDraft }); }, 250);
    return () => window.clearTimeout(timer);
  }, [recipe, selectedId, prompt, previewType, recipeSource, aiDraft]);
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
  const outputSize = imageSize ? calculateOutputSize(imageSize.width, imageSize.height, maxEdge) : undefined;
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
    const next = URL.createObjectURL(file); setImageUrl(next); setIsSample(false); setFileName(file.name.replace(/\.[^.]+$/, '')); setNotice('照片已载入，原图不会上传');
  };
  const saveCurrent = async (source: 'manual' | 'ai' = 'manual', suggested?: { name: string; description: string }) => {
    const existing = userPresets.find((preset) => preset.id === selectedId && !preset.deletedAt);
    const name = window.prompt('模板名称（最多 40 个字符）', resolvePresetDefaultName(existing, suggested))?.trim(); if (!name) return;
    if (name.length > 40) return setNotice('模板名称不能超过 40 个字符');
    const id = existing && window.confirm('覆盖当前模板？选择“取消”将另存为新模板。') ? existing.id : crypto.randomUUID();
    const timestamp = new Date().toISOString();
    let previewDataUrl = existing?.previewDataUrl;
    try { previewDataUrl = await createPresetThumbnail(imageUrl, recipe); } catch { /* 模板仍可保存，预览回退到样片 */ }
    const preset: Preset = { id, name, source, prompt: source === 'ai' ? prompt : undefined, description: suggested?.description || '自定义调色模板', tags: source === 'ai' ? ['AI 配方'] : ['自定义'], favorite: existing?.favorite || false, recipe, previewDataUrl, previewType: previewType as Preset['previewType'], createdAt: existing?.createdAt || timestamp, updatedAt: timestamp };
    await savePreset(preset);
    // Explicitly saving a template must persist the same recipe before an immediate reload.
    await saveSession({ recipe, selectedId: id, prompt, previewType: previewType as Preset['previewType'],
      recipeSource: source, aiDraft: source === 'ai' ? { name, description: preset.description || 'AI 调色模板' } : undefined });
    setUserPresets((items) => [...items.filter((item) => item.id !== id), preset]); setSelectedId(id); setDirty(false); setTab('mine');
    if (source === 'ai') setAiDraft({ name, description: preset.description || 'AI 调色模板' });
    setNotice(`已保存「${name}」`);
  };
  const generateRecipe = async () => {
    if (!aiEnabled) return setNotice('GitHub Pages 提供本地修图；AI 配方需要另行连接后端');
    if (prompt.trim().length < 2) return setNotice('请至少输入 2 个字的调色描述');
    setAiBusy(true); setNotice('AI 正在理解你的调色意图…');
    try {
      const response = await fetch(recipeApiUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt.trim(), previewType }) });
      const body = await response.json() as { name?: string; description?: string; recipe?: unknown; error?: string };
      if (!response.ok) throw new Error(body.error || 'AI 请求失败');
      pushRecipe(normalizeRecipe(body.recipe)); setRecipeSource('ai'); setAiDraft({ name: body.name || 'AI 调色模板', description: body.description || 'AI 生成的调色配方' }); setNotice(`已生成「${body.name}」，可继续微调后保存`);
    } catch (error) { setNotice(`${error instanceof Error ? error.message : 'AI 请求失败'}；手动调色仍可使用`); }
    finally { setAiBusy(false); }
  };
  const toggleFavorite = async (preset: Preset) => {
    if (preset.source === 'builtin') return setNotice('内置模板只读，可另存后收藏');
    const next = { ...preset, favorite: !preset.favorite, updatedAt: new Date().toISOString() }; await savePreset(next); setUserPresets((items) => items.map((item) => item.id === next.id ? next : item));
  };
  const recycle = async (preset: Preset) => { const next = { ...preset, deletedAt: new Date().toISOString() }; await savePreset(next); setUserPresets((items) => items.map((item) => item.id === next.id ? next : item)); setNotice('模板已移入回收站'); };
  const restore = async (preset: Preset) => { const { deletedAt: _deleted, ...next } = preset; await savePreset(next); setUserPresets((items) => items.map((item) => item.id === next.id ? next : item)); };
  const duplicate = async (preset: Preset) => {
    const copy = cloneUserPreset(preset, crypto.randomUUID(), new Date().toISOString());
    await savePreset(copy); setUserPresets((items) => [...items, copy]); setTab('mine'); setNotice(`已复制为「${copy.name}」`);
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
    try { const result = await exportAdjustedImage(imageUrl, recipe, { format, quality: quality / 100, maxEdge, name: fileName }); setNotice(`导出完成 · ${result.width}×${result.height} · ${(result.bytes / 1024 / 1024).toFixed(1)}MB`); }
    catch (error) { setNotice(error instanceof Error ? error.message : '导出失败'); }
    finally { setExporting(false); }
  };
  const importPresets = async (file?: File) => {
    if (!file) return;
    try { const parsed = parsePresetBackup(await file.text()); await savePresetBatch(parsed); setUserPresets((items) => [...items.filter((item) => !parsed.some((incoming) => incoming.id === item.id)), ...parsed]); setNotice(`已导入 ${parsed.length} 个模板`); }
    catch (error) { setNotice(error instanceof Error ? error.message : '导入失败'); }
  };
  const clearData = async () => { if (!window.confirm('确认清除全部自定义模板？此操作不可撤销。')) return; await clearPresetStore(); setUserPresets([]); setNotice('本地自定义模板已清除'); };

  return <main className="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); importPhoto(event.dataTransfer.files[0]); }}>
    <Topbar canUndo={cursor > 0} canRedo={cursor < history.length - 1} exporting={exporting} onUndo={() => setCursor((value) => Math.max(0, value - 1))} onRedo={() => setCursor((value) => Math.min(history.length - 1, value + 1))} onReset={() => { setRecipeSource('manual'); setAiDraft(undefined); pushRecipe(emptyRecipe); }} onImport={() => photoInput.current?.click()} onSave={() => void saveCurrent(recipeSource, aiDraft)} onExport={() => void exportImage()} />
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
              <span className={`preset-thumb tone-${index % 6}`}>{preset.previewDataUrl ? <img src={presetPreviewUrl(preset.previewDataUrl)} alt="" /> : null}</span><span><strong>{preset.name}</strong><small>{preset.description}</small></span>
            </button>
            <span className="preset-actions">
              <button aria-label={`复制 ${preset.name}`} title="复制模板" onClick={() => void duplicate(preset)}><Copy size={15} /></button>
              {preset.source !== 'builtin' ? <button aria-label={`重命名 ${preset.name}`} title="重命名模板" onClick={() => void rename(preset)}><Pencil size={15} /></button> : null}
              {preset.source !== 'builtin' ? <button aria-label={`${preset.favorite ? '取消收藏' : '收藏'} ${preset.name}`} title="收藏模板" onClick={() => void toggleFavorite(preset)}><Heart className={preset.favorite ? 'filled' : ''} size={15} /></button> : null}
              {preset.source !== 'builtin' ? <button aria-label={`删除 ${preset.name}`} title="移入回收站" onClick={() => void recycle(preset)}><Trash2 size={15} /></button> : null}
            </span>
          </article>)}
          {activePresets.length === 0 ? <div className="empty-list">这里还没有模板</div> : null}
        </div>
        <div className="library-tools">
          <button onClick={() => presetInput.current?.click()}><FileUp size={15} />导入模板</button>
          <button onClick={() => downloadJson(userPresets.filter((item) => !item.deletedAt), '光调模板备份.json')}><FileDown size={15} />备份</button>
          <button onClick={() => setRecycleOpen(true)}><Trash2 size={15} />回收站 {recycled.length || ''}</button>
        </div>
      </aside>
      <PhotoCanvas imageUrl={imageUrl} recipe={recipe} fileName={fileName} onImageInfo={setImageSize} />
      <aside className="inspector">
        <section className="ai-panel">
          <div className="section-title"><Sparkles size={18} /><h2>AI 调色灵感</h2></div>
          <textarea aria-label="AI 调色描述" maxLength={500} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <div className="ai-options"><select aria-label="样片类型" value={previewType} onChange={(event) => { const type = event.target.value; setPreviewType(type); if (isSample) { setImageUrl(sampleImageUrl(type)); setFileName(`内置${event.target.options[event.target.selectedIndex].text}样片`); } }}><option value="portrait">人像</option><option value="landscape">风景</option><option value="food">美食</option><option value="indoor">室内</option></select><span>{prompt.length}/500</span></div>
          <button className="generate" disabled={aiBusy || !aiEnabled} onClick={() => void generateRecipe()}><Sparkles size={17} />{!aiEnabled ? 'AI 需连接后端' : aiBusy ? '正在生成…' : '生成配方'}</button>
          <p className="privacy-note">{aiEnabled ? '只发送文字描述，照片始终留在本机' : 'GitHub Pages 提供本地修图；AI 配方需另行连接后端，照片始终留在本机'}</p>
        </section>
        <AdjustmentPanel recipe={recipe} dirty={dirty} onFieldChange={updateField} onRecipeChange={pushRecipe} />
        <section className="export-settings">
          <div className="section-title"><Download size={17} /><h2>导出设置</h2></div>
          <div className="export-grid"><label>格式<select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}><option value="jpeg">JPG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label><label>质量<select value={quality} onChange={(event) => setQuality(Number(event.target.value))}><option value="70">标准 70%</option><option value="90">高 90%</option><option value="100">最高 100%</option></select></label></div>
          <label className="edge-field">最长边<input type="number" min="0" value={maxEdge} onChange={(event) => setMaxEdge(Math.max(0, Number(event.target.value)))} /><span>0 = 原尺寸</span></label>
          <div className="export-estimate" aria-live="polite">{outputSize && estimatedBytes ? `预计 ${outputSize.width}×${outputSize.height} · 约 ${(estimatedBytes / 1024 / 1024).toFixed(1)} MB` : '正在读取图片尺寸…'}</div>
          <p>导出时自动移除 GPS 与原始元数据</p>
        </section>
      </aside>
    </div>
    <footer className="statusbar"><span className="status-dot" />{notice}<span className="status-spacer" /><button onClick={clearData}><Settings2 size={13} />清除本地数据</button></footer>
    {recycleOpen ? <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="recycle-title"><header><h2 id="recycle-title">模板回收站</h2><button aria-label="关闭回收站" onClick={() => setRecycleOpen(false)}><X size={18} /></button></header>{recycled.length ? recycled.map((preset) => <div className="recycle-row" key={preset.id}><span>{preset.name}</span><span className="recycle-actions"><button onClick={() => void restore(preset)}><ArchiveRestore size={15} />恢复</button><button className="danger" onClick={() => void permanentlyDelete(preset)}><Trash2 size={15} />永久删除</button></span></div>) : <p className="empty-list">回收站为空</p>}</section></div> : null}
  </main>;
}
