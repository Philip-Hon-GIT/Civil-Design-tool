import { fitCurves, type Alignment } from '../core/alignment';
import type { ProjectArea } from '../core/projects';
import { formatStation } from '../core/station';
import { type AlignmentPoints, type AlignmentView, DEFAULT_CURVE } from '../viewer/alignmentView';

const TYPE_LABEL = { line: 'Tangent', clothoid: 'Clothoid', arc: 'Arc' } as const;

/** Side-panel controls for the horizontal alignment: draw, example, PI table, elements. */
export function mountAlignmentPanel(root: HTMLElement, view: AlignmentView, area: ProjectArea) {
  root.innerHTML = `
    <h2>Alignment</h2>
    <div class="row">
      <button data-act="draw">Draw</button>
      <button data-act="example">Example</button>
      <button data-act="clear">Clear</button>
    </div>
    <p class="hint" data-el="help">Click <b>Draw</b>, then click on the terrain to place points. Drag points to move them.</p>
    <table class="pi"><thead><tr><th></th><th>X</th><th>Y</th><th>R</th><th>L1</th><th>L2</th></tr></thead><tbody></tbody></table>
    <div data-el="summary" class="summary"></div>
    <div data-el="warnings" class="warnings"></div>
    <table class="elements"><thead><tr><th>Element</th><th>Start</th><th>Length</th><th>R / A</th></tr></thead><tbody></tbody></table>`;

  const drawBtn = root.querySelector<HTMLButtonElement>('[data-act="draw"]')!;
  const piBody = root.querySelector<HTMLTableSectionElement>('table.pi tbody')!;
  const elBody = root.querySelector<HTMLTableSectionElement>('table.elements tbody')!;
  const summary = root.querySelector<HTMLDivElement>('[data-el="summary"]')!;
  const warnings = root.querySelector<HTMLDivElement>('[data-el="warnings"]')!;

  drawBtn.addEventListener('click', () => {
    view.setDrawing(!view.isDrawing());
    drawBtn.classList.toggle('active', view.isDrawing());
    drawBtn.textContent = view.isDrawing() ? 'Done' : 'Draw';
  });
  root.querySelector('[data-act="clear"]')?.addEventListener('click', () => view.setPoints([]));
  root.querySelector('[data-act="example"]')?.addEventListener('click', () => {
    const ref = area.reference?.points ?? [];
    view.setPoints(
      fitCurves(
        ref.map((p) => ({ ...p, ...DEFAULT_CURVE })),
        DEFAULT_CURVE,
      ),
    );
  });

  const renderPoints = (pts: AlignmentPoints) => {
    piBody.innerHTML = '';
    pts.forEach((p, i) => {
      const isEnd = i === 0 || i === pts.length - 1;
      const label = i === 0 ? 'POB' : i === pts.length - 1 ? 'POE' : `PI${i}`;
      const tr = document.createElement('tr');
      const cell = (key: 'x' | 'y' | 'radius' | 'l1' | 'l2', disabled = false) => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.step = key === 'x' || key === 'y' ? '0.1' : '1';
        input.value = disabled ? '' : String(Math.round(p[key] * 10) / 10);
        input.disabled = disabled;
        input.addEventListener('change', () => {
          const next = view.getPoints();
          const target = next[i];
          const v = Number(input.value);
          if (!target || !Number.isFinite(v)) return;
          if (key === 'radius' && v <= 0) return;
          target[key] = Math.max(key === 'x' || key === 'y' ? -Infinity : 0, v);
          view.setPoints(next);
        });
        td.append(input);
        return td;
      };
      const th = document.createElement('th');
      th.textContent = label;
      tr.append(
        th,
        cell('x'),
        cell('y'),
        cell('radius', isEnd),
        cell('l1', isEnd),
        cell('l2', isEnd),
      );
      piBody.append(tr);
    });
  };

  const renderAlignment = (al: Alignment | null) => {
    elBody.innerHTML = '';
    summary.textContent = al
      ? `Length ${al.length.toFixed(1)} m · ${al.elements.length} elements`
      : '';
    warnings.innerHTML = '';
    al?.warnings.forEach((w) => {
      const p = document.createElement('p');
      p.textContent = `⚠ ${w}`;
      warnings.append(p);
    });
    if (al && al.warnings.length === 0) {
      const ok = document.createElement('p');
      ok.className = 'ok';
      ok.textContent = '✓ Geometry OK';
      warnings.append(ok);
    }
    al?.elements.forEach((e) => {
      const tr = document.createElement('tr');
      tr.className = e.type;
      let ra = '';
      if (e.type === 'arc') ra = `R ${Math.abs(1 / e.k0).toFixed(0)}`;
      if (e.type === 'clothoid') {
        const r = 1 / Math.max(Math.abs(e.k0), Math.abs(e.k1));
        ra = `A ${Math.sqrt(r * e.length).toFixed(1)}`;
      }
      tr.innerHTML = `<td>${TYPE_LABEL[e.type]}</td><td>${formatStation(e.startStation)}</td><td>${e.length.toFixed(2)}</td><td>${ra}</td>`;
      elBody.append(tr);
    });
  };

  view.onChange((al, pts) => {
    renderPoints(pts);
    renderAlignment(al);
  });
}
