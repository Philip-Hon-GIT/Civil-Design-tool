import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
} from 'three';
import type { Corridor } from '../core/corridor';
import type { SectionPart } from '../core/crossSection';
import type { Point2 } from '../core/projects';

export const PART_COLORS: Record<SectionPart, string> = {
  lane: '#3a3d44',
  shoulder: '#7b7f87',
  fill: '#8fae5d',
  cut: '#b08860',
};

/**
 * Sweep corridor sections into one mesh with vertex colours per part.
 * Coordinates are relative to `origin` (set mesh.position to it) to keep precision.
 */
export function buildRoadMesh(corridor: Corridor, origin: Point2): Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const world = (s: Corridor['sections'][number], i: number) => {
    const p = s.points[i]!;
    return [s.x + s.rightX * p.offset - origin.x, s.y + s.rightY * p.offset - origin.y, p.z];
  };
  for (let k = 1; k < corridor.sections.length; k++) {
    const a = corridor.sections[k - 1]!;
    const b = corridor.sections[k]!;
    // Only join sections with the same structure (same parts in the same order).
    if (a.parts.join() !== b.parts.join()) continue;
    for (let i = 0; i < a.parts.length; i++) {
      const c = rgb(PART_COLORS[a.parts[i]!]);
      const a0 = world(a, i);
      const a1 = world(a, i + 1);
      const b0 = world(b, i);
      const b1 = world(b, i + 1);
      pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      for (let v = 0; v < 6; v++) col.push(...c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new Mesh(g, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.position.set(origin.x, origin.y, 0.02);
  mesh.updateMatrixWorld(true);
  mesh.name = 'Road';
  return mesh;
}
