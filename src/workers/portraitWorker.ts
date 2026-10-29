// Self-contained function serialized into a classic worker. No captured imports or variables.
export function portraitWorkerMain(){
  const scope=self as unknown as DedicatedWorkerGlobalScope & {exports:Record<string,any>};
  scope.onmessage=async(event:MessageEvent<{image:ImageBitmap;base:string}>)=>{
    const {image,base}=event.data;let detector:any;
    try{
      scope.exports={};importScripts(`${base}vision_bundle.js`);
      const {FaceLandmarker,FilesetResolver}=scope.exports;
      detector=await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(`${base}wasm`),{
        baseOptions:{modelAssetPath:`${base}face_landmarker.task`,delegate:'CPU'},runningMode:'IMAGE',numFaces:5,
        outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false,
      });
      const result=detector.detect(image);
      scope.postMessage({faces:result.faceLandmarks.map((landmarks:{x:number;y:number}[],index:number)=>({id:`face-${index+1}`,landmarks:landmarks.map(({x,y})=>({x,y}))}))});
    }catch{scope.postMessage({error:'本地模型加载或识别失败，可重试或手动涂抹皮肤区域'});}
    finally{detector?.close();image.close();}
  };
}
