import { Check, RotateCcw, X } from 'lucide-react';
import { cropSourceRect, fitCropToAspect, type CropRect } from '../lib/crop';

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

  return <section className="crop-tools" aria-label="裁剪工具">
    <div className="crop-fields">
    <div className="section-title"><h2>裁剪照片</h2><span className="crop-dimensions">{currentPixels ? `${currentPixels.width} × ${currentPixels.height}` : '正在读取尺寸…'}</span></div>
    {editing ? <>
      <p className="crop-help">拖动框的四角或边缘调整大小，拖动框内移动位置。选择“自由”可独立调整宽高。</p>
      <div className="crop-aspects" aria-label="裁剪比例">
        {aspectOptions.map((option) => <button key={option.label} type="button" aria-pressed={aspect === option.value}
          onClick={() => {
            onAspectChange(option.value);
            if (option.value) onDraftChange(fitCropToAspect(sourceWidth, sourceHeight, option.value));
          }}>{option.label}</button>)}
      </div>
    </> : null}
    </div>
    {editing ?
      <div className="crop-actions"><button type="button" onClick={onReset}><RotateCcw size={16} />还原全图</button><button type="button" onClick={onCancel}><X size={16} />取消</button><button type="button" className="primary" onClick={onApply}><Check size={16} />应用裁剪</button></div>
      : <div className="crop-actions"><button type="button" onClick={onReset}><RotateCcw size={16} />还原全图</button><button type="button" className="primary" onClick={onEdit}>重新裁剪</button></div>}
  </section>;
}
