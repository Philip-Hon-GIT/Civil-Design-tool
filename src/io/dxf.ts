import type { VectorData, VectorFeature } from './vector';

/**
 * Parse points and lines from an ASCII DXF file: POINT, LINE, LWPOLYLINE and
 * POLYLINE/VERTEX (2D and 3D). The layer name is used as the feature type.
 * DXF has no coordinate system, so coordinates are taken as the project CRS.
 */
export function parseDxf(text: string): VectorData {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2)
    pairs.push([Number(lines[i]), lines[i + 1]!.trim()]);

  // Only the ENTITIES section holds model geometry.
  const start = pairs.findIndex(
    (p, i) => p[0] === 2 && p[1] === 'ENTITIES' && pairs[i - 1]?.[1] === 'SECTION',
  );
  const features: VectorFeature[] = [];
  if (start < 0) return { features };

  let polyline: VectorFeature | null = null;
  let polylineClosed = false;
  let i = start + 1;
  while (i < pairs.length) {
    const [code, value] = pairs[i]!;
    if (code === 0 && value === 'ENDSEC') break;
    if (code !== 0) {
      i++;
      continue;
    }
    // Collect this entity's group codes.
    const entity = value;
    const body: [number, string][] = [];
    for (i++; i < pairs.length && pairs[i]![0] !== 0; i++) body.push(pairs[i]!);
    const get = (c: number, fallback = NaN) => {
      const p = body.find((b) => b[0] === c);
      return p ? Number(p[1]) : fallback;
    };
    const layer = body.find((b) => b[0] === 8)?.[1] ?? '0';

    switch (entity) {
      case 'POINT':
        features.push({ kind: 'point', type: layer, coords: [get(10), get(20), get(30)] });
        break;
      case 'LINE':
        features.push({
          kind: 'line',
          type: layer,
          coords: [get(10), get(20), get(30), get(11), get(21), get(31)],
        });
        break;
      case 'LWPOLYLINE': {
        const z = get(38);
        const coords: number[] = [];
        for (const [c, v] of body) {
          if (c === 10) coords.push(Number(v), NaN, z);
          if (c === 20) coords[coords.length - 2] = Number(v);
        }
        if (get(70, 0) & 1 && coords.length >= 3) coords.push(coords[0]!, coords[1]!, coords[2]!);
        features.push({ kind: 'line', type: layer, coords });
        break;
      }
      case 'POLYLINE':
        polyline = { kind: 'line', type: layer, coords: [] };
        polylineClosed = (get(70, 0) & 1) === 1;
        break;
      case 'VERTEX':
        polyline?.coords.push(get(10), get(20), get(30));
        break;
      case 'SEQEND':
        if (polyline) {
          const c = polyline.coords;
          if (polylineClosed && c.length >= 3) c.push(c[0]!, c[1]!, c[2]!);
          features.push(polyline);
          polyline = null;
        }
        break;
    }
  }
  return {
    features: features.filter(
      (f) => f.coords.length >= (f.kind === 'point' ? 3 : 6) && !Number.isNaN(f.coords[0]!),
    ),
  };
}
