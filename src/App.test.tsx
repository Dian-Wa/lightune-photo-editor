import { cleanup, fireEvent, render as mount, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as presetStore from './lib/presetStore';
const render=(element:React.ReactNode)=>{const result=mount(element);fireEvent.click(screen.getByRole('button',{name:'体验样片'}));fireEvent.click(within(screen.getByLabelText('调整参数面板')).getByRole('button',{name:'全部'}));return result;};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver',class {observe(){}unobserve(){}disconnect(){}});
  const values: Record<string, string> = {};
  vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] || null,
    setItem: (key: string, value: string) => { values[key] = value; }, toJSON: () => values });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('photo editor workspace', () => {
  it('groups a text editing session into one undo step',()=>{
    render(<App/>);
    fireEvent.click(screen.getByRole('tab',{name:'更多'}));
    fireEvent.click(screen.getByRole('button',{name:'文字 · 贴纸 · 边框'}));
    fireEvent.click(screen.getByRole('button',{name:'添加文字'}));
    const text=screen.getByLabelText('文字内容');
    fireEvent.pointerDown(text);fireEvent.focus(text);fireEvent.pointerUp(text);
    fireEvent.change(text,{target:{value:'第一句'}});fireEvent.change(text,{target:{value:'完整文字'}});fireEvent.blur(text);
    fireEvent.click(screen.getByRole('button',{name:'撤销'}));
    expect(screen.getByLabelText('文字内容')).toHaveValue('写下你的故事');
  });
  it('hides comparison during creative editing and restores its position afterward',()=>{
    const {container}=render(<App/>);
    fireEvent.change(screen.getByRole('slider',{name:'前后对比位置'}),{target:{value:'80'}});
    fireEvent.click(screen.getByRole('tab',{name:'更多'}));
    fireEvent.click(screen.getByRole('button',{name:'文字 · 贴纸 · 边框'}));
    expect((container.querySelector('.original-layer') as HTMLElement).style.clipPath).toBe('inset(0 100% 0 0)');
    fireEvent.click(screen.getByRole('button',{name:'取消创作'}));
    expect((container.querySelector('.original-layer') as HTMLElement).style.clipPath).toBe('inset(0 20% 0 0)');
  });
  it('cancels newly added creative content without changing the photo recipe',()=>{
    render(<App/>);
    fireEvent.change(screen.getByLabelText('亮度'),{target:{value:'17'}});
    fireEvent.click(screen.getByRole('tab',{name:'更多'}));
    fireEvent.click(screen.getByRole('button',{name:'文字 · 贴纸 · 边框'}));
    fireEvent.click(screen.getByRole('button',{name:'添加文字'}));
    expect(screen.getByLabelText('文字内容')).toHaveValue('写下你的故事');
    fireEvent.click(screen.getByRole('button',{name:'取消创作'}));
    expect(screen.queryByLabelText('文字内容')).not.toBeInTheDocument();
    expect(screen.getByLabelText('亮度')).toHaveValue('17');
  });
  it('creates a local region with six independent adjustments and undoes it',()=>{
    render(<App/>);
    fireEvent.click(screen.getByRole('tab',{name:'更多'}));fireEvent.click(screen.getByRole('button',{name:'局部修图'}));
    fireEvent.click(screen.getByRole('button',{name:'新建径向'}));
    expect(screen.getByRole('slider',{name:'局部曝光'})).toHaveValue('0');
    fireEvent.change(screen.getByRole('slider',{name:'局部曝光'}),{target:{value:'38'}});
    fireEvent.click(screen.getByRole('button',{name:'撤销'}));
    expect(screen.getByRole('slider',{name:'局部曝光'})).toHaveValue('0');
    expect(screen.getByLabelText('曝光')).toHaveValue('0');
  });
  it('retains current editing when draft storage is full',async()=>{
    vi.spyOn(presetStore,'saveDraft').mockRejectedValue(new Error('本地空间不足'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3]))));
    render(<App/>);
    fireEvent.change(screen.getByLabelText('亮度'),{target:{value:'29'}});
    fireEvent.click(screen.getByRole('tab',{name:'更多'}));
    fireEvent.click(screen.getByRole('button',{name:'保存草稿'}));
    await waitFor(()=>expect(screen.getByText('草稿保存失败，当前编辑已保留：本地空间不足')).toBeInTheDocument());
    expect(screen.getByLabelText('亮度')).toHaveValue('29');
  });
  it('does not apply an AI response after cancelling its tool',async()=>{
    let respond!:(response:Response)=>void;
    vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{respond=resolve;})));
    render(<App/>);
    fireEvent.click(screen.getByRole('tab',{name:'AI'}));
    fireEvent.change(screen.getByLabelText('AI 接口地址'),{target:{value:'https://example.com/v1'}});
    fireEvent.change(screen.getByLabelText('AI API 密钥'),{target:{value:'test-only'}});
    fireEvent.change(screen.getByLabelText('AI 模型名称'),{target:{value:'test-model'}});
    fireEvent.click(screen.getByRole('button',{name:'生成配方'}));
    fireEvent.click(screen.getByRole('button',{name:'取消本工具调整'}));
    respond(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({name:'不应应用',description:'取消后的结果',recipe:{brightness:77}})}}]})));
    await waitFor(()=>expect(screen.getByRole('button',{name:'生成配方'})).toBeEnabled());
    expect(screen.getByLabelText('亮度')).toHaveValue('0');
  });
  it('opens a lightweight home before the editor',()=>{
    mount(<App/>);
    expect(screen.getByRole('button',{name:'导入照片'})).toBeInTheDocument();
    expect(screen.queryByRole('region',{name:'照片编辑画布'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'体验样片'}));
    expect(screen.getByRole('region',{name:'照片编辑画布'})).toBeInTheDocument();
  });
  it('cancels a tool back to its entry state and keeps template switching undoable',()=>{
    render(<App/>);
    fireEvent.click(screen.getByRole('tab',{name:'调节'}));
    fireEvent.change(screen.getByLabelText('亮度'),{target:{value:'31'}});
    fireEvent.click(screen.getByRole('button',{name:'取消本工具调整'}));
    expect(screen.getByLabelText('亮度')).toHaveValue('0');
    fireEvent.click(screen.getByRole('button',{name:'暖肤人像 柔暖肤色与轻微柔化'}));
    expect(screen.getByRole('slider',{name:'滤镜强度'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'撤销'}));
    expect(screen.getByRole('slider',{name:'滤镜强度'})).toBeDisabled();
  });
  it('commits a continuous slider gesture as one undo step',()=>{
    render(<App/>);
    const slider=screen.getByLabelText('亮度');
    fireEvent.pointerDown(slider);
    fireEvent.change(slider,{target:{value:'10'}});fireEvent.change(slider,{target:{value:'30'}});
    fireEvent.pointerUp(slider);
    expect(slider).toHaveValue('30');
    fireEvent.click(screen.getByRole('button',{name:'撤销'}));
    expect(slider).toHaveValue('0');
  });
  it('offers direct AI configuration on Pages while keeping manual editing usable', () => {
    vi.stubEnv('VITE_STATIC_MODE', 'true');
    render(<App />);
    expect(screen.getByRole('button', { name: '生成配方' })).toBeEnabled();
    expect(screen.getByLabelText('AI API 密钥')).toHaveAttribute('type', 'password');
    fireEvent.change(screen.getByLabelText('亮度'), { target: { value: '25' } });
    expect(screen.getByLabelText('亮度')).toHaveValue('25');
    expect(screen.getByText(/浏览器直连你配置的 AI 服务/)).toBeInTheDocument();
  });
  it('generates a direct recipe on Pages and never persists the API key', async () => {
    vi.stubEnv('VITE_STATIC_MODE', 'true');
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ name: '暖调', description: '自然暖色', recipe: { temperature: 42 } }) } }] })));
    vi.stubGlobal('fetch', request);
    render(<App />);
    fireEvent.change(screen.getByLabelText('AI 接口地址'), { target: { value: 'https://example.com/v1' } });
    fireEvent.change(screen.getByLabelText('AI API 密钥'), { target: { value: 'test-secret' } });
    fireEvent.change(screen.getByLabelText('AI 模型名称'), { target: { value: 'test-model' } });
    fireEvent.click(screen.getByRole('button', { name: '记住地址和模型' }));
    expect(JSON.stringify(localStorage)).not.toContain('test-secret');
    fireEvent.click(screen.getByRole('button', { name: '生成配方' }));
    await waitFor(() => expect(screen.getByLabelText('色温')).toHaveValue('42'));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('https://example.com/v1/chat/completions');
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer test-secret');
    expect(screen.getByText('有未保存的调整')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByLabelText('色温')).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: '清空密钥' }));
    expect(screen.getByLabelText('AI API 密钥')).toHaveValue('');
  });
  it('shows Chinese explanations even when an older proxy returns English parameter names', async () => {
    vi.stubEnv('VITE_STATIC_MODE', 'false');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: '清透日系胶片肖像',
      description: '可根据实际画面调整strength', warnings: ['可用grain参数增强质感'], recipe: { strength: 80, grain: 10 } }))));
    render(<App />);
    fireEvent.change(screen.getByLabelText('AI 调用方式'), { target: { value: 'proxy' } });
    fireEvent.click(screen.getByRole('button', { name: '生成配方' }));
    await waitFor(() => expect(screen.getByText(/可用颗粒参数增强质感/)).toBeInTheDocument());
    expect(document.querySelector('.ai-result')?.textContent).toContain('调整风格强度');
    expect(document.querySelector('.ai-result')?.textContent).not.toMatch(/\p{Script=Latin}/u);
  });
  it('renders the complete local editing workflow', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /导入照片/ })).toBeInTheDocument();
    expect(screen.getByText('清透自然')).toBeInTheDocument();
    expect(screen.getByText('AI 调色灵感')).toBeInTheDocument();
    expect(screen.getByLabelText('亮度')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
  });

  it('marks the recipe as edited after a manual adjustment', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('亮度'), { target: { value: '32' } });
    expect(screen.getByText('有未保存的调整')).toBeInTheDocument();
  });

  it('offers a hold-to-view-original control', () => {
    render(<App />);
    const control = screen.getByRole('button', { name: '按住查看原图' });
    fireEvent.pointerDown(control);
    expect(control).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerUp(control);
    expect(control).toHaveAttribute('aria-pressed', 'false');
  });

  it('edits a chosen HSL color and preserves it through undo and redo', () => {
    render(<App />);
    fireEvent.click(screen.getByText('单色细调 · HSL'));
    fireEvent.click(screen.getByRole('button', { name: '选择橙色' }));
    const slider = screen.getByRole('slider', { name: '橙色饱和度' });
    fireEvent.change(slider, { target: { value: '-32' } });
    expect(slider).toHaveValue('-32');
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(slider).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: '重做' }));
    expect(slider).toHaveValue('-32');
  });

  it('bypasses and resets HSL while retaining unrelated exposure', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('曝光'), { target: { value: '24' } });
    fireEvent.click(screen.getByText('单色细调 · HSL'));
    const slider = screen.getByRole('slider', { name: '红色明度' });
    fireEvent.change(slider, { target: { value: '30' } });
    const toggle = screen.getByRole('switch', { name: '启用单色细调 · HSL' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(slider).toBeDisabled();
    fireEvent.click(toggle);
    expect(slider).toHaveValue('30');
    fireEvent.click(screen.getByRole('button', { name: '重置单色细调 · HSL' }));
    expect(slider).toHaveValue('0');
    expect(screen.getByLabelText('曝光')).toHaveValue('24');
  });

  it('edits curve outputs numerically and using the keyboard', () => {
    render(<App />);
    fireEvent.click(screen.getByText('曲线', { exact: true }));
    const output = screen.getByRole('spinbutton', { name: '曲线输出值' });
    fireEvent.change(output, { target: { value: '174' } });
    fireEvent.blur(output);
    const point = screen.getByRole('slider', { name: 'RGB曲线控制点128' });
    expect(point).toHaveAttribute('aria-valuenow', '174');
    fireEvent.keyDown(point, { key: 'ArrowUp' });
    expect(point).toHaveAttribute('aria-valuenow', '175');
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(point).toHaveAttribute('aria-valuenow', '174');
    fireEvent.click(screen.getByRole('button', { name: '蓝通道' }));
    expect(screen.getByRole('spinbutton', { name: '曲线输出值' })).toHaveValue(128);
    fireEvent.click(screen.getByRole('button', { name: '重置曲线' }));
    fireEvent.click(screen.getByRole('button', { name: 'RGB通道' }));
    expect(screen.getByRole('spinbutton', { name: '曲线输出值' })).toHaveValue(128);
  });

  it('accepts precise numeric input and restores an empty entry', () => {
    render(<App />);
    let numeric = screen.getByRole('spinbutton', { name: '亮度数值' });
    fireEvent.change(numeric, { target: { value: '45' } });
    fireEvent.blur(numeric);
    expect(screen.getByLabelText('亮度')).toHaveValue('45');
    numeric = screen.getByRole('spinbutton', { name: '亮度数值' });
    fireEvent.change(numeric, { target: { value: '' } });
    fireEvent.blur(numeric);
    expect(numeric).toHaveValue(45);
  });

  it('creates a template from current adjustments and updates the same template later', async () => {
    const saved = vi.spyOn(presetStore, 'savePreset').mockResolvedValue(undefined);
    vi.spyOn(presetStore, 'saveSession').mockResolvedValue(undefined);
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: '新建模板' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('亮度'), { target: { value: '31' } });
    fireEvent.click(screen.getByRole('button', { name: '新建模板' }));
    expect(screen.getByRole('dialog', { name: '新建模板' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '我的暖调' } });
    fireEvent.click(screen.getByRole('button', { name: '保存新模板' }));
    await waitFor(() => expect(screen.getByText('已保存新模板「我的暖调」')).toBeInTheDocument());
    const created = saved.mock.calls[0][0];
    expect(created.recipe.brightness).toBe(31);
    expect(created.source).toBe('manual');
    fireEvent.change(screen.getByLabelText('亮度'), { target: { value: '46' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为模板' }));
    await waitFor(() => expect(screen.getByText('已更新「我的暖调」')).toBeInTheDocument());
    expect(saved.mock.calls[1][0].id).toBe(created.id);
    expect(saved.mock.calls[1][0].recipe.brightness).toBe(46);
  });

  it('copies current edits into a selected new template and resets the built-in separately', async () => {
    const saved = vi.spyOn(presetStore, 'savePreset').mockResolvedValue(undefined);
    vi.spyOn(presetStore, 'saveSession').mockResolvedValue(undefined);
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: '复制 清透自然' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('亮度'), { target: { value: '28' } });
    fireEvent.click(screen.getByRole('button', { name: '复制 清透自然' }));
    await waitFor(() => expect(screen.getByText(/已复制并选中「清透自然 副本」/)).toBeInTheDocument());
    expect(saved.mock.calls[0][0].recipe.brightness).toBe(28);
    expect(saved.mock.calls[0][0].source).toBe('manual');
    fireEvent.change(screen.getByLabelText('亮度'), { target: { value: '38' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为模板' }));
    await waitFor(() => expect(screen.getByText('已更新「清透自然 副本」')).toBeInTheDocument());
    expect(saved.mock.calls[1][0].id).toBe(saved.mock.calls[0][0].id);
    fireEvent.click(screen.getByRole('button', { name: '内置模板' }));
    fireEvent.click(screen.getByRole('button', { name: '重置内置模板 清透自然' }));
    expect(screen.getByLabelText('亮度')).toHaveValue('0');
    expect(screen.getByText('「清透自然」已恢复为内置初始样式')).toBeInTheDocument();
    expect(saved).toHaveBeenCalledTimes(2);
  });

  it('keeps the save dialog open and explains a storage failure', async () => {
    vi.spyOn(presetStore, 'savePreset').mockRejectedValue(new Error('本地空间不足'));
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: '保存为模板' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '保存为模板' }));
    expect(screen.getByRole('dialog', { name: '另存为新模板' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存新模板' }));
    await waitFor(() => expect(screen.getByText('模板保存失败：本地空间不足')).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: '另存为新模板' })).toBeInTheDocument();
  });
});
