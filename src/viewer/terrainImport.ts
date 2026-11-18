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
  Mesh,
  MeshLambertMaterial,
  type Object3D,
} from 'three';
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
