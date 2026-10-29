import type {PortraitRecipe} from '../domain/portrait';
import {emptyRecipe} from '../domain/recipe';
import {applyRecipeToPixels} from './imageMath';

/** Dense, separable bilateral neighbourhood. Never skip pixel phases as output resolution changes. */
export function applyPortraitRecipe(source:Uint8ClampedArray,width:number,height:number,recipe:PortraitRecipe){
 if(!Object.values(recipe).some(Boolean))return source;
 let out=source;
 const amount=Math.max(0,Math.min(100,recipe.smooth))/100*.85;
 if(amount){
  const radius=Math.max(1,Math.min(8,Math.round(Math.min(width,height)/600)));
  const weights=Float32Array.from({length:256},(_,d)=>Math.exp(-d*d/(2*22*22)));
  const spatial=Float32Array.from({length:radius*2+1},(_,i)=>Math.exp(-((i-radius)**2)/(2*(radius*.8)**2)));
  let input=source;
  for(const horizontal of [true,false]){
   const pass=new Uint8ClampedArray(input);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,center=(input[i]*77+input[i+1]*150+input[i+2]*29)>>8;
    let total=0,r=0,g=0,b=0;
    for(let delta=-radius;delta<=radius;delta++){
     const sx=horizontal?Math.max(0,Math.min(width-1,x+delta)):x,sy=horizontal?y:Math.max(0,Math.min(height-1,y+delta)),j=(sy*width+sx)*4;
     const l=(input[j]*77+input[j+1]*150+input[j+2]*29)>>8;
     const w=weights[Math.abs(l-center)]*spatial[delta+radius]*(input[j+3]/255);total+=w;r+=input[j]*w;g+=input[j+1]*w;b+=input[j+2]*w;
    }
    if(total){pass[i]=r/total;pass[i+1]=g/total;pass[i+2]=b/total;}
   }
   input=pass;
  }
  out=input;for(let i=0;i<out.length;i+=4)for(let channel=0;channel<3;channel++)out[i+channel]=source[i+channel]+(out[i+channel]-source[i+channel])*amount;
 }
 if(recipe.brightness||recipe.temperature||recipe.tint||recipe.saturation)out=applyRecipeToPixels(out,{...emptyRecipe,brightness:recipe.brightness,temperature:recipe.temperature,tint:recipe.tint,saturation:recipe.saturation},width,height);
 return out;
}
