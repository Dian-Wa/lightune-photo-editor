import type {LocalMask,Point} from './creative';
export type DetectedFace={id:string;landmarks:Point[]};
export type PortraitRecipe={smooth:number;brightness:number;temperature:number;tint:number;saturation:number};
export type PortraitMask=LocalMask & {type:'brush';outline:Point[];exclusions:Point[][]};
export type PortraitRegion={id:string;name:string;enabled:boolean;mask:PortraitMask;recipe:PortraitRecipe};
export const neutralPortrait:PortraitRecipe={smooth:0,brightness:0,temperature:0,tint:0,saturation:0};
// MediaPipe canonical face topology, ordered closed contours (not identity features).
const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const holes=[
 [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],
 [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466],
 [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185],
 [70,63,105,66,107,55,65,52,53,46], [336,296,334,293,300,276,283,282,295,285],
];
export function manualPortraitRegion(id:string):PortraitRegion{return {id,name:'手动皮肤区域',enabled:true,recipe:{...neutralPortrait},mask:{type:'brush',outline:[],exclusions:[],strokes:[],start:{x:0,y:0},end:{x:1,y:1},radius:.2,feather:.3,inverted:false}};}
export function createPortraitRegion(face:DetectedFace):PortraitRegion{
 if(face.landmarks.length<468||face.landmarks.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('人脸关键点无效，请手动修正');
 const polygon=(indices:number[],expand=1)=>{const points=indices.map(i=>face.landmarks[i]);const cx=points.reduce((s,p)=>s+p.x,0)/points.length,cy=points.reduce((s,p)=>s+p.y,0)/points.length;return points.map(p=>({x:Math.max(0,Math.min(1,cx+(p.x-cx)*expand)),y:Math.max(0,Math.min(1,cy+(p.y-cy)*expand))}));};
 const region=manualPortraitRegion(face.id);return {...region,name:'人脸皮肤',mask:{...region.mask,outline:polygon(oval),exclusions:holes.map(indices=>polygon(indices,1.18))}};
}
