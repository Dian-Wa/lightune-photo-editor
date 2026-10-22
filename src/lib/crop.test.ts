import { describe, expect, it } from 'vitest';
import { cropSourceRect, fitCropToAspect, fullCrop, normalizeCrop } from './crop';

describe('photo crop geometry', () => {
  it('maps a normalized selection to actual source pixels and clamps overflow', () => {
    expect(cropSourceRect(4000, 3000, { x: 0.25, y: 0.1, width: 0.5, height: 0.6 }))
      .toEqual({ x: 1000, y: 300, width: 2000, height: 1800 });
    expect(cropSourceRect(4000, 3000, { x: 0.95, y: -2, width: 0.5, height: 2 }))
      .toEqual({ x: 2000, y: 0, width: 2000, height: 3000 });
    expect(normalizeCrop({ x: Number.NaN, y: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0, width: 0.05, height: 0.05 });
  });

  it('fits requested ratios inside the source while preserving the full selection', () => {
    expect(fitCropToAspect(4000, 3000, 1)).toEqual({ x: 0.125, y: 0, width: 0.75, height: 1 });
    expect(fitCropToAspect(4000, 3000, 16 / 9, 0.5).width).toBe(0.5);
    expect(fitCropToAspect(4000, 3000, 16 / 9, 0.5).height).toBeCloseTo(0.375);
    expect(fitCropToAspect(0, 0, 1)).toEqual(fullCrop);
  });
});
