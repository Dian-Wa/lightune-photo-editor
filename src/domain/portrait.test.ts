import {describe,expect,it} from 'vitest';
import {createPortraitRegion,manualPortraitRegion} from './portrait';
describe('portrait regions',()=>{
 it('starts manual regions empty and neutral, never selects the whole image',()=>{
  const region=manualPortraitRegion('manual');expect(region.mask.outline).toEqual([]);expect(region.mask.strokes).toEqual([]);expect(Object.values(region.recipe).every(v=>v===0)).toBe(true);
 });
 it('rejects invalid landmarks rather than creating a full-frame mask',()=>{
  expect(()=>createPortraitRegion({id:'bad',landmarks:[]})).toThrow();
  expect(()=>createPortraitRegion({id:'bad',landmarks:Array.from({length:478},()=>({x:NaN,y:.4}))})).toThrow();
 });
 it('creates separate clipped face contours with protected feature holes',()=>{
  const landmarks=Array.from({length:478},(_,i)=>({x:.5+Math.cos(i)*.2,y:.5+Math.sin(i)*.3}));landmarks[10]={x:-.01,y:.2};
  const first=createPortraitRegion({id:'one',landmarks}),second=createPortraitRegion({id:'two',landmarks});
  expect(first.id).not.toBe(second.id);expect(first.mask.outline.length).toBeGreaterThan(20);expect(first.mask.exclusions).toHaveLength(5);expect(first.mask.outline.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)).toBe(true);
 });
});
