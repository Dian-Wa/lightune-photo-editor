import {useEffect,useRef,useState} from 'react';
import {outputToSource,type ImageGeometry,type LocalAdjustment,type LocalMask,type MaskStroke,type Point} from '../domain/creative';
import {rasterizeMask} from '../lib/creativeRender';
type Props={local:LocalAdjustment|null;geometry:ImageGeometry;brushSize:number;feather:number;erase:boolean;showMask:boolean;onChange:(mask:LocalMask)=>void;onStart:()=>void;onEnd:()=>void;onCancel:()=>void;ariaLabel?:string};
export default function MaskOverlay({local,geometry,brushSize,feather,erase,showMask,onChange,onStart,onEnd,onCancel,ariaLabel='局部蒙版画布'}:Props){
 const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),[size,setSize]=useState({width:1,height:1});
 const drag=useRef<{pointerId:number;mask:LocalMask;stroke:MaskStroke;start:Point}|null>(null);
 const point=(clientX:number,clientY:number)=>{const rect=root.current!.getBoundingClientRect();const raw=outputToSource({x:(clientX-rect.x)/rect.width,y:(clientY-rect.y)/rect.height},geometry.sourceWidth,geometry.sourceHeight,geometry.composition);return {x:Math.max(0,Math.min(1,raw.x)),y:Math.max(0,Math.min(1,raw.y))};};
 useEffect(()=>{const element=root.current;if(!element)return;const update=()=>setSize({width:Math.max(1,Math.round(element.clientWidth)),height:Math.max(1,Math.round(element.clientHeight))});update();const observer=new ResizeObserver(update);observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{const element=canvas.current;if(!element)return;element.width=size.width;element.height=size.height;const ctx=element.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,element.width,element.height);if(!local||!showMask)return;const data=rasterizeMask(local.mask,element.width,element.height,geometry);for(let i=0;i<data.length;i+=4){const alpha=(local.mask.inverted?255-data[i+3]:data[i+3])*.45;data[i]=255;data[i+1]=95;data[i+2]=80;data[i+3]=alpha;}ctx.putImageData(new ImageData(data,element.width,element.height),0,0);},[local?.mask,showMask,size,geometry.sourceWidth,geometry.sourceHeight,geometry.composition]);
 const update=(p:Point)=>{const active=drag.current;if(!active)return;const mask=active.mask;if(mask.type==='brush'){active.stroke.points.push(p);onChange({...mask,strokes:[...mask.strokes,{...active.stroke,points:[...active.stroke.points]}]});}
  else if(mask.type==='linear')onChange({...mask,start:active.start,end:p,feather});
  else onChange({...mask,start:active.start,radius:Math.max(.01,Math.hypot((p.x-active.start.x)*geometry.sourceWidth,(p.y-active.start.y)*geometry.sourceHeight)/Math.min(geometry.sourceWidth,geometry.sourceHeight)),feather});};
 return <div className="mask-overlay" ref={root} aria-label={ariaLabel}
  onPointerDown={event=>{if(!local||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;event.preventDefault();const p=point(event.clientX,event.clientY);onStart();drag.current={pointerId:event.pointerId,mask:local.mask,start:p,stroke:{points:[],erase,size:brushSize,feather}};update(p);event.currentTarget.setPointerCapture(event.pointerId);}}
  onPointerMove={event=>{if(drag.current?.pointerId===event.pointerId)update(point(event.clientX,event.clientY));}}
  onPointerUp={event=>{if(drag.current?.pointerId===event.pointerId){update(point(event.clientX,event.clientY));drag.current=null;onEnd();}}}
  onPointerCancel={()=>{if(drag.current){drag.current=null;onCancel();}}}><canvas ref={canvas}/>{!local?<span>请先新建一个局部区域</span>:null}</div>;
}
