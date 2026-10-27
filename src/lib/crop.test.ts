import { describe, expect, it } from 'vitest';
import { cropSourceRect, fitCropToAspect, fullCrop, normalizeCrop, resizeCrop } from './crop';

describe('photo crop geometry', () => {
  it('resizes corners and edges without crossing the opposite edge or image boundary', () => {
    const crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
    expect(resizeCrop(crop, 'nw', 0.1, 0.15).x).toBeCloseTo(0.3);
    expect(resizeCrop(crop, 'nw', 0.1, 0.15).height).toBeCloseTo(0.45);
    expect(resizeCrop(crop, 'e', 2, 0).width).toBeCloseTo(0.8);
    expect(resizeCrop(crop, 'w', 2, 0).width).toBeCloseTo(0.05);
    expect(resizeCrop(crop, 'n', 0, 0.1).width).toBeCloseTo(0.6);
  });
  it('keeps the selected aspect ratio when resizing corners or edges', () => {
    const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    for (const handle of ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as const) {
      const next = resizeCrop(crop, handle, 0.12, -0.08, 1);
      expect(next.width / next.height).toBeCloseTo(1);
      expect(next.x).toBeGreaterThanOrEqual(0);
      expect(next.y).toBeGreaterThanOrEqual(0);
      expect(next.x + next.width).toBeLessThanOrEqual(1);
      expect(next.y + next.height).toBeLessThanOrEqual(1);
    }
  });
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
