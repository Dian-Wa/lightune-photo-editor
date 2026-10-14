/// <reference lib="webworker" />
import { applyRecipeToPixels } from '../lib/imageMath';
import type { AdjustmentRecipe } from '../domain/recipe';

const worker = self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage = (event: MessageEvent<{ pixels: ArrayBuffer; recipe: AdjustmentRecipe; width: number; height: number }>) => {
  const { pixels, recipe, width, height } = event.data;
  const result = applyRecipeToPixels(new Uint8ClampedArray(pixels), recipe, width, height);
  worker.postMessage({ pixels: result.buffer }, [result.buffer]);
};
