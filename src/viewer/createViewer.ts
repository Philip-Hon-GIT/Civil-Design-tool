import Instance from '@giro3d/giro3d/core/Instance.js';
import CoordinateSystem from '@giro3d/giro3d/core/geographic/CoordinateSystem.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import MaskLayer, { MaskMode } from '@giro3d/giro3d/core/layer/MaskLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';
import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import { Fill, Style } from 'ol/style.js';
import { MapLightingMode } from '@giro3d/giro3d/entities/MapLightingOptions.js';
import GeoTIFFFormat from '@giro3d/giro3d/formats/GeoTIFFFormat.js';
import UrlImageSource from '@giro3d/giro3d/sources/UrlImageSource.js';
import WmtsSource from '@giro3d/giro3d/sources/WmtsSource.js';
import {
  BufferGeometry,
  DirectionalLight,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Vector3,
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CRS_DEFS, utmMatrixSet } from '../core/crs';
import { areaBounds, type ProjectArea } from '../core/projects';
import { type BaseMap, dtmWcsTemplate, KARTVERKET_WMTS_CAPABILITIES } from '../io/kartverket';

export interface ViewerOptions {
  target: HTMLDivElement;
  area: ProjectArea;
}

/**
 * Create the 3D viewer for a project area: Kartverket 1 m terrain (DTM) as elevation,
 * a Kartverket base map draped on top, and the area's reference line.
 */
export function createViewer({ target, area }: ViewerOptions) {
  const crs = CoordinateSystem.register(area.crs, CRS_DEFS[area.crs]);
  const instance = new Instance({ target, crs, backgroundColor: '#1e2530' });
  const extent = new Extent(crs, areaBounds(area));

  const map = new Map({
    extent,
    backgroundColor: '#5b6b5a',
    lighting: { enabled: true, mode: MapLightingMode.Hillshade, elevationLayersOnly: true },
  });
  void instance.add(map);

  const terrain = new ElevationLayer({
    name: 'Terrain (Kartverket DTM 1 m)',
    extent,
    source: new UrlImageSource({
      urlTemplate: dtmWcsTemplate(area.crs),
      format: new GeoTIFFFormat(),
      crs,
      httpTimeout: 20000,
    }),
  });
  void map.addLayer(terrain);

  const baseMaps: Partial<Record<BaseMap, ColorLayer>> = {};
  async function setBaseMap(name: BaseMap | 'none') {
    for (const [key, layer] of Object.entries(baseMaps)) layer.visible = key === name;
    if (name === 'none' || baseMaps[name]) {
      instance.notifyChange(map);
      return;
    }
    const source = await WmtsSource.fromCapabilities(KARTVERKET_WMTS_CAPABILITIES, {
      layer: name,
      matrixSet: utmMatrixSet(area.crs),
      imageFormat: 'image/png',
    });
    const layer = new ColorLayer({ name, extent, source });
    baseMaps[name] = layer;
    await map.addLayer(layer);
  }
  void setBaseMap('topograatone');

  // Reference line (existing road), draped on the terrain once heights are available.
  const refPoints = area.reference?.points ?? [];
  const refLine = new Line(
    new BufferGeometry().setFromPoints(refPoints.map((p) => new Vector3(p.x, p.y, 0))),
    new LineBasicMaterial({ color: '#ff8a3d', depthTest: false }),
  );
  refLine.renderOrder = 10;
  instance.add(refLine);
  map.addEventListener('elevation-changed', () => {
    const pts = refPoints.map(
      (p) => new Vector3(p.x, p.y, (map.getElevationFast(p.x, p.y)?.elevation ?? 0) + 1.5),
    );
    refLine.geometry.setFromPoints(pts);
    instance.notifyChange(refLine);
  });

  // Camera: oblique view from the south-east over the area.
  const { center, size } = area;
  instance.view.camera.position.set(center.x + size * 0.4, center.y - size * 0.8, size * 0.6);
  const controls = new MapControls(instance.view.camera, instance.domElement);
  controls.target.set(center.x, center.y, 50);
  controls.enableDamping = true;
  instance.view.setControls(controls);

  // Terrain mask: hides the terrain inside the road footprint so a road in cut is visible.
  const maskSource = new VectorSource({
    data: [],
    style: new Style({ fill: new Fill({ color: 'white' }) }),
  });
  const mask = new MaskLayer({ name: 'Road footprint', source: maskSource });
  mask.maskMode = MaskMode.Inverted;
  void map.addLayer(mask);
  function setRoadFootprint(ring: [number, number][] | null) {
    maskSource.clear();
    if (ring && ring.length > 3) maskSource.addFeature(new Feature(new Polygon([ring])));
    instance.notifyChange(map);
  }

  // Lights for imported meshes (the map itself uses hillshading).
  instance.add(new HemisphereLight('#ffffff', '#445566', 1.2));
  const sun = new DirectionalLight('#ffffff', 1.5);
  sun.position.set(center.x - 1000, center.y + 1000, 2000);
  sun.target.position.set(center.x, center.y, 0);
  instance.add(sun);
  instance.add(sun.target);

  return { instance, map, extent, crs, controls, setBaseMap, setRoadFootprint };
}
