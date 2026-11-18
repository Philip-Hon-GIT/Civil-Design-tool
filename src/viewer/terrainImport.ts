import type Instance from '@giro3d/giro3d/core/Instance.js';
import type CoordinateSystem from '@giro3d/giro3d/core/geographic/CoordinateSystem.js';
import ColorMap from '@giro3d/giro3d/core/ColorMap.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import type Map from '@giro3d/giro3d/entities/Map.js';
import PointCloud from '@giro3d/giro3d/entities/PointCloud.js';
import GeoTIFFSource from '@giro3d/giro3d/sources/GeoTIFFSource.js';
import LASSource from '@giro3d/giro3d/sources/LASSource.js';
import { setLazPerfPath } from '@giro3d/giro3d/sources/las/config.js';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  Points,
  PointsMaterial,
} from 'three';
import { epsgCode, type NorwegianCrs } from '../core/crs';
import { parseDxf } from '../io/dxf';
import { decodeSosi, parseSosi } from '../io/sosi';
import type { VectorData } from '../io/vector';
import { parseLandXmlSurfaces } from '../io/landxml';
import { terrainFileKind, type TerrainFileKind } from '../io/terrainFiles';

/** A terrain source the user added on top of the Kartverket base terrain. */
export interface AddedTerrain {
  name: string;
  kind: TerrainFileKind;
  setVisible(visible: boolean): void;
  remove(): void;
}

// Serve the LAZ decoder (WebAssembly) from our own site instead of a CDN.
// public/wasm/laz-perf.wasm is copied from node_modules/laz-perf/lib (keep versions in step).
setLazPerfPath(`${import.meta.env.BASE_URL}wasm`);

interface Context {
  instance: Instance;
  map: Map;
  crs: CoordinateSystem;
}

/**
 * Add a user's survey file as terrain. Supported:
 * - GeoTIFF DTM: added as an elevation layer above the Kartverket DTM (overrides it where it has data).
 * - LAS/LAZ point cloud: shown as points, ground class (2) only.
 * - LandXML TIN surfaces: shown as meshes.
 * - SOSI and DXF points and lines: shown as 3D vectors, coloured by type or layer.
 * Files are read locally in the browser and never uploaded.
 */
export async function addTerrainFile(ctx: Context, file: File): Promise<AddedTerrain[]> {
  const kind = terrainFileKind(file.name);
  switch (kind) {
    case 'geotiff':
      return [await addGeoTiff(ctx, file)];
    case 'las':
      return [await addLas(ctx, file)];
    case 'landxml':
      return addLandXml(ctx, file);
    case 'sosi': {
      const data = parseSosi(decodeSosi(new Uint8Array(await file.arrayBuffer())));
      const projectEpsg = epsgCode(ctx.crs.id as NorwegianCrs);
      if (data.epsg && data.epsg !== projectEpsg) {
        throw new Error(
          `${file.name} is in EPSG:${data.epsg}, the project uses EPSG:${projectEpsg}`,
        );
      }
      return [addVector(ctx, file.name, kind, data)];
    }
    case 'dxf':
      return [addVector(ctx, file.name, kind, parseDxf(await file.text()))];
    case 'dwg':
      throw new Error(`DWG is not supported yet. Save ${file.name} as DXF and add that instead.`);
    default:
      throw new Error(`Unsupported file type: ${file.name}`);
  }
}

async function addGeoTiff({ instance, map, crs }: Context, file: File): Promise<AddedTerrain> {
  const url = URL.createObjectURL(file);
  const layer = new ElevationLayer({
    name: file.name,
    source: new GeoTIFFSource({ url, crs }),
  });
  await map.addLayer(layer);
  return {
    name: file.name,
    kind: 'geotiff',
    setVisible(v) {
      layer.visible = v;
      instance.notifyChange(map);
    },
    remove() {
      map.removeLayer(layer, { disposeLayer: true });
      URL.revokeObjectURL(url);
    },
  };
}

async function addLas({ instance }: Context, file: File): Promise<AddedTerrain> {
  const source = new LASSource({
    url: async () => new Uint8Array(await file.arrayBuffer()),
    filters: [{ dimension: 'Classification', operator: 'equal', value: 2 }],
  });
  const cloud = new PointCloud({ source });
  await instance.add(cloud);
  cloud.setColoringMode('attribute');
  cloud.setActiveAttribute('Z');
  const box = cloud.getBoundingBox();
  if (box) {
    // Colour points by height: blue (low) to yellow (high).
    const colors = ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61'].map((c) => new Color(c));
    cloud.setAttributeColorMap('Z', new ColorMap({ colors, min: box.min.z, max: box.max.z }));
  }
  cloud.pointSize = 3;
  return {
    name: file.name,
    kind: 'las',
    setVisible(v) {
      cloud.visible = v;
      instance.notifyChange(cloud);
    },
    remove() {
      instance.remove(cloud);
    },
  };
}

async function addLandXml({ instance }: Context, file: File): Promise<AddedTerrain[]> {
  const surfaces = parseLandXmlSurfaces(await file.text());
  if (surfaces.length === 0) throw new Error(`No TIN surfaces found in ${file.name}`);
  return surfaces.map((s) => {
    const mesh = tinMesh(s.positions, s.indices);
    mesh.name = s.name;
    instance.add(mesh);
    instance.notifyChange(mesh);
    return objectEntry(instance, `${file.name} · ${s.name}`, 'landxml', mesh);
  });
}

// Colours for vector feature types (SOSI OBJTYPE or DXF layer), assigned in order of appearance.
const TYPE_COLORS = ['#ff5ca8', '#ffd23f', '#3fe0d0', '#b48cff', '#7ddc5a', '#ff8a3d', '#5cb8ff'];

/**
 * Show survey/CAD vectors as 3D lines and points. Vertices without a height are draped
 * on the terrain as it is loaded when the file is added.
 */
function addVector(
  { instance, map }: Context,
  name: string,
  kind: TerrainFileKind,
  data: VectorData,
): AddedTerrain {
  if (data.features.length === 0) throw new Error(`No points or lines found in ${name}`);
  const first = data.features[0]!.coords;
  const ox = first[0]!;
  const oy = first[1]!;
  const colorOf = new globalThis.Map<string, Color>();
  const color = (type: string) => {
    let c = colorOf.get(type);
    if (!c) {
      c = new Color(TYPE_COLORS[colorOf.size % TYPE_COLORS.length]);
      colorOf.set(type, c);
    }
    return c;
  };
  const vertex = (coords: number[], i: number) => {
    const x = coords[i]!;
    const y = coords[i + 1]!;
    let z = coords[i + 2]!;
    if (Number.isNaN(z)) z = (map.getElevationFast(x, y)?.elevation ?? 0) + 0.2;
    return [x - ox, y - oy, z];
  };
  const linePos: number[] = [];
  const lineCol: number[] = [];
  const ptPos: number[] = [];
  const ptCol: number[] = [];
  for (const f of data.features) {
    const c = color(f.type);
    if (f.kind === 'point') {
      ptPos.push(...vertex(f.coords, 0));
      ptCol.push(c.r, c.g, c.b);
      continue;
    }
    for (let i = 3; i < f.coords.length; i += 3) {
      linePos.push(...vertex(f.coords, i - 3), ...vertex(f.coords, i));
      lineCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
  }
  const group = new Group();
  group.name = name;
  const geometry = (pos: number[], col: number[]) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    return g;
  };
  if (linePos.length) {
    group.add(
      new LineSegments(geometry(linePos, lineCol), new LineBasicMaterial({ vertexColors: true })),
    );
  }
  if (ptPos.length) {
    group.add(
      new Points(
        geometry(ptPos, ptCol),
        new PointsMaterial({ vertexColors: true, size: 6, sizeAttenuation: false }),
      ),
    );
  }
  group.position.set(ox, oy, 0);
  group.updateMatrixWorld(true);
  instance.add(group);
  instance.notifyChange(group);
  const types = [...colorOf.keys()];
  const label = `${name} · ${data.features.length} features (${types.slice(0, 3).join(', ')}${types.length > 3 ? ', …' : ''})`;
  return objectEntry(instance, label, kind, group);
}

/** Build a mesh with a local origin, so large UTM coordinates keep full precision. */
function tinMesh(positions: Float64Array, indices: Uint32Array): Mesh {
  const ox = positions[0] ?? 0;
  const oy = positions[1] ?? 0;
  const local = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    local[i] = (positions[i] ?? 0) - ox;
    local[i + 1] = (positions[i + 1] ?? 0) - oy;
    local[i + 2] = positions[i + 2] ?? 0;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(local, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshLambertMaterial({ color: '#4fb3d9', transparent: true, opacity: 0.85 }),
  );
  mesh.position.set(ox, oy, 0.05);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function objectEntry(
  instance: Instance,
  name: string,
  kind: TerrainFileKind,
  obj: Object3D,
): AddedTerrain {
  return {
    name,
    kind,
    setVisible(v) {
      obj.visible = v;
      instance.notifyChange(obj);
    },
    remove() {
      instance.remove(obj);
    },
  };
}
