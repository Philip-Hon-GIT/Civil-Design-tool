import { pointAtStation, type Alignment } from '../../core/alignment';
import { sameStructure, type Corridor } from '../../core/corridor';
import type { SectionPart, SectionTemplate } from '../../core/crossSection';
import { epsgCode } from '../../core/crs';
import type { DesignCriteria } from '../../core/designCriteria';
import { elevationAt, type Profile } from '../../core/profile';
import type { ProjectArea, Point2 } from '../../core/projects';
import { Enum, ifcGuid, Int, type Ref, StepFile, Typed, DERIVED } from './step';

export interface TerrainGrid {
  /** Lower-left corner in map coordinates, grid spacing and size. */
  x0: number;
  y0: number;
  step: number;
  nx: number;
  ny: number;
  /** Row-major heights (ny rows of nx), NaN where unknown. */
  z: Float64Array;
}

export interface IfcExportInput {
  area: ProjectArea;
  alignment: Alignment;
  profile: Profile;
  corridor: Corridor;
  template: SectionTemplate;
  criteria: DesignCriteria;
  terrain?: TerrainGrid;
  projectName?: string;
  timestamp?: string;
  random?: () => number;
}

const APP = 'Civil Design Tool';

/**
 * Export the design as IFC 4.3 (IFC4X3_ADD2):
 * - georeferencing with IfcMapConversion + IfcProjectedCRS (EUREF89 UTM, NN2000), with
 *   the project area centre as local origin so coordinates stay small
 * - IfcAlignment with horizontal and vertical business-logic segments and a 3D axis
 * - IfcRoad containing pavement, kerbs, slope fill/cut surfaces and the terrain
 */
export function exportIfc(input: IfcExportInput): string {
  const { area, alignment, profile, corridor } = input;
  const f = new StepFile();
  const guid = () => ifcGuid(input.random);
  const origin: Point2 = area.center;
  const L = (x: number, y: number): [number, number] => [x - origin.x, y - origin.y];

  // --- Units and contexts ---
  const metre = f.add('IfcSIUnit', DERIVED, new Enum('LENGTHUNIT'), null, new Enum('METRE'));
  const units = f.add('IfcUnitAssignment', [
    metre,
    f.add('IfcSIUnit', DERIVED, new Enum('AREAUNIT'), null, new Enum('SQUARE_METRE')),
    f.add('IfcSIUnit', DERIVED, new Enum('VOLUMEUNIT'), null, new Enum('CUBIC_METRE')),
    f.add('IfcSIUnit', DERIVED, new Enum('PLANEANGLEUNIT'), null, new Enum('RADIAN')),
  ]);
  const originPt = f.add('IfcCartesianPoint', [0, 0, 0]);
  const wcs = f.add('IfcAxis2Placement3D', originPt, null, null);
  const ctx = f.add(
    'IfcGeometricRepresentationContext',
    null,
    'Model',
    new Int(3),
    1e-5,
    wcs,
    null,
  );
  const body = f.add(
    'IfcGeometricRepresentationSubContext',
    'Body',
    'Model',
    DERIVED,
    DERIVED,
    DERIVED,
    DERIVED,
    ctx,
    null,
    new Enum('MODEL_VIEW'),
    null,
  );
  const axisCtx = f.add(
    'IfcGeometricRepresentationSubContext',
    'Axis',
    'Model',
    DERIVED,
    DERIVED,
    DERIVED,
    DERIVED,
    ctx,
    null,
    new Enum('GRAPH_VIEW'),
    null,
  );
  const zone = String(epsgCode(area.crs)).slice(-2);
  const crs = f.add(
    'IfcProjectedCRS',
    area.crs,
    `EUREF89 / UTM zone ${zone}N`,
    'EUREF89',
    'NN2000',
    'UTM',
    `${zone}N`,
    metre,
  );
  f.add('IfcMapConversion', ctx, crs, origin.x, origin.y, 0, 1, 0, 1);

  const project = f.add(
    'IfcProject',
    guid(),
    null,
    input.projectName ?? area.name,
    null,
    null,
    null,
    null,
    [ctx],
    units,
  );

  // --- Spatial structure ---
  const place = () =>
    f.add('IfcLocalPlacement', null, f.add('IfcAxis2Placement3D', originPt, null, null));
  const site = f.add(
    'IfcSite',
    guid(),
    null,
    area.name,
    null,
    null,
    place(),
    null,
    null,
    new Enum('ELEMENT'),
    null,
    null,
    null,
    null,
    null,
  );
  const road = f.add(
    'IfcRoad',
    guid(),
    null,
    'Road',
    null,
    null,
    place(),
    null,
    null,
    new Enum('ELEMENT'),
    new Enum('NOTDEFINED'),
  );
  f.add('IfcRelAggregates', guid(), null, null, null, project, [site]);
  f.add('IfcRelAggregates', guid(), null, null, null, site, [road]);

  // --- Alignment ---
  const ifcAlignment = f.add(
    'IfcAlignment',
    guid(),
    null,
    'Alignment',
    null,
    null,
    place(),
    axisShape(),
    new Enum('NOTDEFINED'),
  );
  const horiz = f.add('IfcAlignmentHorizontal', guid(), null, 'Horizontal', null, null, null, null);
  const vert = f.add('IfcAlignmentVertical', guid(), null, 'Vertical', null, null, null, null);
  f.add('IfcRelAggregates', guid(), null, null, null, project, [ifcAlignment]);
  f.add('IfcRelReferencedInSpatialStructure', guid(), null, null, null, [ifcAlignment], road);
  f.add('IfcRelNests', guid(), null, null, null, ifcAlignment, [horiz, vert]);

  const TYPE = { line: 'LINE', arc: 'CIRCULARARC', clothoid: 'CLOTHOID' } as const;
  const radius = (k: number) => (k === 0 ? 0 : 1 / k); // IFC: positive = left (counter-clockwise)
  const hSegs: Ref[] = alignment.elements.map((e, i) => {
    const [x, y] = L(e.x0, e.y0);
    const logic = f.add(
      'IfcAlignmentHorizontalSegment',
      null,
      null,
      f.add('IfcCartesianPoint', [x, y]),
      normalizeAngle(e.h0),
      radius(e.k0),
      radius(e.k1),
      e.length,
      null,
      new Enum(TYPE[e.type]),
    );
    return f.add(
      'IfcAlignmentSegment',
      guid(),
      null,
      `H${i + 1} ${e.type}`,
      null,
      null,
      null,
      null,
      logic,
    );
  });
  // Zero-length closing segment at the end, as required for IFC 4.3 alignments.
  const last = alignment.elements[alignment.elements.length - 1];
  if (last) {
    const endStation = alignment.startStation + alignment.length;
    const end = endPoint(alignment, endStation);
    const [x, y] = L(end.x, end.y);
    const logic = f.add(
      'IfcAlignmentHorizontalSegment',
      null,
      null,
      f.add('IfcCartesianPoint', [x, y]),
      normalizeAngle(end.heading),
      0,
      0,
      0,
      null,
      new Enum('LINE'),
    );
    hSegs.push(f.add('IfcAlignmentSegment', guid(), null, 'H end', null, null, null, null, logic));
  }
  f.add('IfcRelNests', guid(), null, null, null, horiz, hSegs);

  const vSegs = verticalSegments(profile).map((s, i) => {
    const logic = f.add(
      'IfcAlignmentVerticalSegment',
      null,
      null,
      s.start - alignment.startStation,
      s.length,
      s.startHeight,
      s.g1,
      s.g2,
      s.type === 'PARABOLICARC' ? s.radius : null,
      new Enum(s.type),
    );
    return f.add('IfcAlignmentSegment', guid(), null, `V${i + 1}`, null, null, null, null, logic);
  });
  f.add('IfcRelNests', guid(), null, null, null, vert, vSegs);

  function axisShape(): Ref {
    const pts: [number, number, number][] = [];
    const step = 2;
    for (
      let s = alignment.startStation;
      s <= alignment.startStation + alignment.length + 1e-6;
      s += step
    ) {
      const p = endPoint(alignment, s);
      pts.push([...L(p.x, p.y), elevationAt(profile, s)]);
    }
    const poly = f.add(
      'IfcPolyline',
      pts.map((p) => f.add('IfcCartesianPoint', p)),
    );
    const rep = f.add('IfcShapeRepresentation', axisCtx, 'Axis', 'Curve3D', [poly]);
    return f.add('IfcProductDefinitionShape', null, null, [rep]);
  }

  // --- Road elements from the corridor, one element per part type ---
  const contained: Ref[] = [];
  const PARTS: {
    parts: SectionPart[];
    entity: string;
    name: string;
    /** Predefined type; omitted for entities without one. */
    type?: string;
    objectType?: string;
  }[] = [
    { parts: ['lane'], entity: 'IfcPavement', name: 'Carriageway', type: 'FLEXIBLE' },
    { parts: ['shoulder'], entity: 'IfcPavement', name: 'Shoulders', type: 'FLEXIBLE' },
    {
      parts: ['footway'],
      entity: 'IfcPavement',
      name: 'Footway / gang- og sykkelveg',
      type: 'FLEXIBLE',
    },
    { parts: ['kerb'], entity: 'IfcKerb', name: 'Kerbs', type: 'NOTDEFINED' },
    { parts: ['fill'], entity: 'IfcEarthworksFill', name: 'Fill slopes', type: 'SLOPEFILL' },
    // IfcEarthworksCut is a void feature and cannot be contained in the road, so the cut
    // slope surface is a plain earthworks element.
    { parts: ['cut'], entity: 'IfcEarthworksElement', name: 'Cut slopes', objectType: 'CUTSLOPE' },
  ];
  for (const def of PARTS) {
    const mesh = corridorFaces(corridor, def.parts, L);
    if (mesh.indices.length === 0) continue;
    const shape = faceSetShape(mesh.coords, mesh.indices);
    contained.push(
      f.add(
        def.entity,
        guid(),
        null,
        def.name,
        null,
        def.objectType ?? null,
        place(),
        shape,
        null,
        ...(def.type ? [new Enum(def.type)] : []),
      ),
    );
  }

  if (input.terrain) {
    const mesh = terrainFaces(input.terrain, L);
    if (mesh.indices.length > 0) {
      const shape = faceSetShape(mesh.coords, mesh.indices);
      contained.push(
        f.add(
          'IfcGeographicElement',
          guid(),
          null,
          'Terrain (Kartverket DTM)',
          null,
          null,
          place(),
          shape,
          null,
          new Enum('TERRAIN'),
        ),
      );
    }
  }
  if (contained.length)
    f.add('IfcRelContainedInSpatialStructure', guid(), null, null, null, contained, road);

  // --- Design data as properties on the road ---
  const t = input.template;
  const c = input.criteria;
  const prop = (name: string, value: number | string, type = 'IfcLengthMeasure') =>
    f.add(
      'IfcPropertySingleValue',
      name,
      null,
      new Typed(typeof value === 'string' ? 'IfcLabel' : type, value),
      null,
    );
  const pset = f.add('IfcPropertySet', guid(), null, 'CDT_RoadDesign', null, [
    prop('DesignSpeed', `${c.speed} km/h`),
    prop('LaneWidth', t.laneWidth),
    prop('ShoulderWidth', t.shoulderWidth),
    prop('FootwayLeft', t.footwayLeft),
    prop('FootwayRight', t.footwayRight),
    prop('LaneCrossfall', t.laneCrossfall, 'IfcRatioMeasure'),
    prop('CutVolume', corridor.cutVolume, 'IfcVolumeMeasure'),
    prop('FillVolume', corridor.fillVolume, 'IfcVolumeMeasure'),
    prop('AlignmentLength', alignment.length),
  ]);
  f.add('IfcRelDefinesByProperties', guid(), null, null, null, [road], pset);

  function faceSetShape(coords: number[][], indices: number[][]): Ref {
    const list = f.add('IfcCartesianPointList3D', coords, null);
    const fs = f.add(
      'IfcTriangulatedFaceSet',
      list,
      null,
      false,
      indices.map((tri) => tri.map((i) => new Int(i))) as never,
      null,
    );
    const rep = f.add('IfcShapeRepresentation', body, 'Body', 'Tessellation', [fs]);
    return f.add('IfcProductDefinitionShape', null, null, [rep]);
  }

  return f.toString({
    name: `${(input.projectName ?? area.id).replace(/[^\w-]+/g, '_')}.ifc`,
    description: 'ViewDefinition [Alignment-basedReferenceView]',
    timestamp: input.timestamp ?? new Date().toISOString().slice(0, 19),
    app: APP,
  });
}

function normalizeAngle(a: number) {
  const t = a % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
}

function endPoint(al: Alignment, s: number) {
  return pointAtStation(al, s);
}

interface VSeg {
  start: number;
  length: number;
  startHeight: number;
  g1: number;
  g2: number;
  radius: number;
  type: 'CONSTANTGRADIENT' | 'PARABOLICARC';
}

/** Split a PVI profile into constant-gradient and parabolic segments, plus a zero-length end. */
export function verticalSegments(profile: Profile): VSeg[] {
  const { pvis, grades } = profile;
  const out: VSeg[] = [];
  if (pvis.length < 2) return out;
  const half = (i: number) => (i === 0 || i === pvis.length - 1 ? 0 : pvis[i]!.curveLength / 2);
  let s = pvis[0]!.station;
  for (let i = 0; i < pvis.length - 1; i++) {
    const g = grades[i]!;
    const tangentEnd = pvis[i + 1]!.station - half(i + 1);
    if (tangentEnd - s > 1e-9) {
      out.push({
        start: s,
        length: tangentEnd - s,
        startHeight: elevationAt(profile, s),
        g1: g,
        g2: g,
        radius: 0,
        type: 'CONSTANTGRADIENT',
      });
    }
    s = Math.max(s, tangentEnd);
    if (i + 1 < pvis.length - 1 && half(i + 1) > 0) {
      const len = pvis[i + 1]!.curveLength;
      const g2 = grades[i + 1]!;
      out.push({
        start: s,
        length: len,
        startHeight: elevationAt(profile, s),
        g1: g,
        g2,
        radius: g2 === g ? 0 : len / (g2 - g),
        type: 'PARABOLICARC',
      });
      s += len;
    }
  }
  const end = pvis[pvis.length - 1]!;
  const gEnd = grades[grades.length - 1]!;
  out.push({
    start: end.station,
    length: 0,
    startHeight: end.elevation,
    g1: gEnd,
    g2: gEnd,
    radius: 0,
    type: 'CONSTANTGRADIENT',
  });
  return out;
}

/** Triangles (1-based indices) of the given section parts, in local coordinates. */
export function corridorFaces(
  corridor: Corridor,
  parts: SectionPart[],
  L: (x: number, y: number) => [number, number],
) {
  const coords: number[][] = [];
  const indices: number[][] = [];
  const world = (s: Corridor['sections'][number], i: number) => {
    const p = s.points[i]!;
    return [...L(s.x + s.rightX * p.offset, s.y + s.rightY * p.offset), p.z];
  };
  for (let k = 1; k < corridor.sections.length; k++) {
    const a = corridor.sections[k - 1]!;
    const b = corridor.sections[k]!;
    if (!sameStructure(a, b)) continue;
    a.parts.forEach((part, i) => {
      if (!parts.includes(part)) return;
      const n = coords.length + 1;
      coords.push(world(a, i), world(a, i + 1), world(b, i), world(b, i + 1));
      indices.push([n, n + 2, n + 1], [n + 1, n + 2, n + 3]);
    });
  }
  return { coords, indices };
}

/** Triangulated grid of the terrain (1-based indices), skipping unknown heights. */
export function terrainFaces(t: TerrainGrid, L: (x: number, y: number) => [number, number]) {
  const coords: number[][] = [];
  const indices: number[][] = [];
  const idx = new Int32Array(t.nx * t.ny).fill(0);
  for (let j = 0; j < t.ny; j++) {
    for (let i = 0; i < t.nx; i++) {
      const z = t.z[j * t.nx + i]!;
      if (Number.isNaN(z)) continue;
      coords.push([...L(t.x0 + i * t.step, t.y0 + j * t.step), z]);
      idx[j * t.nx + i] = coords.length;
    }
  }
  for (let j = 0; j < t.ny - 1; j++) {
    for (let i = 0; i < t.nx - 1; i++) {
      const a = idx[j * t.nx + i]!;
      const b = idx[j * t.nx + i + 1]!;
      const c = idx[(j + 1) * t.nx + i]!;
      const d = idx[(j + 1) * t.nx + i + 1]!;
      if (a && b && d) indices.push([a, b, d]);
      if (a && d && c) indices.push([a, d, c]);
    }
  }
  return { coords, indices };
}
