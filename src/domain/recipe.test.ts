import { describe, expect, it } from 'vitest';
import { emptyRecipe, normalizeRecipe, resetRecipeModule, effectiveRecipe } from './recipe';

describe('normalizeRecipe', () => {
  it('fills missing controls and clamps unsafe model output', () => {
    expect(normalizeRecipe({ brightness: 180, contrast: -150, strength: 140 })).toEqual({
      ...emptyRecipe,
      brightness: 100,
      contrast: -100,
      strength: 100,
    });
  });

  it('turns non-finite values into neutral adjustments', () => {
    expect(normalizeRecipe({ exposure: Number.NaN, temperature: Infinity })).toEqual(emptyRecipe);
  });

  it('restores old recipes with neutral advanced controls and identity curves', () => {
    const recipe = normalizeRecipe({ brightness: 12, vignette: 18 });
    expect(recipe).toMatchObject({ brightness: 12, vignette: 18, whites: 0, blacks: 0, midtones: 0, hue: 0,
      hslOrangeSaturation: 0, curveRgb0: 0, curveRgb25: 64, curveRgb50: 128, curveRgb75: 191,
      curveRgb100: 255, gradingShadowSaturation: 0, blackWhiteMix: 0, vignetteMidpoint: 50,
      grainSize: 0, grainRoughness: 50, curvesEnabled: 1 });
  });

  it('clamps advanced special ranges and normalizes invalid inputs', () => {
    expect(normalizeRecipe({ hue: 220, curveBlue50: 400, gradingHighlightHue: -12,
      gradingBlending: 150, blackWhiteMix: -20, grainSize: 120, hslBlueLuminance: -180,
      curvesEnabled: 0, gradingShadowSaturation: Infinity })).toMatchObject({
      hue: 180, curveBlue50: 255, gradingHighlightHue: 0, gradingBlending: 100,
      blackWhiteMix: 0, grainSize: 100, hslBlueLuminance: -100, curvesEnabled: 0,
      gradingShadowSaturation: 0,
    });
  });

  it('resets one module without changing unrelated adjustments', () => {
    const recipe = normalizeRecipe({ exposure: 30, hslBlueHue: 20, hslRedSaturation: -40, hslEnabled: 0 });
    expect(resetRecipeModule(recipe, 'hsl')).toMatchObject({ exposure: 30, hslBlueHue: 0,
      hslRedSaturation: 0, hslEnabled: 1 });
    expect(recipe.hslBlueHue).toBe(20);
  });

  it('bypasses a module while retaining its saved settings', () => {
    const recipe = normalizeRecipe({ exposure: 20, curveRgb50: 170, curvesEnabled: 0 });
    expect(effectiveRecipe(recipe)).toMatchObject({ exposure: 20, curveRgb50: 128 });
    expect(recipe.curveRgb50).toBe(170);
  });
});
