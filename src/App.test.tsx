import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

beforeEach(() => {
  const values: Record<string, string> = {};
  vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] || null,
    setItem: (key: string, value: string) => { values[key] = value; }, toJSON: () => values });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('photo editor workspace', () => {
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
  it('renders the complete local editing workflow', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /导入照片/ })).toBeInTheDocument();
    expect(screen.getByText('清透自然')).toBeInTheDocument();
    expect(screen.getByText('AI 调色灵感')).toBeInTheDocument();
    expect(screen.getByLabelText('亮度')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /导出/ })).toBeInTheDocument();
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
});
