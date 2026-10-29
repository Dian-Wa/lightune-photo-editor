import type { Composition } from './editorDocument';
import { straightenScale, transformedSize } from './editorDocument';
import { cropSourceRect } from '../lib/crop';
export type Point={x:number;y:number};
type LayerBase={id:string;name:string;x:number;y:number;scale:number;rotation:number;opacity:number;visible:boolean;deletedAt?:string};
export type TextLayer=LayerBase&{type:'text';text:string;fontFamily:string;fontSize:number;color:string;align:'left'|'center'|'right';strokeColor:string;strokeWidth:number};
export type StickerLayer=LayerBase&{type:'sticker';assetId:string;width:number;height:number};
export type CreativeLayer=TextLayer|StickerLayer;
export type BorderState={enabled:boolean;color:string;padding:number;ratio:number|null};
export const defaultBorder:BorderState={enabled:false,color:'#ffffff',padding:.04,ratio:null};
export type MaskStroke={points:Point[];erase:boolean;size:number;feather:number};
export type LocalMask={type:'brush'|'linear'|'radial';strokes:MaskStroke[];start:Point;end:Point;radius:number;feather:number;inverted:boolean};
export const localKeys=['exposure','contrast','saturation','temperature','clarity','softness'] as const;
export type LocalRecipe=Record<typeof localKeys[number],number>;
export type LocalAdjustment={id:string;name:string;enabled:boolean;amount:number;mask:LocalMask;recipe:LocalRecipe};
export type CreativeState={layers?:CreativeLayer[];locals?:LocalAdjustment[];border?:BorderState};
export type ImageGeometry={sourceWidth:number;sourceHeight:number;composition:Composition};
export type AssetUrls=Record<string,string>;
export const fonts=['Microsoft YaHei','SimSun','Arial','Georgia'] as const;
export function createTextLayer(id:string):TextLayer{return {id,name:'文字',type:'text',text:'写下你的故事',x:.5,y:.5,scale:1,rotation:0,opacity:1,visible:true,fontFamily:'Microsoft YaHei',fontSize:64,color:'#ffffff',align:'center',strokeColor:'#000000',strokeWidth:0};}
export function createLocal(id:string,type:LocalMask['type']):LocalAdjustment{return {id,name:type==='brush'?'画笔区域':type==='linear'?'渐变区域':'径向区域',enabled:true,amount:100,recipe:{exposure:0,contrast:0,saturation:0,temperature:0,clarity:0,softness:0},mask:{type,strokes:[],start:{x:.3,y:.3},end:{x:.7,y:.7},radius:.25,feather:.6,inverted:false}};}
export function recycleLayer<T extends CreativeLayer>(layer:T,stamp:string):T{return {...layer,deletedAt:stamp};}
export function duplicateLayer<T extends CreativeLayer>(layer:T,id:string):T{return {...layer,id,name:`${layer.name} 副本`,x:Math.min(.95,layer.x+.03),y:Math.min(.95,layer.y+.03),deletedAt:undefined};}
export function moveLayer(layers:CreativeLayer[],id:string,direction:number){const index=layers.findIndex(layer=>layer.id===id),next=[...layers];const target=Math.max(0,Math.min(next.length-1,index+direction));if(index>=0)[next[index],next[target]]=[next[target],next[index]];return next;}
export function borderLayout(width:number,height:number,border:BorderState=defaultBorder){
 const padding=border.enabled?Math.round(Math.min(width,height)*Math.max(0,Math.min(.2,border.padding))):0;
 let w=width+2*padding,h=height+2*padding;
 if(border.enabled&&border.ratio&&border.ratio>0){if(w/h<border.ratio)w=Math.ceil(h*border.ratio);else h=Math.ceil(w/border.ratio);}
 return {width:w,height:h,x:Math.floor((w-width)/2),y:Math.floor((h-height)/2),contentWidth:width,contentHeight:height};
}
export function sourceToOutput(point:Point,width:number,height:number,composition:Composition):Point{
 const size=transformedSize(width,height,composition),crop=cropSourceRect(size.width,size.height,composition.crop);
 let x=(point.x-.5)*width,y=(point.y-.5)*height;
 const a=composition.rotation*Math.PI/2,b=composition.straighten*Math.PI/180;
 [x,y]=[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];x*=composition.flipX?-1:1;y*=composition.flipY?-1:1;
 const zoom=straightenScale(size.width,size.height,composition.straighten);[x,y]=[(x*Math.cos(b)-y*Math.sin(b))*zoom,(x*Math.sin(b)+y*Math.cos(b))*zoom];
 return {x:(x+size.width/2-crop.x)/crop.width,y:(y+size.height/2-crop.y)/crop.height};
}
export function outputToSource(point:Point,width:number,height:number,composition:Composition):Point{
 const size=transformedSize(width,height,composition),crop=cropSourceRect(size.width,size.height,composition.crop),zoom=straightenScale(size.width,size.height,composition.straighten);
 let x=(crop.x+point.x*crop.width-size.width/2)/zoom,y=(crop.y+point.y*crop.height-size.height/2)/zoom;
 const a=-composition.straighten*Math.PI/180,b=-composition.rotation*Math.PI/2;
 [x,y]=[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];x*=composition.flipX?-1:1;y*=composition.flipY?-1:1;
 [x,y]=[x*Math.cos(b)-y*Math.sin(b),x*Math.sin(b)+y*Math.cos(b)];return {x:x/width+.5,y:y/height+.5};
}
export function blendMaskedPixels(source:Uint8ClampedArray,changed:Uint8ClampedArray,mask:Uint8ClampedArray,amount=1,inverted=false){
 const out=new Uint8ClampedArray(source);for(let i=0;i<out.length;i+=4){const weight=(inverted?1-mask[i+3]/255:mask[i+3]/255)*Math.max(0,Math.min(1,amount));for(let c=0;c<3;c++)out[i+c]=Math.round(source[i+c]+(changed[i+c]-source[i+c])*weight);}return out;
}
