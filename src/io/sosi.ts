import type { VectorData, VectorFeature } from './vector';

/** SOSI KOORDSYS codes for EUREF89 UTM zones. */
const KOORDSYS_EPSG: Record<number, number> = { 22: 25832, 23: 25833, 25: 25835 };

/** Decode a SOSI file, honouring ..TEGNSETT (ISO8859-1/-10 or UTF-8). */
export function decodeSosi(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const charset = /\.\.TEGNSETT\s+(\S+)/i.exec(head)?.[1]?.toUpperCase() ?? '';
  return new TextDecoder(charset.startsWith('UTF') ? 'utf-8' : 'latin1').decode(bytes);
}

/**
 * Parse points and curves from a SOSI file (Norwegian survey and map exchange format).
 * Reads .PUNKT, .KURVE and .LINJE with ..NØ / ..NØH coordinates, scaled by ...ENHET and
 * offset by ...ORIGO-NØ from the header. Surfaces (.FLATE) only reference curves and are skipped.
 */
export function parseSosi(text: string): VectorData {
  let unit = 1;
  let originN = 0;
  let originE = 0;
  let epsg: number | undefined;
  const features: VectorFeature[] = [];

  // Split into groups at each line starting with a single dot (".HODE", ".KURVE 12:").
  const groups = text.split(/\r?\n(?=\.[A-ZÆØÅ])/i);
  for (const group of groups) {
    const head = /^\.([A-ZÆØÅ]+)/i.exec(group.trimStart())?.[1]?.toUpperCase();
    if (head === 'HODE') {
      unit = num(/\.\.\.ENHET\s+(\S+)/.exec(group)?.[1], 1);
      const origo = /\.\.\.ORIGO-NØ\s+(\S+)\s+(\S+)/i.exec(group);
      originN = num(origo?.[1], 0);
      originE = num(origo?.[2], 0);
      const ks = num(/\.\.\.KOORDSYS\s+(\d+)/.exec(group)?.[1], 0);
      epsg = KOORDSYS_EPSG[ks];
      continue;
    }
    const kind = head === 'PUNKT' ? 'point' : head === 'KURVE' || head === 'LINJE' ? 'line' : null;
    if (!kind) continue;

    const type = /\.\.OBJTYPE\s+(\S+)/.exec(group)?.[1] ?? head ?? '';
    const kote = /\.\.\.?KOTE\s+(\S+)/.exec(group)?.[1];
    const defaultZ = kote === undefined ? NaN : num(kote, NaN);
    const coords: number[] = [];
    // Coordinates follow ..NØ or ..NØH, until the next ..keyword.
    const re = /\.\.NØ(H?)[^\n]*\n([\s\S]*?)(?=\n\.\.|$)/gi;
    for (let m = re.exec(group); m; m = re.exec(group)) {
      const withZ = m[1] !== '';
      for (const line of m[2]!.split(/\r?\n/)) {
        const v = line
          .replace(/\.\.\.\S+.*$/, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map(Number);
        if (v.length < 2 || v.some(Number.isNaN)) continue;
        const z = withZ && v.length >= 3 ? v[2]! * unit : defaultZ;
        coords.push(originE + v[1]! * unit, originN + v[0]! * unit, z);
      }
    }
    if (coords.length >= (kind === 'point' ? 3 : 6)) features.push({ kind, type, coords });
  }
  return { features, epsg };
}

function num(s: string | undefined, fallback: number): number {
  const n = Number(s);
  return s === undefined || Number.isNaN(n) ? fallback : n;
}
