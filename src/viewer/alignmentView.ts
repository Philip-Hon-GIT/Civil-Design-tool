import type Instance from '@giro3d/giro3d/core/Instance.js';
import type Map from '@giro3d/giro3d/entities/Map.js';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Line,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import {
  computeAlignment,
  sampleAlignment,
  type Alignment,
  type ElementType,
  type PIInput,
} from '../core/alignment';
import type { Point2 } from '../core/projects';

/** Editable alignment points: first is POB, last is POE, the rest are PIs. */
export type AlignmentPoints = PIInput[];

const ELEMENT_COLORS: Record<ElementType, string> = {
  line: '#ffd23f',
  clothoid: '#c77dff',
  arc: '#3ddc97',
};

/**
 * Draws a horizontal alignment draped on the terrain and lets the user add points by
 * clicking (in draw mode) and move them by dragging the markers.
 */
export class AlignmentView {
  readonly group = new Group();
  private points: AlignmentPoints = [];
  private alignment: Alignment | null = null;
  private drawing = false;
  private dragIndex = -1;
  private readonly listeners = new Set<(al: Alignment | null, pts: AlignmentPoints) => void>();

  constructor(
    private readonly instance: Instance,
    private readonly map: Map,
    private readonly controls: MapControls,
    private readonly origin: Point2,
  ) {
    this.group.position.set(origin.x, origin.y, 0);
    this.group.renderOrder = 20;
    instance.add(this.group);
    const el = instance.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    map.addEventListener('elevation-changed', () => this.redraw());
  }

  onChange(fn: (al: Alignment | null, pts: AlignmentPoints) => void) {
    this.listeners.add(fn);
  }

  getPoints(): AlignmentPoints {
    return this.points.map((p) => ({ ...p }));
  }

  setPoints(points: AlignmentPoints) {
    this.points = points.map((p) => ({ ...p }));
    this.update();
  }

  setDrawing(on: boolean) {
    this.drawing = on;
    this.instance.domElement.style.cursor = on ? 'crosshair' : '';
  }

  isDrawing() {
    return this.drawing;
  }

  private update() {
    this.alignment =
      this.points.length >= 2
        ? computeAlignment({
            start: this.points[0] as Point2,
            pis: this.points.slice(1, -1),
            end: this.points[this.points.length - 1] as Point2,
          })
        : null;
    this.redraw();
    this.listeners.forEach((fn) => fn(this.alignment, this.getPoints()));
  }

  private z(x: number, y: number, lift: number) {
    return (this.map.getElevationFast(x, y)?.elevation ?? 0) + lift;
  }

  private local(x: number, y: number, lift: number) {
    return new Vector3(x - this.origin.x, y - this.origin.y, this.z(x, y, lift));
  }

  private redraw() {
    this.group.clear();
    // Tangent polygon (dashed) and point markers.
    if (this.points.length >= 2) {
      const poly = new Line(
        new BufferGeometry().setFromPoints(this.points.map((p) => this.local(p.x, p.y, 0.5))),
        new LineDashedMaterial({ color: '#9aa4b2', dashSize: 6, gapSize: 4, depthTest: false }),
      );
      poly.computeLineDistances();
      this.group.add(poly);
    }
    this.points.forEach((p, i) => {
      const isEnd = i === 0 || i === this.points.length - 1;
      const marker = new Mesh(
        new SphereGeometry(isEnd ? 3 : 4, 12, 8),
        new MeshBasicMaterial({ color: isEnd ? '#ffffff' : '#ff8a3d', depthTest: false }),
      );
      marker.position.copy(this.local(p.x, p.y, 1));
      marker.renderOrder = 30;
      this.group.add(marker);
    });
    // Alignment, coloured by element type.
    if (this.alignment) {
      const pts = sampleAlignment(this.alignment, 2);
      const pos: number[] = [];
      const col: number[] = [];
      const colorAt = (s: number) => {
        const e =
          this.alignment?.elements.find((el) => s < el.startStation + el.length - 1e-6) ??
          this.alignment?.elements.at(-1);
        return ELEMENT_COLORS[e?.type ?? 'line'];
      };
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const va = this.local(a.x, a.y, 0.8);
        const vb = this.local(b.x, b.y, 0.8);
        pos.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
        const c = hexToRgb(colorAt((a.station + b.station) / 2));
        col.push(...c, ...c);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new Float32BufferAttribute(col, 3));
      const line = new LineSegments(
        g,
        new LineBasicMaterial({ vertexColors: true, depthTest: false }),
      );
      line.renderOrder = 25;
      this.group.add(line);
    }
    this.group.updateMatrixWorld(true);
    this.instance.notifyChange();
  }

  private terrainPointAt(ev: PointerEvent): Point2 | null {
    const picks = this.instance.pickObjectsAt(ev, { where: [this.map] });
    const p = picks[0]?.point;
    return p ? { x: p.x, y: p.y } : null;
  }

  private markerAt(ev: PointerEvent): number {
    const rect = this.instance.domElement.getBoundingClientRect();
    const mouse = new Vector2(ev.clientX - rect.left, ev.clientY - rect.top);
    const cam = this.instance.view.camera;
    let best = -1;
    let bestDist = 14;
    this.points.forEach((p, i) => {
      const v = new Vector3(p.x, p.y, this.z(p.x, p.y, 1)).project(cam);
      const sx = ((v.x + 1) / 2) * rect.width;
      const sy = ((1 - v.y) / 2) * rect.height;
      const d = Math.hypot(sx - mouse.x, sy - mouse.y);
      if (v.z < 1 && d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  private readonly onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const idx = this.markerAt(ev);
    if (idx >= 0) {
      this.dragIndex = idx;
      this.controls.enabled = false;
      return;
    }
    if (this.drawing) {
      const p = this.terrainPointAt(ev);
      if (!p) return;
      this.points.push({ ...p, ...DEFAULT_CURVE });
      this.update();
    }
  };

  private readonly onPointerMove = (ev: PointerEvent) => {
    if (this.dragIndex < 0) return;
    const p = this.terrainPointAt(ev);
    const target = this.points[this.dragIndex];
    if (!p || !target) return;
    target.x = p.x;
    target.y = p.y;
    this.update();
  };

  private readonly onPointerUp = () => {
    if (this.dragIndex >= 0) {
      this.dragIndex = -1;
      this.controls.enabled = true;
    }
  };
}

/** Defaults for a new PI on a municipal street (design speed about 40–50 km/h). */
export const DEFAULT_CURVE = { radius: 150, l1: 30, l2: 30 };

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
