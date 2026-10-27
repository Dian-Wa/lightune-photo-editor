import { describe, expect, it } from 'vitest';
import { applyRecipeToPixels, assertSafePixelCount, calculateOutputSize, estimateEncodedBytes } from './imageMath';
import { emptyRecipe } from '../domain/recipe';
import { builtinPresets } from '../domain/presets';

describe('applyRecipeToPixels', () => {
  it('preserves all six builtin looks when advanced controls remain at defaults', () => {
    const input = new Uint8ClampedArray([20, 40, 60, 200, 120, 90, 70, 255, 220, 230, 240, 128]);
    expect(builtinPresets.slice(0,6).map((preset) => Array.from(applyRecipeToPixels(input, preset.recipe, 3, 1)))).toEqual([
      [39, 60, 82, 200, 135, 103, 82, 255, 217, 227, 238, 128],
      [35, 44, 57, 200, 136, 94, 66, 255, 236, 234, 237, 128],
      [42, 53, 63, 200, 130, 101, 81, 255, 195, 198, 201, 128],
      [0, 11, 42, 200, 96, 75, 65, 255, 202, 222, 243, 128],
      [64, 76, 89, 200, 137, 111, 92, 255, 207, 212, 217, 128],
      [3, 28, 52, 200, 135, 82, 44, 255, 236, 247, 255, 128],
    ]);
  });
  it('keeps neutral pixels unchanged', () => {
    const input = new Uint8ClampedArray([80, 120, 200, 255]);
    expect(Array.from(applyRecipeToPixels(input, emptyRecipe, 1, 1))).toEqual([80, 120, 200, 255]);
  });

  it('warms highlights without changing alpha', () => {
    const input = new Uint8ClampedArray([120, 120, 120, 180]);
    const result = applyRecipeToPixels(input, { ...emptyRecipe, temperature: 60 }, 1, 1);
    expect(result[0]).toBeGreaterThan(result[2]);
    expect(result[3]).toBe(180);
  });

  it('strength zero bypasses the whole recipe', () => {
    const input = new Uint8ClampedArray([20, 30, 40, 255]);
    const result = applyRecipeToPixels(input, { ...emptyRecipe, brightness: 100, strength: 0 }, 1, 1);
    expect(Array.from(result)).toEqual(Array.from(input));
  });

  it('sharpens local contrast around a brighter center pixel', () => {
    const input = new Uint8ClampedArray([
      100, 100, 100, 255,
      120, 120, 120, 255,
      100, 100, 100, 255,
    ]);
    const result = applyRecipeToPixels(input, { ...emptyRecipe, sharpen: 100 }, 3, 1);
    expect(result[4]).toBeGreaterThan(120);
  });

  it('uses negative sharpening as a softening pass', () => {
    const input = new Uint8ClampedArray([100, 100, 100, 255, 120, 120, 120, 255, 100, 100, 100, 255]);
    const result = applyRecipeToPixels(input, { ...emptyRecipe, sharpen: -100 }, 3, 1);
    expect(result[4]).toBeLessThan(120);
  });

  it('whites target bright pixels and blacks target dark pixels', () => {
    const input = new Uint8ClampedArray([20, 20, 20, 255, 128, 128, 128, 255, 230, 230, 230, 255]);
    const whites = applyRecipeToPixels(input, { ...emptyRecipe, whites: 30 }, 3, 1);
    const blacks = applyRecipeToPixels(input, { ...emptyRecipe, blacks: 30 }, 3, 1);
    expect(whites[0]).toBe(20);
    expect(whites[8]).toBeGreaterThan(230);
    expect(blacks[0]).toBeGreaterThan(20);
    expect(blacks[8]).toBe(230);
  });

  it('midtones change middle gray without moving black and white endpoints', () => {
    const input = new Uint8ClampedArray([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]);
    const result = applyRecipeToPixels(input, { ...emptyRecipe, midtones: 50 }, 3, 1);
    expect(result[0]).toBe(0);
    expect(result[4]).toBeGreaterThan(128);
    expect(result[8]).toBe(255);
  });

  it('global hue rotates red into green at 120 degrees', () => {
    const result = applyRecipeToPixels(new Uint8ClampedArray([255, 0, 0, 255]), { ...emptyRecipe, hue: 120 }, 1, 1);
    expect(Array.from(result)).toEqual([0, 255, 0, 255]);
  });

  it('selective HSL desaturates red without desaturating blue or coloring gray', () => {
    const input = new Uint8ClampedArray([220, 40, 40, 255, 40, 40, 220, 255, 120, 120, 120, 180]);
    const result = applyRecipeToPixels(input, { ...emptyRecipe, hslRedSaturation: -100, hslRedLuminance: 30 }, 3, 1);
    expect(result[0]).toBe(result[1]);
    expect(result[1]).toBe(result[2]);
    expect(Array.from(result.slice(4))).toEqual([40, 40, 220, 255, 120, 120, 120, 180]);
  });

  it('selective HSL hue and luminance visibly change their chosen color', () => {
    const blue = new Uint8ClampedArray([40, 40, 200, 255]);
    const lighter = applyRecipeToPixels(blue, { ...emptyRecipe, hslBlueLuminance: 60 }, 1, 1);
    const shifted = applyRecipeToPixels(blue, { ...emptyRecipe, hslBlueHue: 100 }, 1, 1);
    expect(lighter[0] + lighter[1] + lighter[2]).toBeGreaterThan(280);
    expect(shifted[0]).toBeGreaterThan(40);
    expect(shifted[1]).toBe(40);
  });

  it('RGB curves map middle gray to the configured output point', () => {
    const result = applyRecipeToPixels(new Uint8ClampedArray([128, 128, 128, 200]), { ...emptyRecipe, curveRgb50: 170 }, 1, 1);
    expect(Array.from(result)).toEqual([170, 170, 170, 200]);
  });

  it('a red channel curve changes only red and can be bypassed', () => {
    const input = new Uint8ClampedArray([128, 128, 128, 180]);
    const recipe = { ...emptyRecipe, curveRed50: 180 };
    expect(Array.from(applyRecipeToPixels(input, recipe, 1, 1))).toEqual([180, 128, 128, 180]);
    expect(Array.from(applyRecipeToPixels(input, { ...recipe, curvesEnabled: 0 }, 1, 1))).toEqual(Array.from(input));
  });

  it('color grading applies distinct hues to shadows and highlights', () => {
    const input = new Uint8ClampedArray([50, 50, 50, 255, 220, 220, 220, 128]);
    const result = applyRecipeToPixels(input, { ...emptyRecipe, gradingShadowHue: 240,
      gradingShadowSaturation: 50, gradingHighlightHue: 30, gradingHighlightSaturation: 50 }, 2, 1);
    expect(result[2]).toBeGreaterThan(result[0]);
    expect(result[4]).toBeGreaterThan(result[6]);
    expect(result[7]).toBe(128);
  });

  it('grading midtones, blending and balance have visible effects', () => {
    const input = new Uint8ClampedArray([128, 128, 128, 255]);
    const recipe = { ...emptyRecipe, gradingMidtoneHue: 120, gradingMidtoneSaturation: 60,
      gradingShadowHue: 240, gradingShadowSaturation: 60, gradingHighlightHue: 0, gradingHighlightSaturation: 60 };
    const normal = applyRecipeToPixels(input, recipe, 1, 1);
    expect(normal[1]).toBeGreaterThan(128);
    expect(Array.from(applyRecipeToPixels(input, { ...recipe, gradingBlending: 0 }, 1, 1))).not.toEqual(Array.from(normal));
    expect(Array.from(applyRecipeToPixels(input, { ...recipe, gradingBalance: 100 }, 1, 1))).not.toEqual(Array.from(normal));
  });

  it('black-and-white mixing independently controls the original red and blue brightness', () => {
    const input = new Uint8ClampedArray([200, 40, 40, 255, 40, 40, 200, 255]);
    const neutral = applyRecipeToPixels(input, { ...emptyRecipe, blackWhiteMix: 100 }, 2, 1);
    const redLift = applyRecipeToPixels(input, { ...emptyRecipe, blackWhiteMix: 100, blackWhiteRed: 70 }, 2, 1);
    expect(neutral[0]).toBe(neutral[1]);
    expect(neutral[4]).toBe(neutral[6]);
    expect(redLift[0]).toBeGreaterThan(neutral[0]);
    expect(redLift[4]).toBe(neutral[4]);
  });

  it('black-and-white color classification survives prior desaturation and hue changes', () => {
    const input = new Uint8ClampedArray([200, 40, 40, 255, 40, 40, 200, 255]);
    for (const earlier of [{ saturation: -100 }, { hue: 120 }, { temperature: 100 }]) {
      const recipe = { ...emptyRecipe, ...earlier, blackWhiteMix: 100 };
      const baseline = applyRecipeToPixels(input, recipe, 2, 1);
      const redLift = applyRecipeToPixels(input, { ...recipe, blackWhiteRed: 70 }, 2, 1);
      expect(redLift[0]).toBeGreaterThan(baseline[0]);
      expect(redLift[4]).toBe(baseline[4]);
    }
  });

  it('clarity increases local contrast and negative clarity reduces it', () => {
    const input = new Uint8ClampedArray([90, 90, 90, 255, 130, 130, 130, 180, 90, 90, 90, 255]);
    const positive = applyRecipeToPixels(input, { ...emptyRecipe, clarity: 70 }, 3, 1);
    const negative = applyRecipeToPixels(input, { ...emptyRecipe, clarity: -70 }, 3, 1);
    expect(positive[4]).toBeGreaterThan(130);
    expect(negative[4]).toBeLessThan(130);
    expect(positive[7]).toBe(180);
  });

  it('fade lifts black while leaving white unchanged', () => {
    const input = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const result = applyRecipeToPixels(input, { ...emptyRecipe, fade: 80 }, 2, 1);
    expect(result[0]).toBeGreaterThan(0);
    expect(result[4]).toBe(255);
  });

  it('vignette midpoint, feather and roundness each change the falloff', () => {
    const input = new Uint8ClampedArray(7 * 3 * 4).fill(150);
    const recipe = { ...emptyRecipe, vignette: 70 };
    const normal = Array.from(applyRecipeToPixels(input, recipe, 7, 3));
    for (const changes of [{ vignetteMidpoint: 10 }, { vignetteFeather: 10 }, { vignetteRoundness: 100 }]) {
      expect(Array.from(applyRecipeToPixels(input, { ...recipe, ...changes }, 7, 3))).not.toEqual(normal);
    }
  });

  it('grain size and roughness change the pattern reproducibly', () => {
    const input = new Uint8ClampedArray(10 * 4 * 4).fill(128);
    const recipe = { ...emptyRecipe, grain: 80, grainSize: 75, grainRoughness: 20 };
    const output = applyRecipeToPixels(input, recipe, 10, 4);
    expect(Array.from(output)).not.toEqual(Array.from(applyRecipeToPixels(input, { ...emptyRecipe, grain: 80 }, 10, 4)));
    expect(Array.from(output)).toEqual(Array.from(applyRecipeToPixels(input, recipe, 10, 4)));
    expect(Array.from(applyRecipeToPixels(input, { ...recipe, grainRoughness: 90 }, 10, 4))).not.toEqual(Array.from(output));
  });

  it('strength zero bypasses all professional stages and preserves source pixels', () => {
    const input = new Uint8ClampedArray([100, 80, 60, 128, 30, 40, 180, 255]);
    const recipe = { ...emptyRecipe, hslRedSaturation: -100, curveRgb50: 180,
      gradingShadowSaturation: 70, blackWhiteMix: 100, clarity: 80, strength: 0 };
    expect(Array.from(applyRecipeToPixels(input, recipe, 2, 1))).toEqual(Array.from(input));
  });

  it('bypassed HSL and grading have no effect', () => {
    const input = new Uint8ClampedArray([180, 30, 30, 90]);
    expect(Array.from(applyRecipeToPixels(input, { ...emptyRecipe, hslRedSaturation: -100,
      hslEnabled: 0, gradingShadowSaturation: 90, gradingEnabled: 0 }, 1, 1))).toEqual(Array.from(input));
  });
});

describe('assertSafePixelCount', () => {
  it('rejects decoded images that exceed the browser memory budget', () => {
    expect(() => assertSafePixelCount(18000, 12000)).toThrow('图片像素过大');
  });

  it('accepts ordinary high-resolution photos', () => {
    expect(() => assertSafePixelCount(6000, 4000)).not.toThrow();
  });
});

describe('calculateOutputSize', () => {
  it('keeps the exact source dimensions when maxEdge is zero', () => {
    expect(calculateOutputSize(18000, 12000, 0)).toEqual({ width: 18000, height: 12000 });
  });

  it('scales proportionally when a longest edge is requested', () => {
    expect(calculateOutputSize(6000, 4000, 3000)).toEqual({ width: 3000, height: 2000 });
  });
});

describe('estimateEncodedBytes', () => {
  it('returns a useful JPEG estimate that responds to quality', () => {
    const low = estimateEncodedBytes(4000, 3000, 'jpeg', 0.7);
    const high = estimateEncodedBytes(4000, 3000, 'jpeg', 1);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
  });

  it('estimates PNG independently from the lossy quality control', () => {
    expect(estimateEncodedBytes(1000, 1000, 'png', 0.7)).toBe(estimateEncodedBytes(1000, 1000, 'png', 1));
  });
});
