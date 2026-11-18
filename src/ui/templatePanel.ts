import { DEFAULT_TEMPLATE, type SectionTemplate } from '../core/crossSection';
import {
  criteriaFor,
  formatIssue,
  ROAD_PRESETS,
  type DesignCriteria,
  type DesignIssue,
} from '../core/designCriteria';

const FIELDS: { key: keyof SectionTemplate; label: string; unit: string; percent?: boolean }[] = [
  { key: 'laneWidth', label: 'Lane width', unit: 'm' },
  { key: 'laneCrossfall', label: 'Lane crossfall', unit: '%', percent: true },
  { key: 'shoulderWidth', label: 'Shoulder width', unit: 'm' },
  { key: 'shoulderCrossfall', label: 'Shoulder crossfall', unit: '%', percent: true },
  { key: 'cutSlope', label: 'Cut slope 1:', unit: '' },
  { key: 'fillSlope', label: 'Fill slope 1:', unit: '' },
];

const DEFAULT_PRESET = ROAD_PRESETS[1]!;

/**
 * Side panel: road class preset, cross-section template, design criteria,
 * design checks and the quantities summary.
 */
export function mountTemplatePanel(
  root: HTMLElement,
  onChange: (t: SectionTemplate, c: DesignCriteria) => void,
) {
  let t: SectionTemplate = { ...DEFAULT_TEMPLATE, ...DEFAULT_PRESET.template };
  let c: DesignCriteria = criteriaFor(DEFAULT_PRESET.speed, DEFAULT_PRESET.maxGrade);
  root.innerHTML = `
    <h2>Road class</h2>
    <select class="preset"></select>
    <div class="criteria"></div>
    <p class="hint">Indicative values from standard formulas. Check against N100 and the municipal road norm.</p>
    <h2 class="sub">Cross-section</h2>
    <div class="template"></div>
    <div class="quantities"></div>
    <h2 class="sub">Design checks</h2>
    <div class="checks"></div>`;

  const select = root.querySelector<HTMLSelectElement>('.preset')!;
  for (const p of ROAD_PRESETS) select.add(new Option(p.name, p.id, false, p === DEFAULT_PRESET));
  const criteriaEl = root.querySelector<HTMLElement>('.criteria')!;
  const grid = root.querySelector('.template')!;
  const inputs = new Map<keyof SectionTemplate, HTMLInputElement>();

  const renderCriteria = () => {
    criteriaEl.textContent =
      `Min R ${c.minRadius} m · max grade ${(c.maxGrade * 100).toFixed(0)} % · ` +
      `crest K ${c.minCrestK} · sag K ${c.minSagK} · sight ${c.stoppingSightDistance} m`;
  };
  const renderInputs = () => {
    for (const f of FIELDS) {
      const input = inputs.get(f.key);
      if (input)
        input.value = String(Math.round((f.percent ? t[f.key] * 100 : t[f.key]) * 100) / 100);
    }
  };

  for (const f of FIELDS) {
    const label = document.createElement('label');
    label.textContent = f.label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = f.percent ? '0.5' : '0.05';
    input.min = '0';
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v < 0) return;
      t = { ...t, [f.key]: f.percent ? v / 100 : v };
      onChange({ ...t }, c);
    });
    inputs.set(f.key, input);
    const unit = document.createElement('span');
    unit.textContent = f.unit;
    grid.append(label, input, unit);
  }
  select.addEventListener('change', () => {
    const p = ROAD_PRESETS.find((x) => x.id === select.value);
    if (!p) return;
    t = { ...t, ...p.template };
    c = criteriaFor(p.speed, p.maxGrade);
    renderInputs();
    renderCriteria();
    onChange({ ...t }, c);
  });
  renderInputs();
  renderCriteria();

  const quantities = root.querySelector<HTMLElement>('.quantities')!;
  const checks = root.querySelector<HTMLElement>('.checks')!;
  return {
    template: () => ({ ...t }),
    criteria: () => c,
    setQuantities(cut: number, fill: number, length: number) {
      quantities.textContent = `Earthworks over ${length.toFixed(0)} m: cut ${Math.round(cut).toLocaleString('en')} m³ · fill ${Math.round(fill).toLocaleString('en')} m³`;
    },
    setIssues(issues: DesignIssue[]) {
      checks.replaceChildren();
      if (issues.length === 0) {
        const ok = document.createElement('p');
        ok.className = 'ok';
        ok.textContent = '✓ Meets the selected road class';
        checks.append(ok);
      }
      for (const i of issues) {
        const p = document.createElement('p');
        p.textContent = `⚠ ${formatIssue(i)}`;
        checks.append(p);
      }
    },
  };
}
