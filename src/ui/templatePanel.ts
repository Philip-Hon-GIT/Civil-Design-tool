import { DEFAULT_TEMPLATE, type SectionTemplate } from '../core/crossSection';

const FIELDS: { key: keyof SectionTemplate; label: string; unit: string; percent?: boolean }[] = [
  { key: 'laneWidth', label: 'Lane width', unit: 'm' },
  { key: 'laneCrossfall', label: 'Lane crossfall', unit: '%', percent: true },
  { key: 'shoulderWidth', label: 'Shoulder width', unit: 'm' },
  { key: 'shoulderCrossfall', label: 'Shoulder crossfall', unit: '%', percent: true },
  { key: 'cutSlope', label: 'Cut slope 1:', unit: '' },
  { key: 'fillSlope', label: 'Fill slope 1:', unit: '' },
];

/** Side-panel editor for the cross-section template, plus the quantities summary. */
export function mountTemplatePanel(root: HTMLElement, onChange: (t: SectionTemplate) => void) {
  const t: SectionTemplate = { ...DEFAULT_TEMPLATE };
  root.innerHTML = `<h2>Cross-section</h2><div class="template"></div><div class="quantities"></div>`;
  const grid = root.querySelector('.template')!;
  for (const f of FIELDS) {
    const label = document.createElement('label');
    label.textContent = f.label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = f.percent ? '0.5' : '0.05';
    input.min = '0';
    input.value = String(f.percent ? t[f.key] * 100 : t[f.key]);
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v < 0) return;
      t[f.key] = f.percent ? v / 100 : v;
      onChange({ ...t });
    });
    const unit = document.createElement('span');
    unit.textContent = f.unit;
    grid.append(label, input, unit);
  }
  const quantities = root.querySelector<HTMLElement>('.quantities')!;
  return {
    template: () => ({ ...t }),
    setQuantities(cut: number, fill: number, length: number) {
      quantities.textContent = `Earthworks over ${length.toFixed(0)} m: cut ${Math.round(cut).toLocaleString('en')} m³ · fill ${Math.round(fill).toLocaleString('en')} m³`;
    },
  };
}
