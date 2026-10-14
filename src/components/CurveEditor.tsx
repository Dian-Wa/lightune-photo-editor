import { useRef, useState, type CSSProperties } from 'react';
import { curveAnchors, curveChannels, curveInputValues, type AdjustmentRecipe, type CurveChannel, type CurveKey } from '../domain/recipe';
import { buildCurveLut } from '../lib/colorMath';
import NumericInput from './NumericInput';

const plot = { x: 24, y: 12, width: 236, height: 152 };
const px = (input: number) => plot.x + input / 255 * plot.width;
const py = (output: number) => plot.y + plot.height * (1 - output / 255);

export default function CurveEditor({ recipe, disabled, onChange }: {
  recipe: AdjustmentRecipe; disabled: boolean; onChange: (key: CurveKey, value: number) => void;
}) {
  const [channel, setChannel] = useState<CurveChannel>('Rgb');
  const [selected, setSelected] = useState(2);
  const [draft, setDraft] = useState<{ key: CurveKey; value: number } | null>(null);
  const drag = useRef<{ key: CurveKey; value: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const key: CurveKey = `curve${channel}${curveAnchors[selected]}`;
  const displayed = draft ? { ...recipe, [draft.key]: draft.value } : recipe;
  const table = buildCurveLut(displayed, channel);
  const line = Array.from({ length: 65 }, (_, i) => {
    const input = Math.min(255, i * 4);
    return `${i === 0 ? 'M' : 'L'}${px(input).toFixed(2)},${py(table[input]).toFixed(2)}`;
  }).join(' ');
  const activeChannel = curveChannels.find((item) => item.id === channel)!;
  return <div className="curve-editor">
    <div className="curve-channel-selector" aria-label="曲线通道">
      {curveChannels.map((item) => <button type="button" key={item.id} aria-label={`${item.label}通道`} aria-pressed={channel === item.id}
        className={channel === item.id ? 'selected' : ''} style={{ '--channel': item.color } as CSSProperties}
        onClick={() => { setChannel(item.id); setDraft(null); }}>{item.label}</button>)}
    </div>
    <svg ref={svg} className="curve-graph" viewBox="0 0 280 188" aria-label={`${activeChannel.label}曲线编辑器`} aria-disabled={disabled}
      onPointerMove={(event) => {
        if (!drag.current || disabled || !svg.current) return;
        const rect = svg.current.getBoundingClientRect();
        const y = (event.clientY - rect.top) / rect.height * 188;
        const value = Math.round(Math.max(0, Math.min(255, (1 - (y - plot.y) / plot.height) * 255)));
        drag.current.value = value;
        setDraft({ ...drag.current });
      }}
      onPointerUp={() => {
        const current = drag.current;
        drag.current = null; setDraft(null);
        if (current && !disabled && current.value !== recipe[current.key]) onChange(current.key, current.value);
      }}
      onPointerCancel={() => { drag.current = null; setDraft(null); }}>
      <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} className="curve-background" />
      {[0.25, 0.5, 0.75].map((t) => <g key={t} className="curve-grid">
        <line x1={plot.x + plot.width * t} y1={plot.y} x2={plot.x + plot.width * t} y2={plot.y + plot.height} />
        <line x1={plot.x} y1={plot.y + plot.height * t} x2={plot.x + plot.width} y2={plot.y + plot.height * t} />
      </g>)}
      <line x1={px(0)} y1={py(0)} x2={px(255)} y2={py(255)} className="curve-diagonal" />
      <path d={line} fill="none" stroke={activeChannel.color} strokeWidth={2} pointerEvents="none" />
      {curveAnchors.map((anchor, i) => {
        const pointKey: CurveKey = `curve${channel}${anchor}`;
        const value = displayed[pointKey];
        return <circle key={anchor} cx={px(curveInputValues[i])} cy={py(value)} r={selected === i ? 5.5 : 4}
          fill={selected === i ? activeChannel.color : '#20262b'} stroke={activeChannel.color} strokeWidth={1.5}
          role="slider" tabIndex={disabled ? -1 : 0} aria-label={`${activeChannel.label}曲线控制点${curveInputValues[i]}`}
          aria-valuemin={0} aria-valuemax={255} aria-valuenow={value} aria-orientation="vertical" aria-disabled={disabled}
          onFocus={() => setSelected(i)}
          onPointerDown={(event) => {
            if (disabled) return;
            event.preventDefault(); setSelected(i);
            drag.current = { key: pointKey, value: recipe[pointKey] };
            svg.current?.setPointerCapture(event.pointerId);
          }}
          onKeyDown={(event) => {
            if (disabled) return;
            const step = event.shiftKey ? 10 : 1;
            let next = value;
            if (event.key === 'ArrowUp') next += step;
            else if (event.key === 'ArrowDown') next -= step;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = 255;
            else return;
            event.preventDefault(); onChange(pointKey, Math.max(0, Math.min(255, next)));
          }} />;
      })}
      <text x={plot.x} y={183}>0</text><text x={plot.x + plot.width} y={183} textAnchor="end">255 输入</text>
      <text x={19} y={18} textAnchor="end">255</text><text x={19} y={plot.y + plot.height} textAnchor="end">0</text>
    </svg>
    <div className="curve-point-fields">
      <label>输入点 <select aria-label="曲线输入点" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
        {curveInputValues.map((value, i) => <option key={value} value={i}>{value}</option>)}
      </select></label>
      <label>输出值 <NumericInput label="曲线输出值" min={0} max={255} value={displayed[key]} onCommit={(value) => onChange(key, value)} /></label>
    </div>
  </div>;
}
