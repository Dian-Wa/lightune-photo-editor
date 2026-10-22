import { useEffect, useRef, useState } from 'react';
import { Columns2, ImageUp } from 'lucide-react';
import type { AdjustmentRecipe } from '../domain/recipe';
import { applyRecipeToPixels, assertSafePixelCount, calculateOutputSize } from '../lib/imageMath';
import { cropSourceRect, fullCrop, type CropRect } from '../lib/crop';
import CropOverlay from './CropOverlay';

type Props = { imageUrl: string; recipe: AdjustmentRecipe; fileName: string; crop?: CropRect;
  cropEditing?: boolean; cropDraft?: CropRect; onCropDraftChange?: (crop: CropRect) => void;
  onImageInfo?: (size: { width: number; height: number }) => void };

async function loadImage(url: string) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return image;
}

async function processPixels(pixels: Uint8ClampedArray, recipe: AdjustmentRecipe, width: number, height: number) {
  if (typeof Worker === 'undefined') return applyRecipeToPixels(pixels, recipe, width, height);
  const worker = new Worker(new URL('../workers/imageWorker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<Uint8ClampedArray>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ pixels: ArrayBuffer }>) => resolve(new Uint8ClampedArray(event.data.pixels));
      worker.onerror = (event) => reject(new Error(event.message || '后台图像处理失败'));
      worker.postMessage({ pixels: pixels.buffer, recipe, width, height }, [pixels.buffer]);
    });
  } finally { worker.terminate(); }
}

export async function renderSourceImage(url: string, crop: CropRect = fullCrop, maxEdge = 1600) {
  const image = await loadImage(url);
  const source = cropSourceRect(image.naturalWidth, image.naturalHeight, crop);
  const { width, height } = calculateOutputSize(source.width, source.height, maxEdge);
  assertSafePixelCount(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法创建图像画布');
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, width, height);
  return { canvas, sourceSize: { width: image.naturalWidth, height: image.naturalHeight } };
}

async function adjustCanvas(canvas: HTMLCanvasElement, recipe: AdjustmentRecipe) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法创建图像画布');
  const { width, height } = canvas;
  const frame = context.getImageData(0, 0, width, height);
  const processed = await processPixels(frame.data, recipe, width, height);
  context.putImageData(new ImageData(processed, width, height), 0, 0);
  return canvas;
}

export async function renderAdjustedImage(url: string, recipe: AdjustmentRecipe, maxEdge = 1600, crop: CropRect = fullCrop) {
  const { canvas } = await renderSourceImage(url, crop, maxEdge);
  return adjustCanvas(canvas, recipe);
}

export async function exportAdjustedImage(url: string, recipe: AdjustmentRecipe, options: { format: string; quality: number; maxEdge: number; name: string; crop?: CropRect }) {
  const canvas = await renderAdjustedImage(url, recipe, options.maxEdge, options.crop);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('导出失败')), `image/${options.format}`, options.quality));
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = href; link.download = `${options.name || 'lightune'}-光调.${options.format === 'jpeg' ? 'jpg' : options.format}`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  return { bytes: blob.size, width: canvas.width, height: canvas.height };
}

export async function createPresetThumbnail(url: string, recipe: AdjustmentRecipe, crop: CropRect = fullCrop) {
  const canvas = await renderAdjustedImage(url, recipe, 240, crop);
  return canvas.toDataURL('image/jpeg', 0.74);
}

export default function PhotoCanvas({ imageUrl, recipe, fileName, crop = fullCrop, cropEditing = false,
  cropDraft = fullCrop, onCropDraftChange, onImageInfo }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);
  const [split, setSplit] = useState(50);
  const [busy, setBusy] = useState(true);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number }>();
  const [error, setError] = useState('');
  const [holdingOriginal, setHoldingOriginal] = useState(false);

  useEffect(() => {
    let active = true;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const { canvas: rendered, sourceSize: dimensions } = await renderSourceImage(imageUrl, crop, 1400);
        if (!active || !canvasRef.current || !originalCanvasRef.current) return;
        setSourceSize(dimensions);
        onImageInfo?.(dimensions);
        const original = originalCanvasRef.current;
        original.width = rendered.width; original.height = rendered.height;
        original.getContext('2d')?.drawImage(rendered, 0, 0);
        await adjustCanvas(rendered, recipe);
        if (!active || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = rendered.width; canvas.height = rendered.height;
        canvas.getContext('2d')?.drawImage(rendered, 0, 0);
        setError('');
      } catch (error) { if (active) setError(error instanceof Error ? error.message : '无法处理这张图片，请换一张重试'); }
      finally { if (active) setBusy(false); }
    }, 90);
    return () => { active = false; window.clearTimeout(timer); };
  }, [imageUrl, recipe, crop, onImageInfo]);

  const setSplitFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width > 0) setSplit(Math.round(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100))));
  };

  return <section className="stage" aria-label="照片编辑画布">
    <div className="canvas-shell" title="点击或拖动以调整前后对比位置"
      onPointerDown={(event) => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        activePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setSplitFromPointer(event);
      }}
      onPointerMove={(event) => { if (activePointer.current === event.pointerId) setSplitFromPointer(event); }}
      onPointerUp={(event) => {
        if (activePointer.current !== event.pointerId) return;
        setSplitFromPointer(event);
        activePointer.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (activePointer.current !== event.pointerId) return;
        activePointer.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}>
      <canvas ref={canvasRef} aria-label="效果图预览" />
      <div className="original-layer" style={{ clipPath: `inset(0 ${holdingOriginal ? 0 : 100 - split}% 0 0)` }}>
        <canvas ref={originalCanvasRef} aria-label={`${fileName} 原图`} />
      </div>
      {!holdingOriginal ? <div className="split-line" style={{ left: `${split}%` }}><Columns2 size={15} /></div> : null}
      <span className="image-label original-label">原图</span><span className="image-label effect-label">效果图</span>
      {busy ? <div className="processing">正在渲染预览…</div> : null}
      {error ? <div className="processing error">{error}</div> : null}
      {cropEditing && onCropDraftChange ? <CropOverlay imageUrl={imageUrl} sourceSize={sourceSize} crop={cropDraft} onChange={onCropDraftChange} /> : null}
    </div>
    <div className="stage-footer">
      <div className="file-chip"><ImageUp size={14} /><span>{fileName}</span></div>
      <button
        className="hold-original"
        aria-label="按住查看原图"
        aria-pressed={holdingOriginal}
        onPointerDown={() => setHoldingOriginal(true)}
        onPointerUp={() => setHoldingOriginal(false)}
        onPointerCancel={() => setHoldingOriginal(false)}
        onPointerLeave={() => setHoldingOriginal(false)}
        onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') setHoldingOriginal(true); }}
        onKeyUp={() => setHoldingOriginal(false)}
      >{holdingOriginal ? '松开返回效果' : '按住看原图'}</button>
      <label className="compare-range">前后对比 <input aria-label="前后对比位置" type="range" min="0" max="100" value={split} onChange={(e) => setSplit(Number(e.target.value))} /></label>
    </div>
  </section>;
}
