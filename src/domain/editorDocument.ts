import { emptyRecipe, type AdjustmentRecipe } from './recipe';
import { fullCrop, normalizeCrop, type CropRect } from '../lib/crop';

export type Composition = { rotation: number; flipX: boolean; flipY: boolean; straighten: number; crop: CropRect };
export type FilterState = { id: string; name: string; recipe: AdjustmentRecipe; strength: number };
export type EditorDocument = { version: 1; recipe: AdjustmentRecipe; filter: FilterState | null; composition: Composition; selectedId: string };
export type DocumentHistory = { entries: { document: EditorDocument; label: string }[]; cursor: number };
export const defaultComposition: Composition = { rotation: 0, flipX: false, flipY: false, straighten: 0, crop: fullCrop };
export const createDocument = (recipe: AdjustmentRecipe = emptyRecipe): EditorDocument => ({version:1,recipe,filter:null,composition:{...defaultComposition},selectedId:'clean'});
export const initialHistory = (document: EditorDocument): DocumentHistory => ({entries:[{document,label:'开始编辑'}],cursor:0});
export function commitDocument(history: DocumentHistory, document: EditorDocument, label: string): DocumentHistory {
  if(JSON.stringify(history.entries[history.cursor].document)===JSON.stringify(document)) return history;
  const entries = [...history.entries.slice(0,history.cursor+1),{document,label}].slice(-60);
  return {entries,cursor:entries.length-1};
}
export const moveHistory = (history: DocumentHistory, delta: number): DocumentHistory => ({...history,cursor:Math.max(0,Math.min(history.entries.length-1,history.cursor+delta))});
export function rotateComposition(value: Composition, direction: number): Composition {
  const c=value.crop;
  const crop=direction>0?{x:1-c.y-c.height,y:c.x,width:c.height,height:c.width}:{x:c.y,y:1-c.x-c.width,width:c.height,height:c.width};
  return {...value,rotation:((value.rotation+direction)%4+4)%4,flipX:value.flipY,flipY:value.flipX,crop:normalizeCrop(crop)};
}
export function flipComposition(value: Composition, axis: 'x'|'y'): Composition {
  return axis==='x'?{...value,flipX:!value.flipX,straighten:-value.straighten,crop:{...value.crop,x:1-value.crop.x-value.crop.width}}
    :{...value,flipY:!value.flipY,straighten:-value.straighten,crop:{...value.crop,y:1-value.crop.y-value.crop.height}};
}
export function transformedSize(width: number,height: number,composition: Composition) {
  return composition.rotation%2?{width:height,height:width}:{width,height};
}
export function straightenScale(width: number,height: number,angle: number) {
  const a=Math.abs(angle)*Math.PI/180;
  return Math.max(Math.cos(a)+height/width*Math.sin(a),Math.cos(a)+width/height*Math.sin(a));
}
