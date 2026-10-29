import { emptyRecipe } from '../domain/recipe';
import { applyRecipeToPixels, assertSafePixelCount } from './imageMath';
import {applyPortraitRecipe} from './portraitMath';
import type {PortraitRegion} from '../domain/portrait';
import { sourceToOutput, blendMaskedPixels, borderLayout, defaultBorder, type AssetUrls, type BorderState, type CreativeLayer, type ImageGeometry, type LocalAdjustment, type LocalMask } from '../domain/creative';

type DrawingContext=CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;
export function rasterizeMask(mask:LocalMask,width:number,height:number,geometry:ImageGeometry){
 const surface=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
 const ctx=surface.getContext('2d',{willReadFrequently:true}) as DrawingContext|null;if(!ctx)throw new Error('无法创建蒙版画布');
 const p0=sourceToOutput({x:0,y:0},geometry.sourceWidth,geometry.sourceHeight,geometry.composition),px=sourceToOutput({x:1,y:0},geometry.sourceWidth,geometry.sourceHeight,geometry.composition),py=sourceToOutput({x:0,y:1},geometry.sourceWidth,geometry.sourceHeight,geometry.composition);
 ctx.setTransform((px.x-p0.x)*width/geometry.sourceWidth,(px.y-p0.y)*height/geometry.sourceWidth,(py.x-p0.x)*width/geometry.sourceHeight,(py.y-p0.y)*height/geometry.sourceHeight,p0.x*width,p0.y*height);
 const w=geometry.sourceWidth,h=geometry.sourceHeight,short=Math.min(w,h),outScale=Math.hypot((px.x-p0.x)*width,(px.y-p0.y)*height)/w;
 if(mask.type==='brush'){
  ctx.lineCap='round';ctx.lineJoin='round';ctx.fillStyle='#fff';ctx.strokeStyle='#fff';
  if(mask.outline?.length){
   const polygon=(points:{x:number;y:number}[])=>{ctx.beginPath();points.forEach((p,index)=>{if(index)ctx.lineTo(p.x*w,p.y*h);else ctx.moveTo(p.x*w,p.y*h);});ctx.closePath();ctx.fill();};
   ctx.filter=`blur(${short*outScale*.008*mask.feather}px)`;polygon(mask.outline);ctx.filter='none';
   ctx.globalCompositeOperation='destination-out';for(const hole of mask.exclusions||[])polygon(hole);ctx.globalCompositeOperation='source-over';
  }
  for(const stroke of mask.strokes){if(!stroke.points.length)continue;ctx.globalCompositeOperation=stroke.erase?'destination-out':'source-over';const radius=stroke.size*short;ctx.lineWidth=radius*2;ctx.filter=stroke.feather>0?`blur(${radius*outScale*stroke.feather*.5}px)`:'none';
   ctx.beginPath();ctx.moveTo(stroke.points[0].x*w,stroke.points[0].y*h);for(const point of stroke.points.slice(1))ctx.lineTo(point.x*w,point.y*h);
   if(stroke.points.length===1){ctx.arc(stroke.points[0].x*w,stroke.points[0].y*h,radius,0,Math.PI*2);ctx.fill();}else ctx.stroke();
  }
 }else{
  const start={x:mask.start.x*w,y:mask.start.y*h},end={x:mask.end.x*w,y:mask.end.y*h};
  if(mask.type==='linear'){
   const gradient=ctx.createLinearGradient(start.x,start.y,end.x===start.x&&end.y===start.y?end.x+1:end.x,end.y);
   const feather=Math.max(.001,Math.min(1,mask.feather));gradient.addColorStop(Math.max(0,.5-feather/2),'#fff');gradient.addColorStop(Math.min(1,.5+feather/2),'#ffffff00');ctx.fillStyle=gradient;
  }else{
   const radius=Math.max(1,mask.radius*short),inner=radius*(1-Math.min(1,Math.max(.001,mask.feather)));
   const gradient=ctx.createRadialGradient(start.x,start.y,inner,start.x,start.y,radius);gradient.addColorStop(0,'#fff');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;
  }
  ctx.fillRect(0,0,w,h);
 }
 ctx.resetTransform();ctx.filter='none';ctx.globalCompositeOperation='source-over';return ctx.getImageData(0,0,width,height).data;
}
export function applyLocalAdjustments(source:Uint8ClampedArray,width:number,height:number,locals:LocalAdjustment[],geometry:ImageGeometry){
 let out=source;for(const local of locals){if(!local.enabled||local.amount===0||!Object.values(local.recipe).some(Boolean))continue;
  const mask=rasterizeMask(local.mask,width,height,geometry),changed=applyRecipeToPixels(out,{...emptyRecipe,...local.recipe},width,height);
  out=blendMaskedPixels(out,changed,mask,local.amount/100,local.mask.inverted);
 }return out;
}
export function applyPortraitAdjustments(source:Uint8ClampedArray,width:number,height:number,portraits:PortraitRegion[],geometry:ImageGeometry){
 let out=source;for(const region of portraits){if(!region.enabled||!Object.values(region.recipe).some(Boolean))continue;
  const mask=rasterizeMask(region.mask,width,height,geometry);const changed=applyPortraitRecipe(out,width,height,region.recipe);out=blendMaskedPixels(out,changed,mask);
 }return out;
}
export function layerMetrics(layer:CreativeLayer,width:number,height:number,ctx:DrawingContext){
 const short=Math.min(width,height);
 if(layer.type==='sticker'){const w=short*.35*layer.scale;return {width:w,height:w*layer.height/layer.width,fontSize:0,lineHeight:0};}
 const fontSize=layer.fontSize/1000*short*layer.scale;ctx.font=`${fontSize}px "${layer.fontFamily}"`;
 const lines=layer.text.split('\n'),lineHeight=fontSize*1.25,stroke=layer.strokeWidth/1000*short*layer.scale;
 return {width:Math.max(fontSize,...lines.map(line=>ctx.measureText(line).width))+stroke*2,height:lines.length*lineHeight+stroke*2,fontSize,lineHeight};
}
const loadAsset=async(url:string)=>{const image=new Image();image.src=url;await image.decode();return image;};
export async function drawCreativeLayers(canvas:HTMLCanvasElement,layers:CreativeLayer[],assets:AssetUrls){
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建创作画布');
 for(const layer of layers){if(!layer.visible||layer.deletedAt)continue;const metrics=layerMetrics(layer,canvas.width,canvas.height,ctx);ctx.save();ctx.translate(layer.x*canvas.width,layer.y*canvas.height);ctx.rotate(layer.rotation*Math.PI/180);ctx.globalAlpha=Math.max(0,Math.min(1,layer.opacity));
  try{
   if(layer.type==='sticker'){if(!assets[layer.assetId])throw new Error(`贴纸「${layer.name}」的素材缺失，请恢复草稿或重新导入`);const image=await loadAsset(assets[layer.assetId]);ctx.drawImage(image,-metrics.width/2,-metrics.height/2,metrics.width,metrics.height);}
   else{ctx.font=`${metrics.fontSize}px "${layer.fontFamily}"`;ctx.textAlign=layer.align;ctx.textBaseline='middle';ctx.fillStyle=layer.color;ctx.strokeStyle=layer.strokeColor;ctx.lineWidth=layer.strokeWidth/1000*Math.min(canvas.width,canvas.height)*layer.scale;ctx.lineJoin='round';
    const lines=layer.text.split('\n'),x=layer.align==='left'?-metrics.width/2:layer.align==='right'?metrics.width/2:0;
    lines.forEach((line,index)=>{const y=(index-(lines.length-1)/2)*metrics.lineHeight;if(ctx.lineWidth>0&&layer.strokeWidth>0)ctx.strokeText(line,x,y);ctx.fillText(line,x,y);});
   }
  }finally{ctx.restore();}
 }return canvas;
}
export function addBorder(canvas:HTMLCanvasElement,border:BorderState=defaultBorder){
 if(!border.enabled)return canvas;const size=borderLayout(canvas.width,canvas.height,border);assertSafePixelCount(size.width,size.height);const out=document.createElement('canvas');out.width=size.width;out.height=size.height;const ctx=out.getContext('2d');if(!ctx)throw new Error('无法创建边框画布');ctx.fillStyle=border.color;ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(canvas,size.x,size.y);return out;
}
