/// <reference lib="webworker" />
import { applyRecipeToPixels } from '../lib/imageMath';
import type { AdjustmentRecipe } from '../domain/recipe';
import { applyLocalAdjustments,applyPortraitAdjustments } from '../lib/creativeRender';
import type {PortraitRegion} from '../domain/portrait';
import type { ImageGeometry, LocalAdjustment } from '../domain/creative';

const worker = self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage = (event: MessageEvent<{ pixels: ArrayBuffer; recipe: AdjustmentRecipe; width: number; height: number; locals?:LocalAdjustment[];portraits?:PortraitRegion[];geometry?:ImageGeometry }>) => {
  const { pixels, recipe, width, height } = event.data;
  const result = event.data.portraits&&event.data.geometry?applyPortraitAdjustments(new Uint8ClampedArray(pixels),width,height,event.data.portraits,event.data.geometry):event.data.locals&&event.data.geometry?applyLocalAdjustments(new Uint8ClampedArray(pixels),width,height,event.data.locals,event.data.geometry):applyRecipeToPixels(new Uint8ClampedArray(pixels), recipe, width, height);
  worker.postMessage({ pixels: result.buffer }, [result.buffer]);
};
