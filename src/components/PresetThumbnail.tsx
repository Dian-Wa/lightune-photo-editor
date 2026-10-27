import { useEffect, useState } from 'react';
import type { Preset } from '../domain/recipe';
import { createPresetThumbnail } from './PhotoCanvas';
export default function PresetThumbnail({imageUrl,preset}:{imageUrl:string;preset:Preset}){
  const [preview,setPreview]=useState(imageUrl);
  useEffect(()=>{let active=true;const timer=window.setTimeout(()=>{
    void createPresetThumbnail(imageUrl,preset.recipe,undefined,undefined,preset.filter).then(url=>{if(active)setPreview(url);}).catch(()=>{if(active)setPreview(imageUrl);});
  },100);return()=>{active=false;window.clearTimeout(timer);};},[imageUrl,preset.recipe,preset.filter]);
  return <img src={preview} alt=""/>;
}
