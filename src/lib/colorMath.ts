import { colorBands, curveAnchors, curveInputValues, type AdjustmentRecipe, type CurveChannel } from '../domain/recipe';

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = clamp01(red / 255); const g = clamp01(green / 255); const b = clamp01(blue / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = ((hue * 60) % 360 + 360) % 360;
  return [hue, saturation, lightness];
}

export function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360 / 60;
  const s = clamp01(saturation); const l = clamp01(lightness);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(h % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x]
    : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// Compile selective color weights once rather than visiting eight bands for every pixel.
export function buildColorBandTable(recipe: AdjustmentRecipe): Float32Array {
  const table = new Float32Array(360 * 4);
  for (let hue = 0; hue < 360; hue += 1) {
    let index = colorBands.length - 1;
    for (let j = 0; j < colorBands.length - 1; j += 1) {
      if (hue < colorBands[j + 1].hue) { index = j; break; }
    }
    const left = colorBands[index]; const right = colorBands[(index + 1) % colorBands.length];
    const end = index === colorBands.length - 1 ? 360 : right.hue;
    const t = (hue - left.hue) / (end - left.hue);
    for (const [offset, component] of ['Hue', 'Saturation', 'Luminance'].entries()) {
      const a = recipe[`hsl${left.id}${component as 'Hue' | 'Saturation' | 'Luminance'}`];
      const b = recipe[`hsl${right.id}${component as 'Hue' | 'Saturation' | 'Luminance'}`];
      table[hue * 4 + offset] = a + (b - a) * t;
    }
    const a = recipe[`blackWhite${left.id}`]; const b = recipe[`blackWhite${right.id}`];
    table[hue * 4 + 3] = a + (b - a) * t;
  }
  return table;
}

// Shape-preserving cubic Hermite interpolation: smooth curves without overshoot between anchors.
export function buildCurveLut(recipe: AdjustmentRecipe, channel: CurveChannel): Float32Array {
  const x = curveInputValues;
  const y = curveAnchors.map((anchor) => recipe[`curve${channel}${anchor}`]);
  const slopes = y.slice(1).map((value, i) => (value - y[i]) / (x[i + 1] - x[i]));
  const tangents = y.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === y.length - 1) return slopes[slopes.length - 1];
    const left = slopes[i - 1]; const right = slopes[i];
    if (left * right <= 0) return 0;
    const h0 = x[i] - x[i - 1]; const h1 = x[i + 1] - x[i];
    const w0 = 2 * h1 + h0; const w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / left + w1 / right);
  });
  const table = new Float32Array(256);
  let segment = 0;
  for (let input = 0; input <= 255; input += 1) {
    while (segment < 3 && input > x[segment + 1]) segment += 1;
    const width = x[segment + 1] - x[segment];
    const t = (input - x[segment]) / width; const t2 = t * t; const t3 = t2 * t;
    const output = (2 * t3 - 3 * t2 + 1) * y[segment] + (t3 - 2 * t2 + t) * width * tangents[segment]
      + (-2 * t3 + 3 * t2) * y[segment + 1] + (t3 - t2) * width * tangents[segment + 1];
    table[input] = Math.max(0, Math.min(255, output));
  }
  return table;
}
