import {useEffect,useRef,useState} from 'react';
import type {CreativeLayer,Point} from '../domain/creative';
import {layerMetrics} from '../lib/creativeRender';
type Props={layers:CreativeLayer[];selectedId:string|null;onSelect:(id:string)=>void;onChange:(layer:CreativeLayer)=>void;onStart:()=>void;onEnd:()=>void;onCancel:()=>void};
export default function CreativeOverlay({layers,selectedId,onSelect,onChange,onStart,onEnd,onCancel}:Props){
 const root=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:1,height:1});
 const drag=useRef<{pointerId:number;layer:CreativeLayer;point:Point;mode:string}|null>(null);
 const measure=(clientX:number,clientY:number)=>{const box=root.current!.getBoundingClientRect();return {x:(clientX-box.x)/box.width,y:(clientY-box.y)/box.height};};
 useEffect(()=>{const element=root.current;if(!element)return;const update=()=>setSize({width:element.clientWidth,height:element.clientHeight});update();const observer=new ResizeObserver(update);observer.observe(element);return()=>observer.disconnect();},[]);
 const context=document.createElement('canvas').getContext('2d');
 return <div ref={root} className="creative-overlay" aria-label="创作图层画布"
  onPointerDown={event=>{if(!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;const target=(event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]');const layer=layers.find(item=>item.id===target?.dataset.layerId);if(!layer)return;event.preventDefault();onSelect(layer.id);onStart();drag.current={pointerId:event.pointerId,layer,point:measure(event.clientX,event.clientY),mode:(event.target as HTMLElement).dataset.handle||'move'};event.currentTarget.setPointerCapture(event.pointerId);}}
  onPointerMove={event=>{const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;const point=measure(event.clientX,event.clientY),{layer,point:start,mode}=active;let next:CreativeLayer;
   if(mode==='rotate'){const angle=(p:Point)=>Math.atan2((p.y-layer.y)*size.height,(p.x-layer.x)*size.width);next={...layer,rotation:Math.round(layer.rotation+(angle(point)-angle(start))*180/Math.PI)};}
   else if(mode==='scale'){const distance=(p:Point)=>Math.hypot((p.x-layer.x)*size.width,(p.y-layer.y)*size.height);next={...layer,scale:Math.max(.1,Math.min(8,layer.scale*distance(point)/Math.max(1,distance(start))))};}
   else next={...layer,x:Math.max(0,Math.min(1,layer.x+point.x-start.x)),y:Math.max(0,Math.min(1,layer.y+point.y-start.y))};onChange(next);}}
  onPointerUp={event=>{if(drag.current?.pointerId!==event.pointerId)return;drag.current=null;onEnd();}}
  onPointerCancel={()=>{if(drag.current){drag.current=null;onCancel();}}}>
  {context?layers.filter(layer=>layer.visible&&!layer.deletedAt).map(layer=>{const metrics=layerMetrics(layer,size.width,size.height,context),selected=layer.id===selectedId;return <div role="button" tabIndex={0} aria-label={`选择图层 ${layer.name}`} key={layer.id} data-layer-id={layer.id} className={`layer-target ${selected?'selected':''}`} style={{left:`${layer.x*100}%`,top:`${layer.y*100}%`,width:Math.max(20,metrics.width),height:Math.max(20,metrics.height),transform:`translate(-50%,-50%) rotate(${layer.rotation}deg)`}} onClick={()=>onSelect(layer.id)} onKeyDown={event=>{if(event.key==='Enter')onSelect(layer.id);}}>{selected?<><button data-handle="scale" className="layer-scale" aria-label="缩放选中图层"/><button data-handle="rotate" className="layer-rotate" aria-label="旋转选中图层">↻</button></>:null}</div>;}):null}
 </div>;
}
