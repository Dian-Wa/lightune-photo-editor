export type CropRect = { x: number; y: number; width: number; height: number };

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
