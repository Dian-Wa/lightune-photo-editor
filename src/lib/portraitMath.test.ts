import {describe,expect,it} from 'vitest';
import {applyPortraitRecipe} from './portraitMath';
import {neutralPortrait} from '../domain/portrait';
describe('local portrait pixel processing',()=>{
 it('smooths fine texture at high resolution rather than skipping pixel phases',()=>{
  const width=1200,height=1200,p=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=100+((x+y)%2?8:-8);p.set([v,v,v,255],(y*width+x)*4);}
  const out=applyPortraitRecipe(p,width,height,{...neutralPortrait,smooth:100});
  expect(Math.abs(out[(600*width+600)*4]-100)).toBeLessThan(5);expect(Math.abs(out[(600*width+601)*4]-100)).toBeLessThan(5);
 });
 it('leaves neutral pixels and alpha byte-identical',()=>{
  const pixels=new Uint8ClampedArray([150,100,80,127,200,180,170,0]);expect(applyPortraitRecipe(pixels,2,1,neutralPortrait)).toEqual(pixels);
 });
 it('smooths small texture while protecting a strong boundary',()=>{
  const p=new Uint8ClampedArray(40*10*4);for(let y=0;y<10;y++)for(let x=0;x<40;x++){const i=(y*40+x)*4;const value=x<20?100+((x+y)%2?8:-8):220;p.set([value,value,value,180],i);}
  const result=applyPortraitRecipe(p,40,10,{...neutralPortrait,smooth:100});
  expect(Math.abs(result[(5*40+10)*4]-100)).toBeLessThan(8);expect(result[(5*40+19)*4]).toBeLessThan(120);expect(result[(5*40+20)*4]).toBeGreaterThan(210);
  expect(result.filter((_,index)=>index%4===3)).toEqual(p.filter((_,index)=>index%4===3));
 });
 it('changes skin brightness and warmth in expected directions without overwriting input',()=>{
  const p=new Uint8ClampedArray([150,120,100,200]);const bright=applyPortraitRecipe(p,1,1,{...neutralPortrait,brightness:30});const warm=applyPortraitRecipe(p,1,1,{...neutralPortrait,temperature:50});
  expect(bright[0]).toBeGreaterThan(150);expect(warm[0]-warm[2]).toBeGreaterThan(50);expect(warm[3]).toBe(200);expect(p[0]).toBe(150);
 });
});
