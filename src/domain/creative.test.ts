import {describe,it,expect} from 'vitest';
import {borderLayout,defaultBorder,sourceToOutput,outputToSource,blendMaskedPixels,createTextLayer,recycleLayer,duplicateLayer,moveLayer} from './creative';
import {defaultComposition} from './editorDocument';
describe('creative editing',()=>{
 it('keeps masks anchored to source through rotated flipped cropped straightening',()=>{
  for(const rotation of [0,1,2,3])for(const flipX of [false,true]){
   const composition={...defaultComposition,rotation,flipX,straighten:17,crop:{x:.1,y:.2,width:.7,height:.6}};
   const point={x:.4,y:.6},out=sourceToOutput(point,1600,900,composition),restored=outputToSource(out,1600,900,composition);
   expect(restored.x).toBeCloseTo(point.x);expect(restored.y).toBeCloseTo(point.y);
  }
 });
 it('adds proportional border and centered aspect padding',()=>{
  expect(borderLayout(1000,800,{...defaultBorder,enabled:true,padding:.1})).toEqual({width:1160,height:960,x:80,y:80,contentWidth:1000,contentHeight:800});
  const square=borderLayout(1000,800,{...defaultBorder,enabled:true,ratio:1,padding:0});expect(square.width).toBe(1000);expect(square.height).toBe(1000);expect(square.y).toBe(100);
 });
 it('only blends covered pixels and preserves original alpha',()=>{
  const source=new Uint8ClampedArray([10,20,30,80,40,50,60,255]),changed=new Uint8ClampedArray([110,120,130,255,140,150,160,255]);
  expect([...blendMaskedPixels(source,changed,new Uint8ClampedArray([0,0,0,255,0,0,0,0]),.5)]).toEqual([60,70,80,80,40,50,60,255]);
 });
 it('copies, reorders and recycles layers without destroying source',()=>{
  const first=createTextLayer('one'),copy=duplicateLayer(first,'two');expect(copy.id).toBe('two');expect(first.deletedAt).toBeUndefined();
  const recycled=recycleLayer(copy,'now');expect(recycled.deletedAt).toBe('now');expect(recycled.text).toBe(first.text);
  expect(moveLayer([first,copy],'one',1).map(layer=>layer.id)).toEqual(['two','one']);
 });
});
