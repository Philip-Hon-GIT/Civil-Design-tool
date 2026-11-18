import type { NorwegianCrs } from './crs';

export interface Point2 {
  x: number;
  y: number;
}

/** A square project area in a Norwegian UTM CRS. */
export interface ProjectArea {
  id: string;
  name: string;
  crs: NorwegianCrs;
  center: Point2;
  /** Side length in metres. */
  size: number;
  /** Optional reference line (e.g. the existing road) in project CRS. */
  reference?: { name: string; points: Point2[] };
}

/**
 * Test area: Klæbuveien, Trondheim, from Gløshaugveien to Høgskoleveien (about 700 m).
 * Points from Kartverket's address register (EUREF89 UTM32): Gløshaugveien junction,
 * Klæbuveien 52, 26 and 1 / Høgskoleveien junction.
 */
export const KLAEBUVEIEN: ProjectArea = {
  id: 'klaebuveien',
  name: 'Klæbuveien, Trondheim',
  crs: 'EPSG:25832',
  center: { x: 569_840, y: 7_032_930 },
  size: 1200,
  reference: {
    name: 'Klæbuveien (Gløshaugveien–Høgskoleveien)',
    points: [
      { x: 569_880, y: 7_032_590 },
      { x: 569_830, y: 7_032_735 },
      { x: 569_757, y: 7_032_991 },
      { x: 569_835, y: 7_033_256 },
    ],
  },
};

/** Extent of a project area as min/max values. */
export function areaBounds(area: Pick<ProjectArea, 'center' | 'size'>) {
  const half = area.size / 2;
  return {
    minX: area.center.x - half,
    maxX: area.center.x + half,
    minY: area.center.y - half,
    maxY: area.center.y + half,
  };
}
