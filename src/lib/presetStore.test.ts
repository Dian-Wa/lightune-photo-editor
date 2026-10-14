import { describe, expect, it } from 'vitest';
import { parsePresetBackup } from './presetStore';

const preset = { id: 'saved', name: '专业模板', source: 'manual', tags: ['测试'], favorite: false,
  previewType: 'portrait', createdAt: '2026-10-12', updatedAt: '2026-10-12' };

describe('professional preset backups', () => {
  it('loads legacy backups with neutral new controls', () => {
    const [restored] = parsePresetBackup(JSON.stringify([{ ...preset, recipe: { brightness: 8, grain: 20 } }]));
    expect(restored.recipe).toMatchObject({ brightness: 8, grain: 20, grainSize: 0,
      curveRgb50: 128, hslEnabled: 1, gradingShadowSaturation: 0 });
  });

  it('preserves advanced values and module bypass through a JSON round trip', () => {
    const [restored] = parsePresetBackup(JSON.stringify([{ ...preset, recipe: {
      hslOrangeHue: -20, curveBlue75: 170, gradingHighlightHue: 42,
      blackWhiteRed: 38, vignetteFeather: 72, grainRoughness: 28, gradingEnabled: 0,
    } }]));
    const [again] = parsePresetBackup(JSON.stringify([restored]));
    expect(again.recipe).toMatchObject({ hslOrangeHue: -20, curveBlue75: 170, gradingHighlightHue: 42,
      blackWhiteRed: 38, vignetteFeather: 72, grainRoughness: 28, gradingEnabled: 0 });
    expect(again.recipe).toEqual(restored.recipe);
  });
});
