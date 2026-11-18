import type { CorridorSection } from '../core/corridor';
import { formatStation } from '../core/station';
import { PART_COLORS } from '../viewer/roadMesh';

const NS = 'http://www.w3.org/2000/svg';

/** Draws one cross-section (design and ground) as SVG, true scale (no exaggeration). */
export class SectionView {
  private readonly svg: SVGSVGElement;
  private readonly info: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="profile-bar"><strong>Cross-section</strong><span class="section-info"></span></div>
      <svg class="profile-svg"></svg>`;
    this.svg = root.querySelector('svg')!;
    this.info = root.querySelector('.section-info')!;
  }

  show(section: CorridorSection | null, ground: (offset: number) => number | undefined) {
    const svg = this.svg;
    const w = svg.clientWidth || 400;
    const h = svg.clientHeight || 200;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.replaceChildren();
    if (!section) {
      this.info.textContent = '';
      return;
    }
    const pts = section.points;
    const oMin = Math.min(...pts.map((p) => p.offset)) - 3;
    const oMax = Math.max(...pts.map((p) => p.offset)) + 3;
    const gpts: { o: number; z: number }[] = [];
    for (let o = oMin; o <= oMax; o += 0.25) {
      const z = ground(o);
      if (z !== undefined) gpts.push({ o, z });
    }
    const zs = [...pts.map((p) => p.z), ...gpts.map((g) => g.z)];
    const zMid = (Math.min(...zs) + Math.max(...zs)) / 2;
    // Same scale horizontally and vertically.
    const scale = Math.min(
      (w - 20) / (oMax - oMin),
      (h - 30) / Math.max(4, Math.max(...zs) - Math.min(...zs) + 2),
    );
    const X = (o: number) => w / 2 + o * scale - ((oMin + oMax) / 2) * scale;
    const Y = (z: number) => h / 2 + 4 - (z - zMid) * scale;

    if (gpts.length > 1) {
      const d = `M${X(gpts[0]!.o)},${h} L${gpts.map((g) => `${X(g.o)},${Y(g.z)}`).join(' L')} L${X(gpts.at(-1)!.o)},${h} Z`;
      this.add('path', { d, class: 'ground' });
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      this.add('line', {
        x1: X(a.offset),
        y1: Y(a.z),
        x2: X(b.offset),
        y2: Y(b.z),
        stroke: PART_COLORS[section.parts[i - 1]!],
        'stroke-width': section.parts[i - 1] === 'lane' ? 4 : 2.5,
      });
    }
    this.add('line', { x1: X(0), y1: 14, x2: X(0), y2: h, class: 'centerline' });
    const centre = pts.find((p) => p.offset === 0);
    this.info.textContent =
      `Sta ${formatStation(section.station)} · design ${centre?.z.toFixed(2) ?? '–'}` +
      ` · cut ${section.cutArea.toFixed(1)} m² · fill ${section.fillArea.toFixed(1)} m²`;
  }

  private add(tag: string, attrs: Record<string, string | number>) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    this.svg.append(e);
  }
}
