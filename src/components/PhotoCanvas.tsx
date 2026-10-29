import { useEffect, useRef, useState } from 'react';
import { Columns2, ImageUp } from 'lucide-react';
import type { AdjustmentRecipe } from '../domain/recipe';
import { applyRecipeToPixels, assertSafePixelCount, calculateOutputSize } from '../lib/imageMath';
import { cropSourceRect, fullCrop, type CropRect } from '../lib/crop';
import CropOverlay from './CropOverlay';
import { defaultComposition, straightenScale, transformedSize, type Composition, type FilterState } from '../domain/editorDocument';
import { borderLayout, type AssetUrls, type CreativeState, type ImageGeometry, type LocalAdjustment } from '../domain/creative';
import { addBorder, applyLocalAdjustments,applyPortraitAdjustments, drawCreativeLayers } from '../lib/creativeRender';
import type {PortraitRegion} from '../domain/portrait';
import EditorSurface,{type PreviewFrame} from './EditorSurface';

type Props = { imageUrl: string; recipe: AdjustmentRecipe; fileName: string; crop?: CropRect;
  cropEditing?: boolean; cropDraft?: CropRect; cropAspect?: number | null; onCropDraftChange?: (crop: CropRect) => void;
  composition?: Composition; filter?: FilterState | null;
  creative?:CreativeState;assets?:AssetUrls;
  editorOverlay?:React.ReactNode;interactionActive?:boolean;
  onImageInfo?: (size: { width: number; height: number }) => void };

async function loadImage(url: string) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return image;
}

async function processPixels(pixels: Uint8ClampedArray, recipe: AdjustmentRecipe, width: number, height: number,locals?:LocalAdjustment[],geometry?:ImageGeometry,portraits?:PortraitRegion[]) {
  if (typeof Worker === 'undefined'||(locals||portraits)&&typeof OffscreenCanvas==='undefined') return portraits&&geometry?applyPortraitAdjustments(pixels,width,height,portraits,geometry):locals&&geometry?applyLocalAdjustments(pixels,width,height,locals,geometry):applyRecipeToPixels(pixels, recipe, width, height);
  const worker = new Worker(new URL('../workers/imageWorker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<Uint8ClampedArray>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ pixels: ArrayBuffer }>) => resolve(new Uint8ClampedArray(event.data.pixels));
      worker.onerror = (event) => reject(new Error(event.message || '后台图像处理失败'));
      worker.postMessage({ pixels: pixels.buffer, recipe, width, height,locals,geometry,portraits }, [pixels.buffer]);
    });
  } finally { worker.terminate(); }
}

export async function renderSourceImage(url: string, crop: CropRect = fullCrop, maxEdge = 1600, composition: Composition = defaultComposition) {
  const image = await loadImage(url);
  const size = transformedSize(image.naturalWidth,image.naturalHeight,composition);
  const source = cropSourceRect(size.width, size.height, crop);
  const { width, height } = calculateOutputSize(source.width, source.height, maxEdge);
  assertSafePixelCount(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法创建图像画布');
  const scaleX=width/source.width,scaleY=height/source.height;
  context.scale(scaleX,scaleY);
  context.translate(-source.x,-source.y);
  context.translate(size.width/2,size.height/2);
  context.rotate(composition.straighten*Math.PI/180);
  const zoom=straightenScale(size.width,size.height,composition.straighten);
  context.scale(zoom*(composition.flipX?-1:1),zoom*(composition.flipY?-1:1));
  context.rotate(composition.rotation*Math.PI/2);
  context.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);
  context.resetTransform();
  return { canvas, sourceSize: size, originalSize: {width:image.naturalWidth,height:image.naturalHeight} };
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

export async function finishCreative(canvas:HTMLCanvasElement,creative:CreativeState|undefined,assets:AssetUrls,geometry:ImageGeometry,maxEdge=0){
 if(creative?.locals?.length){const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法读取局部调整画布');const frame=ctx.getImageData(0,0,canvas.width,canvas.height);const result=await processPixels(frame.data,{} as AdjustmentRecipe,canvas.width,canvas.height,creative.locals,geometry);ctx.putImageData(new ImageData(result,canvas.width,canvas.height),0,0);}
 if(creative?.portraits?.some(region=>region.enabled&&Object.values(region.recipe).some(Boolean))){const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法读取人像画布');const frame=ctx.getImageData(0,0,canvas.width,canvas.height);const result=await processPixels(frame.data,{} as AdjustmentRecipe,canvas.width,canvas.height,undefined,geometry,creative.portraits);ctx.putImageData(new ImageData(result,canvas.width,canvas.height),0,0);}
 if(creative?.layers?.length)await drawCreativeLayers(canvas,creative.layers,assets);
 const bordered=addBorder(canvas,creative?.border),size=calculateOutputSize(bordered.width,bordered.height,maxEdge);
 if(size.width===bordered.width&&size.height===bordered.height)return bordered;
 const output=document.createElement('canvas');output.width=size.width;output.height=size.height;output.getContext('2d')!.drawImage(bordered,0,0,output.width,output.height);return output;
}
export async function renderAdjustedImage(url: string, recipe: AdjustmentRecipe, maxEdge = 1600, crop: CropRect = fullCrop, composition: Composition = defaultComposition, filter?: FilterState | null,creative?:CreativeState,assets:AssetUrls={}) {
  const { canvas,originalSize } = await renderSourceImage(url, crop, maxEdge,composition);
  if(filter) await adjustCanvas(canvas,{...filter.recipe,strength:filter.recipe.strength*filter.strength/100});
  await adjustCanvas(canvas, recipe);return finishCreative(canvas,creative,assets,{sourceWidth:originalSize.width,sourceHeight:originalSize.height,composition:{...composition,crop}},maxEdge);
}

export async function exportAdjustedImage(url: string, recipe: AdjustmentRecipe, options: { format: string; quality: number; maxEdge: number; name: string; crop?: CropRect; composition?: Composition; filter?: FilterState | null;creative?:CreativeState;assets?:AssetUrls }) {
  const canvas = await renderAdjustedImage(url, recipe, options.maxEdge, options.crop,options.composition,options.filter,options.creative,options.assets);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('导出失败')), `image/${options.format}`, options.quality));
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = href; link.download = `${options.name || 'lightune'}-光调.${options.format === 'jpeg' ? 'jpg' : options.format}`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  return { bytes: blob.size, width: canvas.width, height: canvas.height };
}

export async function createPresetThumbnail(url: string, recipe: AdjustmentRecipe, crop: CropRect = fullCrop, composition?: Composition, filter?: FilterState|null,creative?:CreativeState,assets?:AssetUrls) {
  const canvas = await renderAdjustedImage(url, recipe, 240, crop,composition,filter,creative,assets);
  return canvas.toDataURL('image/jpeg', 0.74);
}

export default function PhotoCanvas({ imageUrl, recipe, fileName, crop = fullCrop, cropEditing = false,
  cropDraft = fullCrop, cropAspect, onCropDraftChange, onImageInfo,composition=defaultComposition,filter,creative,assets,editorOverlay,interactionActive=false }: Props) {
  const interactionBlocked=cropEditing||interactionActive;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);
  const [split, setSplit] = useState(50);
  const [busy, setBusy] = useState(true);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number }>();
  const [error, setError] = useState('');
  const [holdingOriginal, setHoldingOriginal] = useState(false);
  const [cropImage,setCropImage]=useState('');
  const [previewFrame,setPreviewFrame]=useState<PreviewFrame>({width:0,height:0,content:{x:0,y:0,width:1,height:1}});
  const [view,setView]=useState({zoom:1,x:0,y:0});
  const viewRef=useRef(view);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const pinch=useRef<{distance:number;zoom:number;centerX:number;centerY:number;x:number;y:number}|null>(null);
  const pan=useRef<{id:number;x:number;y:number;startX:number;startY:number}|null>(null);
  const setViewing=(next:typeof view)=>{viewRef.current=next;setView(next);};
  const resetView=()=>{pointers.current.clear();pinch.current=null;pan.current=null;activePointer.current=null;setViewing({zoom:1,x:0,y:0});};
  useEffect(resetView,[imageUrl,interactionBlocked,composition.rotation]);

  useEffect(() => {
    let active = true;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const { canvas: rendered, sourceSize: dimensions, originalSize } = await renderSourceImage(imageUrl, cropEditing?fullCrop:crop, 1400,composition);
        if (!active || !canvasRef.current || !originalCanvasRef.current) return;
        setSourceSize(dimensions);
        onImageInfo?.(originalSize);
        if(cropEditing) setCropImage(rendered.toDataURL('image/png'));
        const original = originalCanvasRef.current;
        original.width = rendered.width; original.height = rendered.height;
        original.getContext('2d')?.drawImage(rendered, 0, 0);
        if(filter) await adjustCanvas(rendered,{...filter.recipe,strength:filter.recipe.strength*filter.strength/100});
        await adjustCanvas(rendered, recipe);
        if (!active || !canvasRef.current) return;
        const layout=borderLayout(rendered.width,rendered.height,cropEditing?undefined:creative?.border);
        const finished=cropEditing?rendered:await finishCreative(rendered,creative,assets||{},{sourceWidth:originalSize.width,sourceHeight:originalSize.height,composition:{...composition,crop}},1400);
        if(!active||!canvasRef.current)return;
        const canvas = canvasRef.current;
        canvas.width = finished.width; canvas.height = finished.height;
        canvas.getContext('2d')?.drawImage(finished, 0, 0);
        setPreviewFrame({width:finished.width,height:finished.height,content:{x:layout.x/layout.width,y:layout.y/layout.height,width:layout.contentWidth/layout.width,height:layout.contentHeight/layout.height}});
        if(!cropEditing&&creative?.border?.enabled){const originalBordered=addBorder(original,creative.border),size=calculateOutputSize(originalBordered.width,originalBordered.height,1400);original.width=size.width;original.height=size.height;original.getContext('2d')?.drawImage(originalBordered,0,0,size.width,size.height);}
        setError('');
      } catch (error) { if (active) setError(error instanceof Error ? error.message : '无法处理这张图片，请换一张重试'); }
      finally { if (active) setBusy(false); }
    }, 90);
    return () => { active = false; window.clearTimeout(timer); };
  }, [imageUrl, recipe, crop, onImageInfo,composition.rotation,composition.flipX,composition.flipY,composition.straighten,filter,cropEditing,creative?.layers,creative?.locals,creative?.portraits,creative?.border,assets]);

  const setSplitFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (interactionBlocked) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width > 0) setSplit(Math.round(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100))));
  };

  return <section className="stage" aria-label="照片编辑画布">
    <div className="canvas-shell" style={{'--view-transform':interactionBlocked?'none':`translate(${view.x}px,${view.y}px) scale(${view.zoom})`} as React.CSSProperties} onDoubleClick={()=>{if(!interactionBlocked)resetView();}} title={interactionBlocked ? '在图片上编辑当前工具' : view.zoom>1?'拖动查看，双击适应画布':'点击或拖动以调整前后对比位置'}
      onPointerDown={(event) => {
        if (interactionBlocked || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(viewRef.current.zoom>1){pan.current={id:event.pointerId,x:event.clientX,y:event.clientY,startX:viewRef.current.x,startY:viewRef.current.y};event.currentTarget.setPointerCapture(event.pointerId);return;}
        activePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setSplitFromPointer(event);
      }}
      onPointerDownCapture={event=>{
        if(interactionBlocked||event.pointerType!=='touch')return;
        pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:viewRef.current.zoom,centerX:(a.x+b.x)/2,centerY:(a.y+b.y)/2,x:viewRef.current.x,y:viewRef.current.y};activePointer.current=null;pan.current=null;event.currentTarget.setPointerCapture(event.pointerId);}
      }}
      onPointerMove={(event) => {
        if(interactionBlocked)return;
        if(pointers.current.has(event.pointerId))pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(pinch.current&&pointers.current.size>=2){const [a,b]=[...pointers.current.values()],start=pinch.current;const zoom=Math.max(1,Math.min(4,start.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,start.distance)));setViewing({zoom,x:zoom===1?0:start.x+(a.x+b.x)/2-start.centerX,y:zoom===1?0:start.y+(a.y+b.y)/2-start.centerY});return;}
        if(pan.current?.id===event.pointerId){setViewing({...viewRef.current,x:pan.current.startX+event.clientX-pan.current.x,y:pan.current.startY+event.clientY-pan.current.y});return;}
        if(activePointer.current===event.pointerId&&!pinch.current)setSplitFromPointer(event);
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId);pan.current=null;
        if(pinch.current){if(!pointers.current.size)pinch.current=null;return;}
        if (activePointer.current !== event.pointerId) return;
        setSplitFromPointer(event);
        activePointer.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        pointers.current.delete(event.pointerId);pan.current=null;pinch.current=null;
        if (activePointer.current !== event.pointerId) return;
        activePointer.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}>
      <canvas ref={canvasRef} aria-label="效果图预览" />
      <div className="original-layer" style={{ clipPath: `inset(0 ${interactionBlocked ? 100 : holdingOriginal ? 0 : 100 - split}% 0 0)` }}>
        <canvas ref={originalCanvasRef} aria-label={`${fileName} 原图`} />
      </div>
      {!holdingOriginal && !interactionBlocked ? <div className="split-line" style={{ left: `${split}%` }}><Columns2 size={15} /></div> : null}
      <span className="image-label original-label">原图</span><span className="image-label effect-label">效果图</span>
      {busy ? <div className="processing">正在渲染预览…</div> : null}
      {error ? <div className="processing error">{error}</div> : null}
      {cropEditing && cropImage && onCropDraftChange ? <CropOverlay imageUrl={cropImage} sourceSize={sourceSize} crop={cropDraft} aspect={cropAspect} onChange={onCropDraftChange} /> : null}
      {interactionActive&&!cropEditing?<EditorSurface frame={previewFrame}>{editorOverlay}</EditorSurface>:null}
    </div>
    <div className="stage-footer">
      <div className="file-chip"><ImageUp size={14} /><span>{fileName}</span></div>
      <div className="view-controls"><button aria-label="缩小查看" disabled={interactionBlocked||view.zoom<=1} onClick={()=>{const zoom=Math.max(1,view.zoom-0.5);setViewing({zoom,x:zoom===1?0:view.x,y:zoom===1?0:view.y});}}>−</button><button aria-label="适应画布" disabled={interactionBlocked} onClick={resetView}>{Math.round(view.zoom*100)}%</button><button aria-label="放大查看" disabled={interactionBlocked||view.zoom>=4} onClick={()=>setViewing({...view,zoom:Math.min(4,view.zoom+0.5)})}>＋</button></div>
      <button
        className="hold-original"
        aria-label="按住查看原图"
        aria-pressed={holdingOriginal}
        disabled={interactionBlocked}
        onPointerDown={() => setHoldingOriginal(true)}
        onPointerUp={() => setHoldingOriginal(false)}
        onPointerCancel={() => setHoldingOriginal(false)}
        onPointerLeave={() => setHoldingOriginal(false)}
        onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') setHoldingOriginal(true); }}
        onKeyUp={() => setHoldingOriginal(false)}
      >{holdingOriginal ? '松开返回效果' : '按住看原图'}</button>
      <label className="compare-range">前后对比 <input aria-label="前后对比位置" disabled={interactionBlocked} type="range" min="0" max="100" value={split} onChange={(e) => { if (!interactionBlocked) setSplit(Number(e.target.value)); }} /></label>
    </div>
  </section>;
}
