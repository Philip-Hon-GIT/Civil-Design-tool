/**
 * Norwegian projected coordinate systems (EUREF89 / UTM).
 * All design work happens in one of these, in metres.
 */
export const CRS_DEFS = {
  'EPSG:25832':
    '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:25833':
    '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:25835':
    '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
} as const;

export type NorwegianCrs = keyof typeof CRS_DEFS;

/** Default project CRS: EUREF89 UTM zone 33, used by Kartverket's national datasets. */
export const DEFAULT_CRS: NorwegianCrs = 'EPSG:25833';
