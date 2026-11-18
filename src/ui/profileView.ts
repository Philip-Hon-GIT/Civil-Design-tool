import { pointAtStation, type Alignment } from '../core/alignment';
import {
  autoProfile,
  computeProfile,
  elevationAt,
  kValue,
  type PVI,
  type Profile,
} from '../core/profile';
import { formatStation } from '../core/station';

const NS = 'http://www.w3.org/2000/svg';
const PAD = { left: 52, right: 16, top: 14, bottom: 26 };

type GroundSampler = (x: number, y: number) => number | undefined;

/**
 * Longitudinal profile editor: ground line along the alignment, design line from PVIs.
 * Drag PVIs to move them, use "+ PVI" then click to add, double-click a PVI to remove it.
 */
export class ProfileView {
  private alignment: Alignment | null = null;
  private ground: { station: number; elevation: number }[] = [];
  private pvis: PVI[] = [];
  private profile: Profile | null = null;
  private adding = false;
  private dragIndex = -1;
  private readonly svg: SVGSVGElement;
  private readonly info: HTMLElement;
  private readonly listeners = new Set<(p: Profile | null) => void>();
  private readonly hoverListeners = new Set<(station: number) => void>();
  private scale = { s0: 0, s1: 1, z0: 0, z1: 1, w: 1, h: 1 };

  constructor(
    root: HTMLElement,
    private readonly sampleGround: GroundSampler,
  ) {
    root.innerHTML = `
      <div class="profile-bar">
        <strong>Longitudinal profile</strong>
        <button data-act="add">+ PVI</button>
        <button data-act="auto">Auto</button>
        <span class="profile-info"></span>
      </div>
      <svg class="profile-svg"></svg>`;
    this.svg = root.querySelector('svg')!;
    this.info = root.querySelector('.profile-info')!;
    const addBtn = root.querySelector<HTMLButtonElement>('[data-act="add"]')!;
    addBtn.addEventListener('click', () => {
      this.adding = !this.adding;
      addBtn.classList.toggle('active', this.adding);
    });
    root.querySelector('[data-act="auto"]')?.addEventListener('click', () => this.auto());
    this.svg.addEventListener('pointerdown', this.onDown);
    this.svg.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', () => (this.dragIndex = -1));
    this.svg.addEventListener('dblclick', this.onDblClick);
    new ResizeObserver(() => this.render()).observe(root);
  }

  onChange(fn: (p: Profile | null) => void) {
    this.listeners.add(fn);
  }

  /** Called with the station under the cursor. */
  onHover(fn: (station: number) => void) {
    this.hoverListeners.add(fn);
  }

  getProfile() {
    return this.profile;
  }

  setAlignment(al: Alignment | null) {
    const oldLength = this.alignment?.length;
    this.alignment = al;
    this.resampleGround();
    if (!al) {
      this.pvis = [];
    } else if (this.pvis.length < 2) {
      this.auto(false);
    } else if (oldLength !== undefined && oldLength !== al.length) {
      // Keep PVIs in proportion and pin the ends to the new alignment ends.
      const f = al.length / oldLength;
      this.pvis = this.pvis.map((p) => ({
        ...p,
        station: al.startStation + (p.station - al.startStation) * f,
      }));
      this.pinEnds();
    }
    this.update();
  }

  /** Re-read terrain heights (e.g. after more detailed terrain tiles have loaded). */
  resampleGround() {
    const al = this.alignment;
    this.ground = [];
    if (!al) return;
    const step = Math.max(1, al.length / 400);
    for (let s = al.startStation; s <= al.startStation + al.length + 1e-6; s += step) {
      const p = pointAtStation(al, s);
      const z = this.sampleGround(p.x, p.y);
      if (z !== undefined) this.ground.push({ station: s, elevation: z });
    }
    this.render();
  }

  private auto(notify = true) {
    if (this.ground.length < 2) return;
    this.pvis = autoProfile(this.ground);
    if (notify) this.update();
  }

  private pinEnds() {
    const al = this.alignment;
    if (!al || this.pvis.length < 2) return;
    this.pvis.sort((a, b) => a.station - b.station);
    this.pvis[0]!.station = al.startStation;
    this.pvis[this.pvis.length - 1]!.station = al.startStation + al.length;
  }

  private update() {
    this.profile = this.pvis.length >= 2 ? computeProfile(this.pvis) : null;
    this.render();
    this.listeners.forEach((fn) => fn(this.profile));
  }

  // --- coordinates ---
  private sx(s: number) {
    const { s0, s1, w } = this.scale;
    return PAD.left + ((s - s0) / (s1 - s0)) * (w - PAD.left - PAD.right);
  }
  private sy(z: number) {
    const { z0, z1, h } = this.scale;
    return h - PAD.bottom - ((z - z0) / (z1 - z0)) * (h - PAD.top - PAD.bottom);
  }
  private toStation(px: number) {
    const { s0, s1, w } = this.scale;
    return s0 + ((px - PAD.left) / (w - PAD.left - PAD.right)) * (s1 - s0);
  }
  private toElevation(py: number) {
    const { z0, z1, h } = this.scale;
    return z0 + ((h - PAD.bottom - py) / (h - PAD.top - PAD.bottom)) * (z1 - z0);
  }

  private render() {
    const svg = this.svg;
    const w = svg.clientWidth || 600;
    const h = svg.clientHeight || 200;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.replaceChildren();
    const al = this.alignment;
    if (!al || this.ground.length < 2) {
      this.text(w / 2, h / 2, 'Draw an alignment to see its profile', 'empty', 'middle');
      return;
    }
    const zs = [...this.ground.map((g) => g.elevation), ...this.pvis.map((p) => p.elevation)];
    const zMin = Math.min(...zs);
    const zMax = Math.max(...zs);
    const pad = Math.max(2, (zMax - zMin) * 0.15);
    this.scale = {
      s0: al.startStation,
      s1: al.startStation + al.length,
      z0: zMin - pad,
      z1: zMax + pad,
      w,
      h,
    };

    // Grid and axes.
    const sStep = niceStep(al.length / 8);
    for (let s = Math.ceil(al.startStation / sStep) * sStep; s <= this.scale.s1; s += sStep) {
      this.line(this.sx(s), PAD.top, this.sx(s), h - PAD.bottom, 'grid');
      this.text(this.sx(s), h - 8, formatStation(s, 0), 'axis', 'middle');
    }
    const zStep = niceStep((this.scale.z1 - this.scale.z0) / 5);
    for (let z = Math.ceil(this.scale.z0 / zStep) * zStep; z <= this.scale.z1; z += zStep) {
      this.line(PAD.left, this.sy(z), w - PAD.right, this.sy(z), 'grid');
      this.text(PAD.left - 6, this.sy(z) + 4, z.toFixed(0), 'axis', 'end');
    }

    // Ground.
    const gpts = this.ground.map((g) => `${this.sx(g.station)},${this.sy(g.elevation)}`);
    this.path(
      `M${this.sx(this.ground[0]!.station)},${h - PAD.bottom} L${gpts.join(' L')} L${this.sx(this.ground.at(-1)!.station)},${h - PAD.bottom} Z`,
      'ground',
    );

    const prof = this.profile;
    if (!prof) return;
    // Tangent polygon and design line.
    this.path(
      `M${prof.pvis.map((p) => `${this.sx(p.station)},${this.sy(p.elevation)}`).join(' L')}`,
      'tangents',
    );
    const dpts: string[] = [];
    const n = Math.max(50, Math.round(w / 2));
    for (let i = 0; i <= n; i++) {
      const s = this.scale.s0 + ((this.scale.s1 - this.scale.s0) * i) / n;
      dpts.push(`${this.sx(s)},${this.sy(elevationAt(prof, s))}`);
    }
    this.path(`M${dpts.join(' L')}`, 'design');

    // Grades and PVIs.
    prof.grades.forEach((g, i) => {
      const a = prof.pvis[i]!;
      const b = prof.pvis[i + 1]!;
      const mx = this.sx((a.station + b.station) / 2);
      const my = this.sy((a.elevation + b.elevation) / 2) - 8;
      this.text(mx, my, `${(g * 100).toFixed(2)} %`, 'grade', 'middle');
    });
    prof.pvis.forEach((p, i) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', String(this.sx(p.station)));
      c.setAttribute('cy', String(this.sy(p.elevation)));
      c.setAttribute('r', '5');
      c.setAttribute('class', 'pvi');
      c.dataset.index = String(i);
      svg.append(c);
      if (i > 0 && i < prof.pvis.length - 1) {
        const k = kValue(prof, i);
        this.text(
          this.sx(p.station),
          this.sy(p.elevation) - 12,
          `L ${p.curveLength.toFixed(0)} · K ${Number.isFinite(k) ? k.toFixed(1) : '–'}`,
          'pvi-label',
          'middle',
        );
      }
    });
    if (prof.warnings.length) this.info.textContent = `⚠ ${prof.warnings[0]}`;
  }

  private line(x1: number, y1: number, x2: number, y2: number, cls: string) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('class', cls);
    this.svg.append(l);
  }
  private path(d: string, cls: string) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    this.svg.append(p);
  }
  private text(x: number, y: number, t: string, cls: string, anchor: string) {
    const e = document.createElementNS(NS, 'text');
    e.setAttribute('x', String(x));
    e.setAttribute('y', String(y));
    e.setAttribute('class', cls);
    e.setAttribute('text-anchor', anchor);
    e.textContent = t;
    this.svg.append(e);
  }

  private local(ev: PointerEvent | MouseEvent) {
    const r = this.svg.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  private readonly onDown = (ev: PointerEvent) => {
    const target = ev.target as Element;
    if (target.classList.contains('pvi')) {
      this.dragIndex = Number((target as SVGElement).dataset.index);
      this.svg.setPointerCapture(ev.pointerId);
      return;
    }
    if (this.adding && this.profile && this.alignment) {
      const { x, y } = this.local(ev);
      const s = this.toStation(x);
      if (s <= this.scale.s0 || s >= this.scale.s1) return;
      this.pvis.push({ station: s, elevation: this.toElevation(y), curveLength: 40 });
      this.update();
    }
  };

  private readonly onMove = (ev: PointerEvent) => {
    const { x, y } = this.local(ev);
    const s = this.toStation(x);
    if (this.dragIndex >= 0) {
      this.pvis.sort((a, b) => a.station - b.station);
      const p = this.pvis[this.dragIndex];
      if (!p) return;
      const prev = this.pvis[this.dragIndex - 1];
      const next = this.pvis[this.dragIndex + 1];
      // Interior PVIs move between their neighbours; the ends only move vertically.
      if (prev && next) p.station = Math.min(Math.max(s, prev.station + 1), next.station - 1);
      p.elevation = Math.round(this.toElevation(y) * 100) / 100;
      this.pvis.sort((a, b) => a.station - b.station);
      this.update();
    }
    this.showReadout(s);
  };

  private readonly onDblClick = (ev: MouseEvent) => {
    const target = ev.target as Element;
    if (!target.classList.contains('pvi')) return;
    const i = Number((target as SVGElement).dataset.index);
    if (i === 0 || i === this.pvis.length - 1) return;
    this.pvis.sort((a, b) => a.station - b.station).splice(i, 1);
    this.update();
  };

  private showReadout(s: number) {
    if (!this.profile || s < this.scale.s0 || s > this.scale.s1) return;
    this.hoverListeners.forEach((fn) => fn(s));
    const g = nearest(this.ground, s);
    const d = elevationAt(this.profile, s);
    const diff =
      g === undefined
        ? ''
        : d - g >= 0
          ? ` · fill ${(d - g).toFixed(2)} m`
          : ` · cut ${(g - d).toFixed(2)} m`;
    this.info.textContent = `Sta ${formatStation(s)} · design ${d.toFixed(2)} · ground ${g?.toFixed(2) ?? '–'}${diff}`;
  }
}

function nearest(ground: { station: number; elevation: number }[], s: number) {
  let best: number | undefined;
  let bd = Infinity;
  for (const g of ground) {
    const d = Math.abs(g.station - s);
    if (d < bd) {
      bd = d;
      best = g.elevation;
    }
  }
  return best;
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
