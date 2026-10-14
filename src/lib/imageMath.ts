import { colorBands, curveAnchors, curveChannels, curveInputValues, effectiveRecipe, normalizeRecipe, type AdjustmentRecipe } from '../domain/recipe';
import { buildColorBandTable, buildCurveLut, clamp01, hslToRgb, rgbToHsl } from './colorMath';

const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const grainNoise = (x: number, y: number) => (((Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>> 0) % 1009) / 1008 - 0.5;

export function calculateOutputSize(sourceWidth: number, sourceHeight: number, maxEdge: number) {
  const scale = maxEdge > 0 ? Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight)) : 1;
  return { width: Math.max(1, Math.round(sourceWidth * scale)), height: Math.max(1, Math.round(sourceHeight * scale)) };
}

export function estimateEncodedBytes(width: number, height: number, format: string, quality: number) {
  const pixels = Math.max(1, width) * Math.max(1, height);
  if (format === 'png') return Math.round(pixels * 1.35);
  const normalizedQuality = Math.max(0, Math.min(1, quality));
  const bytesPerPixel = format === 'webp'
    ? 0.06 + normalizedQuality * 0.24
    : 0.08 + normalizedQuality * 0.34;
  return Math.round(pixels * bytesPerPixel);
}

export function assertSafePixelCount(width: number, height: number, maxPixels = 40_000_000) {
  if (width * height > maxPixels) throw new Error('图片像素过大，可能超出浏览器内存；请在导出设置中填写较小的最长边');
}

export function applyRecipeToPixels(
  source: Uint8ClampedArray,
  recipe: AdjustmentRecipe,
  width: number,
  height: number,
): Uint8ClampedArray {
  recipe = effectiveRecipe(normalizeRecipe(recipe));
  const out = new Uint8ClampedArray(source);
  const mix = recipe.strength / 100;
  if (mix === 0) return out;
  const exposure = 2 ** (recipe.exposure / 100);
  const contrast = (259 * (recipe.contrast * 1.5 + 255)) / (255 * (259 - recipe.contrast * 1.5));
  const saturation = 1 + recipe.saturation / 100;
  const selectiveColor = colorBands.some((band) => recipe[`hsl${band.id}Hue`] !== 0
    || recipe[`hsl${band.id}Saturation`] !== 0 || recipe[`hsl${band.id}Luminance`] !== 0);
  const blackWhiteMix = recipe.blackWhiteMix / 100;
  const needsHsl = selectiveColor || recipe.hue !== 0;
  const bandTable = needsHsl || blackWhiteMix > 0 ? buildColorBandTable(recipe) : null;
  const curveTables = curveChannels.map((channel) => curveAnchors.some((anchor, i) =>
    recipe[`curve${channel.id}${anchor}`] !== curveInputValues[i],
  ) ? buildCurveLut(recipe, channel.id) : null);
  const hasGrading = recipe.gradingShadowSaturation + recipe.gradingMidtoneSaturation + recipe.gradingHighlightSaturation > 0;
  const gradeColors = hasGrading ? (['Shadow', 'Midtone', 'Highlight'] as const).map((tone) => {
    const color = hslToRgb(recipe[`grading${tone}Hue`], 1, 0.5);
    const lum = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
    return color.map((channel) => (channel - lum) * recipe[`grading${tone}Saturation`] / 100 * 0.6);
  }) : null;
  const gradingExponent = 1 + (100 - recipe.gradingBlending) / 50;
  const customVignette = recipe.vignette !== 0 && (recipe.vignetteMidpoint !== 50
    || recipe.vignetteFeather !== 50 || recipe.vignetteRoundness !== 0);
  const customGrain = recipe.grain !== 0 && (recipe.grainSize !== 0 || recipe.grainRoughness !== 50);
  const grainBlock = Math.max(1, (1 + recipe.grainSize / 100 * 9) * Math.max(width, height) / 1400);

  for (let i = 0; i < source.length; i += 4) {
    const or = source[i]; const og = source[i + 1]; const ob = source[i + 2];
    let r = or * exposure + recipe.brightness * 1.1;
    let g = og * exposure + recipe.brightness * 1.1;
    let b = ob * exposure + recipe.brightness * 1.1;
    r = contrast * (r - 128) + 128;
    g = contrast * (g - 128) + 128;
    b = contrast * (b - 128) + 128;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadowWeight = (1 - Math.max(0, Math.min(1, lum / 180))) * recipe.shadows * 0.9;
    const highlightWeight = Math.max(0, Math.min(1, (lum - 80) / 175)) * recipe.highlights * 0.75;
    r += shadowWeight + highlightWeight; g += shadowWeight + highlightWeight; b += shadowWeight + highlightWeight;
    if (recipe.whites !== 0 || recipe.blacks !== 0 || recipe.midtones !== 0) {
      const light = clamp01(lum / 255);
      const shift = clamp01((lum - 128) / 127) ** 2 * recipe.whites * 0.9
        + clamp01(1 - lum / 128) ** 2 * recipe.blacks * 0.75
        + 4 * light * (1 - light) * recipe.midtones * 0.8;
      r += shift; g += shift; b += shift;
    }
    const average = (r + g + b) / 3;
    const maxChannel = Math.max(r, g, b);
    const vibrance = 1 + (recipe.vibrance / 100) * (1 - Math.min(1, (maxChannel - average) / 128));
    r = average + (r - average) * saturation * vibrance;
    g = average + (g - average) * saturation * vibrance;
    b = average + (b - average) * saturation * vibrance;
    r += recipe.temperature * 0.55 + recipe.tint * 0.18;
    g -= recipe.tint * 0.34;
    b -= recipe.temperature * 0.55 - recipe.tint * 0.18;
    let bwShift = 0;
    if (blackWhiteMix > 0 && bandTable) {
      const [sourceHue, sourceSaturation] = rgbToHsl(or, og, ob);
      bwShift = bandTable[(Math.round(sourceHue) % 360) * 4 + 3] * Math.min(1, sourceSaturation / 0.15);
    }
    if (needsHsl && bandTable) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const band = Math.round(h) % 360 * 4;
      const chromaWeight = Math.min(1, s / 0.15);
      if (selectiveColor || recipe.hue !== 0) {
        [r, g, b] = hslToRgb(h + recipe.hue + bandTable[band] * 0.3,
          s * (1 + bandTable[band + 1] / 100), l + bandTable[band + 2] / 100 * 0.35 * chromaWeight);
      }
    }
    if (curveTables[0]) {
      r = curveTables[0][byte(r)]; g = curveTables[0][byte(g)]; b = curveTables[0][byte(b)];
    }
    if (curveTables[1]) r = curveTables[1][byte(r)];
    if (curveTables[2]) g = curveTables[2][byte(g)];
    if (curveTables[3]) b = curveTables[3][byte(b)];
    if (gradeColors) {
      const light = clamp01((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 + recipe.gradingBalance / 400);
      const weights = [(1 - light) ** gradingExponent, (4 * light * (1 - light)) ** gradingExponent, light ** gradingExponent];
      const weightSum = weights[0] + weights[1] + weights[2];
      for (let tone = 0; tone < 3; tone += 1) {
        const weight = weights[tone] / weightSum;
        r += gradeColors[tone][0] * weight; g += gradeColors[tone][1] * weight; b += gradeColors[tone][2] * weight;
      }
    }
    if (blackWhiteMix > 0) {
      const gray = Math.max(0, Math.min(255, 0.2126 * r + 0.7152 * g + 0.0722 * b + bwShift * 0.8));
      r += (gray - r) * blackWhiteMix; g += (gray - g) * blackWhiteMix; b += (gray - b) * blackWhiteMix;
    }
    if (recipe.fade !== 0) {
      const fade = recipe.fade / 100 * 0.22;
      r += (255 - r) * fade; g += (255 - g) * fade; b += (255 - b) * fade;
    }
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    const dx = width > 1 ? (x / (width - 1) - 0.5) * 2 : 0;
    const dy = height > 1 ? (y / (height - 1) - 0.5) * 2 : 0;
    let edge = Math.min(1, (dx * dx + dy * dy) / 2);
    if (customVignette) {
      const round = recipe.vignetteRoundness / 100;
      const minSide = Math.min(width, height);
      const sx = dx * (1 + (width / minSide - 1) * round);
      const sy = dy * (1 + (height / minSide - 1) * round);
      const radius = Math.sqrt((sx * sx + sy * sy) / 2);
      const start = recipe.vignetteMidpoint / 100 * 0.8;
      const feather = 0.05 + recipe.vignetteFeather / 100 * 0.95;
      const t = clamp01((radius - start) / ((1 - start) * feather));
      edge = t * t * (3 - 2 * t);
    }
    const vignette = 1 - edge * recipe.vignette / 140;
    let grain = recipe.grain === 0 ? 0 : ((((x * 17 + y * 31) % 23) / 22) - 0.5) * recipe.grain * 0.55;
    if (customGrain) {
      const gx = x / grainBlock; const gy = y / grainBlock;
      const ix = Math.floor(gx); const iy = Math.floor(gy);
      const tx = gx - ix; const ty = gy - iy;
      const top = grainNoise(ix, iy) * (1 - tx) + grainNoise(ix + 1, iy) * tx;
      const bottom = grainNoise(ix, iy + 1) * (1 - tx) + grainNoise(ix + 1, iy + 1) * tx;
      const smooth = top * (1 - ty) + bottom * ty;
      const roughness = recipe.grainRoughness / 100;
      grain = (smooth * (1 - roughness) + grainNoise(ix, iy) * roughness) * (0.5 + roughness) * recipe.grain * 0.55;
    }
    r = r * vignette + grain; g = g * vignette + grain; b = b * vignette + grain;
    const soft = recipe.softness / 250;
    r = r * (1 - soft) + lum * soft; g = g * (1 - soft) + lum * soft; b = b * (1 - soft) + lum * soft;
    out[i] = byte(or + (r - or) * mix);
    out[i + 1] = byte(og + (g - og) * mix);
    out[i + 2] = byte(ob + (b - ob) * mix);
    out[i + 3] = source[i + 3];
  }
  const sharpen = recipe.sharpen / 100 * 0.8 * mix;
  if (sharpen !== 0 && width * height > 1) {
    const colored = new Uint8ClampedArray(out);
    const channel = (x: number, y: number, offset: number) => colored[(Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4 + offset];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        for (let offset = 0; offset < 3; offset += 1) {
          const average = (channel(x - 1, y, offset) + channel(x + 1, y, offset) + channel(x, y - 1, offset) + channel(x, y + 1, offset)) / 4;
          out[index + offset] = byte(colored[index + offset] + (colored[index + offset] - average) * sharpen);
        }
      }
    }
  }
  if (recipe.clarity !== 0 && width * height > 1) applyClarity(out, width, height, recipe.clarity / 100 * mix);
  return out;
}

// Separable luminance blur uses one float buffer and rolling sums, independent of radius cost.
function applyClarity(pixels: Uint8ClampedArray, width: number, height: number, amount: number) {
  const radius = Math.max(1, Math.min(64, Math.round(Math.max(width, height) / 120)));
  const blurredRows = new Float32Array(width * height);
  const luminance = (x: number, y: number) => {
    const i = (y * width + Math.max(0, Math.min(width - 1, x))) * 4;
    return pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
  };
  const windowSize = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) sum += luminance(x, y);
    for (let x = 0; x < width; x += 1) {
      blurredRows[y * width + x] = sum / windowSize;
      sum += luminance(x + radius + 1, y) - luminance(x - radius, y);
    }
  }
  for (let x = 0; x < width; x += 1) {
    const rowValue = (y: number) => blurredRows[Math.max(0, Math.min(height - 1, y)) * width + x];
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += rowValue(y);
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + x) * 4;
      const lum = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
      const midtoneWeight = 0.25 + clamp01(4 * (lum / 255) * (1 - lum / 255)) * 0.75;
      const delta = (lum - sum / windowSize) * amount * 1.5 * midtoneWeight;
      for (let channel = 0; channel < 3; channel += 1) pixels[i + channel] = byte(pixels[i + channel] + delta);
      sum += rowValue(y + radius + 1) - rowValue(y - radius);
    }
  }
}
