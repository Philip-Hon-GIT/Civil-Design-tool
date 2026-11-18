/** Vector features read from survey and CAD files (SOSI, DXF), in map coordinates. */
export interface VectorFeature {
  kind: 'point' | 'line';
  /** SOSI OBJTYPE or DXF layer. */
  type: string;
  /** Flat x, y, z triples. z is NaN when the file has no height for the vertex. */
  coords: number[];
}

export interface VectorData {
  features: VectorFeature[];
  /** EPSG code from the file, if it says (SOSI KOORDSYS). */
  epsg?: number;
}
