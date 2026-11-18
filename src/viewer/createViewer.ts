import Instance from '@giro3d/giro3d/core/Instance.js';
import CoordinateSystem from '@giro3d/giro3d/core/geographic/CoordinateSystem.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CRS_DEFS, DEFAULT_CRS } from '../core/crs';

export interface ViewerOptions {
  target: HTMLDivElement;
  /** Centre of the project area in project CRS (metres). */
  center: { x: number; y: number };
  /** Side length of the square project area in metres. */
  size?: number;
}

/**
 * Create the 3D viewer: a Giro3D instance in Norwegian UTM coordinates with an
 * empty map covering the project area. Terrain and GIS layers are added in step 1.
 */
export function createViewer({ target, center, size = 2000 }: ViewerOptions) {
  const crs = CoordinateSystem.register(DEFAULT_CRS, CRS_DEFS[DEFAULT_CRS]);
  const instance = new Instance({ target, crs, backgroundColor: '#1e2530' });

  const half = size / 2;
  const extent = new Extent(crs, {
    minX: center.x - half,
    maxX: center.x + half,
    minY: center.y - half,
    maxY: center.y + half,
  });

  const map = new Map({ extent, backgroundColor: '#5b6b5a' });
  void instance.add(map);

  instance.view.camera.position.set(center.x, center.y - size, size * 0.8);
  const controls = new MapControls(instance.view.camera, instance.domElement);
  controls.target.set(center.x, center.y, 0);
  controls.enableDamping = true;
  instance.view.setControls(controls);

  return { instance, map, extent };
}
