import { Check, RotateCcw, X } from 'lucide-react';
import { cropSourceRect, fitCropToAspect, normalizeCrop, type CropRect } from '../lib/crop';

type Props = {
  sourceSize?: { width: number; height: number };
  crop: CropRect;
  draft: CropRect;
  aspect: number | null;
  editing: boolean;
  onDraftChange: (crop: CropRect) => void;
  onAspectChange: (aspect: number | null) => void;
  onEdit: () => void;
  onApply: () => void;
  onCancel: () => void;
  onReset: () => void;
};

const aspectOptions = [
  { label: '自由', value: null }, { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 }, { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 }, { label: '9:16', value: 9 / 16 },
];

export default function CropTools({ sourceSize, crop, draft, aspect, editing, onDraftChange,
  onAspectChange, onEdit, onApply, onCancel, onReset }: Props) {
  const sourceWidth = sourceSize?.width || 1;
  const sourceHeight = sourceSize?.height || 1;
  const currentPixels = sourceSize ? cropSourceRect(sourceWidth, sourceHeight, editing ? draft : crop) : null;
  const maxFit = aspect ? fitCropToAspect(sourceWidth, sourceHeight, aspect) : null;
  const sizePercent = maxFit ? Math.round(draft.width / maxFit.width * 100) : 100;
  const xPercent = draft.width < 1 ? Math.round(draft.x / (1 - draft.width) * 100) : 0;
  const yPercent = draft.height < 1 ? Math.round(draft.y / (1 - draft.height) * 100) : 0;
  const changeSize = (width: number, height: number) => onDraftChange(normalizeCrop({
    x: draft.x + (draft.width - width) / 2,
    y: draft.y + (draft.height - height) / 2,
    width, height,
  }));

  return <section className="crop-tools" aria-label="裁剪工具">
    <div className="crop-fields">
    <div className="section-title"><h2>裁剪照片</h2><span className="crop-dimensions">{currentPixels ? `${currentPixels.width} × ${currentPixels.height}` : '正在读取尺寸…'}</span></div>
    {editing ? <>
      <p className="crop-help">拖动照片上的选框调整位置，点选其他位置可快速移动选框。</p>
      <div className="crop-aspects" aria-label="裁剪比例">
        {aspectOptions.map((option) => <button key={option.label} type="button" aria-pressed={aspect === option.value}
          onClick={() => {
            onAspectChange(option.value);
            if (option.value) onDraftChange(fitCropToAspect(sourceWidth, sourceHeight, option.value));
          }}>{option.label}</button>)}
      </div>
      {maxFit ? <label className="crop-slider">裁剪大小<input aria-label="裁剪大小" type="range" min="10" max="100" value={sizePercent}
        onChange={(event) => {
          const next = fitCropToAspect(sourceWidth, sourceHeight, aspect!, Number(event.target.value) / 100);
          changeSize(next.width, next.height);
        }} /><output>{sizePercent}%</output></label> : <>
        <label className="crop-slider">宽度<input aria-label="裁剪宽度" type="range" min="10" max="100" value={Math.round(draft.width * 100)}
          onChange={(event) => changeSize(Number(event.target.value) / 100, draft.height)} /><output>{Math.round(draft.width * 100)}%</output></label>
        <label className="crop-slider">高度<input aria-label="裁剪高度" type="range" min="10" max="100" value={Math.round(draft.height * 100)}
          onChange={(event) => changeSize(draft.width, Number(event.target.value) / 100)} /><output>{Math.round(draft.height * 100)}%</output></label>
      </>}
      <label className="crop-slider">左右<input aria-label="裁剪左右位置" type="range" min="0" max="100" disabled={draft.width >= 1} value={xPercent}
        onChange={(event) => onDraftChange({ ...draft, x: (1 - draft.width) * Number(event.target.value) / 100 })} /><output>{xPercent}%</output></label>
      <label className="crop-slider">上下<input aria-label="裁剪上下位置" type="range" min="0" max="100" disabled={draft.height >= 1} value={yPercent}
        onChange={(event) => onDraftChange({ ...draft, y: (1 - draft.height) * Number(event.target.value) / 100 })} /><output>{yPercent}%</output></label>
    </> : null}
    </div>
    {editing ?
      <div className="crop-actions"><button type="button" onClick={onReset}><RotateCcw size={16} />还原全图</button><button type="button" onClick={onCancel}><X size={16} />取消</button><button type="button" className="primary" onClick={onApply}><Check size={16} />应用裁剪</button></div>
      : <div className="crop-actions"><button type="button" onClick={onReset}><RotateCcw size={16} />还原全图</button><button type="button" className="primary" onClick={onEdit}>重新裁剪</button></div>}
  </section>;
}
