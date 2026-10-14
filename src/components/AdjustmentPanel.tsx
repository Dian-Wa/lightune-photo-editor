import { useState, type CSSProperties } from 'react';
import { ChevronDown, RotateCcw, Settings2 } from 'lucide-react';
import { colorBands, controlDefinitions, recipeKeys, recipeModules, resetRecipeModule,
  type AdjustmentRecipe, type ColorBand, type RecipeKey } from '../domain/recipe';
import CurveEditor from './CurveEditor';
import NumericInput from './NumericInput';

type Props = { recipe: AdjustmentRecipe; dirty: boolean; onFieldChange: (key: RecipeKey, value: number) => void; onRecipeChange: (recipe: AdjustmentRecipe) => void };

function AdjustmentSlider({ field, value, onChange }: { field: RecipeKey; value: number; onChange: Props['onFieldChange'] }) {
  const definition = controlDefinitions[field];
  return <div className="adjustment-row">
    <span title={definition.unit ? `${definition.label}（${definition.unit}）` : definition.label}>{definition.label}</span>
    <input aria-label={definition.label} type="range" min={definition.min} max={definition.max} step={1} value={value}
      onChange={(event) => onChange(field, Number(event.target.value))} />
    <NumericInput label={`${definition.label}数值`} value={value} min={definition.min} max={definition.max}
      onCommit={(next) => onChange(field, next)} />
  </div>;
}

const adjustmentCount = recipeKeys.filter((key) => !key.endsWith('Enabled')).length;

export default function AdjustmentPanel({ recipe, dirty, onFieldChange, onRecipeChange }: Props) {
  const [color, setColor] = useState<ColorBand>('Red');
  return <section className="adjustments" aria-label="调整参数面板">
    <div className="section-heading"><Settings2 size={17} /><h2>手动调整</h2><span className={dirty ? 'unsaved' : ''}>{dirty ? '有未保存的调整' : '已保存'}</span></div>
    <div className="strength"><AdjustmentSlider field="strength" value={recipe.strength} onChange={onFieldChange} /></div>
    <p className="adjustment-guide">{adjustmentCount} 项调整 · 专业工具可展开细调</p>
    {recipeModules.map((module) => {
      const enabled = recipe[module.enabledKey] === 1;
      const modified = module.keys.some((key) => recipe[key] !== controlDefinitions[key].defaultValue);
      return <details className={`adjustment-module ${enabled ? '' : 'module-bypassed'}`} key={module.id} open={!module.advanced} data-module={module.id}>
        <summary>
          <span className="module-title">{module.name}{modified ? <i className="module-changed" title="该模块已调整" /> : null}</span>
          <span className="module-actions">
            <button type="button" className="module-switch" role="switch" aria-label={`启用${module.name}`} aria-checked={enabled}
              title={enabled ? '暂时关闭效果，保留参数' : '重新启用效果'}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onFieldChange(module.enabledKey, enabled ? 0 : 1); }}>{enabled ? '开启' : '关闭'}</button>
            <button type="button" className="module-reset" aria-label={`重置${module.name}`} title="仅重置该模块"
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRecipeChange(resetRecipeModule(recipe, module.id)); }}><RotateCcw size={13} /></button>
            <ChevronDown className="module-chevron" size={14} />
          </span>
        </summary>
        <fieldset disabled={!enabled} className="module-fields">
          <p className="module-hint">{module.hint}</p>
          {module.id === 'hsl' ? <>
            <div className="color-band-selector" aria-label="HSL颜色选择">
              {colorBands.map((band) => <button type="button" key={band.id} aria-label={`选择${band.label}色`} aria-pressed={color === band.id}
                className={color === band.id ? 'selected' : ''} style={{ '--swatch': band.swatch } as CSSProperties}
                onClick={() => setColor(band.id)}><i /><span>{band.label}</span></button>)}
            </div>
            {(['Hue', 'Saturation', 'Luminance'] as const).map((suffix) => {
              const key = `hsl${color}${suffix}` as RecipeKey;
              return <AdjustmentSlider key={key} field={key} value={recipe[key]} onChange={onFieldChange} />;
            })}
          </> : module.id === 'curves' ? <CurveEditor recipe={recipe} disabled={!enabled} onChange={onFieldChange} />
            : module.keys.map((key) => <AdjustmentSlider key={key} field={key} value={recipe[key]} onChange={onFieldChange} />)}
        </fieldset>
      </details>;
    })}
  </section>;
}
