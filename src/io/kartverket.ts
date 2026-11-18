import { epsgCode, type NorwegianCrs } from '../core/crs';

/**
 * Kartverket / Geonorge open services. All of these allow cross-origin requests,
 * so the browser fetches them directly with no server in between.
 */

/**
 * WCS 1.0.0 GetCoverage URL template for the national 1 m terrain model (DTM, NHM).
 * Uses Giro3D UrlImageSource placeholders ({minx}, {width}, ...). Returns GeoTIFF heights.
 */
export function dtmWcsTemplate(crs: NorwegianCrs): string {
  const code = epsgCode(crs);
  return (
    `https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-${code}?service=WCS&version=1.0.0` +
    `&request=GetCoverage&coverage=nhm_dtm_topo_${code}&crs=EPSG:${code}` +
    `&bbox={minx},{miny},{maxx},{maxy}&width={width}&height={height}&format=GeoTIFF`
  );
}

/** Kartverket WMTS capabilities (topo, topograatone, toporaster in utm32n/33n/35n). */
export const KARTVERKET_WMTS_CAPABILITIES =
  'https://cache.kartverket.no/v1/wmts/1.0.0/WMTSCapabilities.xml';

export type BaseMap = 'topo' | 'topograatone';
