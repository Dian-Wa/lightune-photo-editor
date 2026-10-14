export default function NumericInput({ value, label, min, max, onCommit }: {
  value: number; label: string; min: number; max: number; onCommit: (value: number) => void;
}) {
  return <input key={value} aria-label={label} className="adjustment-number" type="number" min={min} max={max} step={1}
    defaultValue={value}
    onBlur={(event) => {
      const raw = event.currentTarget.value;
      if (raw === '' || !Number.isFinite(Number(raw))) { event.currentTarget.value = String(value); return; }
      const next = Math.round(Math.max(min, Math.min(max, Number(raw))));
      event.currentTarget.value = String(next);
      if (next !== value) onCommit(next);
    }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') event.currentTarget.value = String(value);
      if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
    }} />;
}
