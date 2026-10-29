import type {DetectedFace} from '../domain/portrait';
import {portraitWorkerMain} from '../workers/portraitWorker';

/** A disposable classic worker is intentional: MediaPipe's WASM loader uses importScripts. */
export async function detectPortraits(image:ImageBitmap,signal:AbortSignal):Promise<DetectedFace[]> {
  if(signal.aborted){image.close();throw new Error('已取消人脸识别');}
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'){image.close();throw new Error('当前浏览器不支持本地识别，请手动涂抹皮肤区域');}
  const url=URL.createObjectURL(new Blob([`(${portraitWorkerMain.toString()})()`],{type:'text/javascript'}));
  let worker:Worker|undefined;
  try{
    worker=new Worker(url);
    return await new Promise((resolve,reject)=>{
      const cancel=()=>{finish();reject(new Error('已取消人脸识别'));};
      const timer=setTimeout(()=>{finish();reject(new Error('本地模型加载或识别超时，可重试或手动涂抹皮肤区域'));},60000);
      const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);};
      worker!.onmessage=event=>{finish();event.data.error?reject(new Error(event.data.error)):resolve(event.data.faces||[]);};
      worker!.onerror=()=>{finish();reject(new Error('本地模型运行失败，可手动涂抹皮肤区域'));};
      signal.addEventListener('abort',cancel,{once:true});
      const base=new URL(`${import.meta.env.BASE_URL}models/portrait/`,window.location.href).href;
      worker!.postMessage({image,base},[image]);
    });
  }finally{worker?.terminate();URL.revokeObjectURL(url);image.close();}
}
