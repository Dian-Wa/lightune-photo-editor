import {useEffect,useRef,useState,type ReactNode} from 'react';
export type PreviewFrame={width:number;height:number;content:{x:number;y:number;width:number;height:number}};
export default function EditorSurface({frame,children}:{frame:PreviewFrame;children:ReactNode}){
 const root=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:0,height:0});
 useEffect(()=>{const node=root.current;if(!node)return;const update=()=>setSize({width:node.clientWidth,height:node.clientHeight});update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();},[]);
 const scale=frame.width&&frame.height?Math.min(size.width/frame.width,size.height/frame.height):0,w=frame.width*scale,h=frame.height*scale;
 return <div className="editor-overlay" ref={root} onPointerDown={event=>event.stopPropagation()} onPointerMove={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onPointerCancel={event=>event.stopPropagation()}>
  {scale>0?<div className="editor-surface" style={{left:(size.width-w)/2+w*frame.content.x,top:(size.height-h)/2+h*frame.content.y,width:w*frame.content.width,height:h*frame.content.height}}>{children}</div>:null}
 </div>;
}
