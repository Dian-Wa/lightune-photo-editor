import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { normalizeCrop, type CropRect } from '../lib/crop';

type Props = {
  imageUrl: string;
  sourceSize?: { width: number; height: number };
  crop: CropRect;
  onChange: (crop: CropRect) => void;
};

export default function CropOverlay({ imageUrl, sourceSize, crop, onChange }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const activeDrag = useRef<{ pointerId: number; x: number; y: number; crop: CropRect } | null>(null);
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
      const inside = point.x >= crop.x && point.x <= crop.x + crop.width
        && point.y >= crop.y && point.y <= crop.y + crop.height;
      const start = inside ? crop : normalizeCrop({ ...crop, x: point.x - crop.width / 2, y: point.y - crop.height / 2 });
      if (!inside) onChange(start);
      activeDrag.current = { pointerId: event.pointerId, x: point.x, y: point.y, crop: start };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      const drag = activeDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const point = measure(event);
      onChange(normalizeCrop({ ...drag.crop, x: drag.crop.x + point.x - drag.x, y: drag.crop.y + point.y - drag.y }));
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
        width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
    </div> : null}
  </div>;
}
