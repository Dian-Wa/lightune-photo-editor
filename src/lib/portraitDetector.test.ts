import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {detectPortraits} from './portraitDetector';
class FakeWorker {
 static instances:FakeWorker[]=[];onmessage:((event:{data:unknown})=>void)|null=null;onerror:((event:unknown)=>void)|null=null;
 terminate=vi.fn();postMessage=vi.fn();constructor(){FakeWorker.instances.push(this);}
}
afterEach(()=>{vi.unstubAllGlobals();FakeWorker.instances=[];});
beforeEach(()=>{vi.stubGlobal('OffscreenCanvas',class{});vi.stubGlobal('URL',Object.assign(class extends URL{},{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}}));});
describe('local portrait detector boundary',()=>{
 it('returns source-normalized faces and never requires a network API',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const bitmap={close:vi.fn()} as unknown as ImageBitmap;
  const result=detectPortraits(bitmap,new AbortController().signal);const worker=FakeWorker.instances[0];
  worker.onmessage!({data:{faces:[{id:'face-1',landmarks:[{x:.2,y:.3}]}]}});
  await expect(result).resolves.toEqual([{id:'face-1',landmarks:[{x:.2,y:.3}]}]);
 });
 it('cancels promptly and ignores a late result',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const controller=new AbortController();const result=detectPortraits({close:vi.fn()} as unknown as ImageBitmap,controller.signal);
  const outcome=expect(result).rejects.toThrow('取消');controller.abort();FakeWorker.instances[0].onmessage?.({data:{faces:[]}});await outcome;
 });
 it('fails in Chinese and leaves manual editing available',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const result=detectPortraits({close:vi.fn()} as unknown as ImageBitmap,new AbortController().signal);
  FakeWorker.instances[0].onmessage!({data:{error:'模型加载失败，可手动涂抹皮肤区域'}});await expect(result).rejects.toThrow('手动');
 });
});
