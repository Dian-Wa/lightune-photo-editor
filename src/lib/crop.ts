export type CropRect = { x: number; y: number; width: number; height: number };
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function resizeCrop(crop: CropRect, handle: CropHandle, dx: number, dy: number, ratio?: number): CropRect {
  const horizontal = handle.includes('e') || handle.includes('w');
  const vertical = handle.includes('n') || handle.includes('s');
  const anchorX = handle.includes('w') ? crop.x + crop.width : handle.includes('e') ? crop.x : crop.x + crop.width / 2;
  const anchorY = handle.includes('n') ? crop.y + crop.height : handle.includes('s') ? crop.y : crop.y + crop.height / 2;
  const maxWidth = horizontal ? (handle.includes('w') ? anchorX : 1 - anchorX) : 2 * Math.min(anchorX, 1 - anchorX);
  const maxHeight = vertical ? (handle.includes('n') ? anchorY : 1 - anchorY) : 2 * Math.min(anchorY, 1 - anchorY);
  let width = horizontal ? clamp(crop.width + (handle.includes('w') ? -dx : dx), 0.05, maxWidth) : crop.width;
  let height = vertical ? clamp(crop.height + (handle.includes('n') ? -dy : dy), 0.05, maxHeight) : crop.height;
  if (ratio && ratio > 0) {
    const useWidth = horizontal && (!vertical || Math.abs(dx) >= Math.abs(dy * ratio));
    width = useWidth ? width : height * ratio;
    width = clamp(width, Math.min(Math.max(0.05, 0.05 * ratio), maxWidth, maxHeight * ratio), Math.min(maxWidth, maxHeight * ratio));
    height = width / ratio;
  }
  return normalizeCrop({
    x: handle.includes('w') ? anchorX - width : horizontal ? anchorX : anchorX - width / 2,
    y: handle.includes('n') ? anchorY - height : vertical ? anchorY : anchorY - height / 2,
    width, height,
  });
}

export const fullCrop: CropRect = { x: 0, y: 0, width: 1, height: 1 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeCrop(crop: CropRect): CropRect {
  const width = clamp(Number.isFinite(crop.width) ? crop.width : 1, 0.05, 1);
  const height = clamp(Number.isFinite(crop.height) ? crop.height : 1, 0.05, 1);
  return {
    x: clamp(Number.isFinite(crop.x) ? crop.x : 0, 0, 1 - width),
    y: clamp(Number.isFinite(crop.y) ? crop.y : 0, 0, 1 - height),
    width,
    height,
  };
}

export function cropSourceRect(sourceWidth: number, sourceHeight: number, crop: CropRect) {
  const normalized = normalizeCrop(crop);
  const x = Math.floor(normalized.x * sourceWidth);
  const y = Math.floor(normalized.y * sourceHeight);
  const width = Math.max(1, Math.min(sourceWidth - x, Math.round(normalized.width * sourceWidth)));
  const height = Math.max(1, Math.min(sourceHeight - y, Math.round(normalized.height * sourceHeight)));
  return { x, y, width, height };
}

export function fitCropToAspect(sourceWidth: number, sourceHeight: number, ratio: number, size = 1): CropRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || !Number.isFinite(ratio) || ratio <= 0) return fullCrop;
  const sourceRatio = sourceWidth / sourceHeight;
  const scale = clamp(size, 0.1, 1);
  const width = scale * Math.min(1, ratio / sourceRatio);
  const height = scale * Math.min(1, sourceRatio / ratio);
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}
