import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { normalizeCrop, resizeCrop, type CropHandle, type CropRect } from '../lib/crop';

type Props = {
  imageUrl: string;
  sourceSize?: { width: number; height: number };
  crop: CropRect;
  aspect?: number | null;
  onChange: (crop: CropRect) => void;
};

const handles: { id: CropHandle; label: string }[] = [
  { id: 'nw', label: '左上角' }, { id: 'n', label: '上边' }, { id: 'ne', label: '右上角' },
  { id: 'e', label: '右边' }, { id: 'se', label: '右下角' }, { id: 's', label: '下边' },
  { id: 'sw', label: '左下角' }, { id: 'w', label: '左边' },
];

export default function CropOverlay({ imageUrl, sourceSize, crop, aspect, onChange }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const activeDrag = useRef<{ pointerId: number; x: number; y: number; crop: CropRect; handle?: CropHandle } | null>(null);
  const [shellSize, setShellSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => setShellSize({ width: shell.clientWidth, height: shell.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const width = sourceSize?.width || 1;
  const height = sourceSize?.height || 1;
  const scale = Math.min(shellSize.width / width, shellSize.height / height);
  const displayedWidth = width * scale;
  const displayedHeight = height * scale;
  const measure = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
  };

  return <div className="crop-overlay" ref={shellRef}>
    {displayedWidth > 0 && displayedHeight > 0 ? <div className="crop-image" style={{
      width: displayedWidth, height: displayedHeight,
      left: (shellSize.width - displayedWidth) / 2,
      top: (shellSize.height - displayedHeight) / 2,
    }} onPointerDown={(event) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      event.stopPropagation();
      const point = measure(event);
      const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-crop-handle]')?.dataset.cropHandle as CropHandle | undefined;
      const inside = point.x >= crop.x && point.x <= crop.x + crop.width
        && point.y >= crop.y && point.y <= crop.y + crop.height;
      const start = inside || handle ? crop : normalizeCrop({ ...crop, x: point.x - crop.width / 2, y: point.y - crop.height / 2 });
      if (!inside && !handle) onChange(start);
      activeDrag.current = { pointerId: event.pointerId, x: point.x, y: point.y, crop: start, handle };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      const drag = activeDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const point = measure(event);
      onChange(drag.handle
        ? resizeCrop(drag.crop, drag.handle, point.x - drag.x, point.y - drag.y, aspect ? aspect * height / width : undefined)
        : normalizeCrop({ ...drag.crop, x: drag.crop.x + point.x - drag.x, y: drag.crop.y + point.y - drag.y }));
    }} onPointerUp={(event) => {
      if (activeDrag.current?.pointerId !== event.pointerId) return;
      event.stopPropagation();
      activeDrag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={(event) => {
      if (activeDrag.current?.pointerId !== event.pointerId) return;
      event.stopPropagation();
      activeDrag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}>
      <img src={imageUrl} alt="待裁剪照片" draggable={false} />
      <div className="crop-selection" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
        width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}>
        {handles.map((handle) => <button key={handle.id} type="button" className={`crop-handle crop-handle-${handle.id}`}
          data-crop-handle={handle.id} aria-label={`拖动裁剪框${handle.label}`} />)}
      </div>
    </div> : null}
  </div>;
}
