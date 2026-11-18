import { describe, expect, it } from 'vitest';
import { epsgCode, utmMatrixSet } from '../src/core/crs';
import { areaBounds, KLAEBUVEIEN } from '../src/core/projects';
import { dtmWcsTemplate } from '../src/io/kartverket';

describe('crs helpers', () => {
  it('extracts EPSG code and WMTS matrix set', () => {
    expect(epsgCode('EPSG:25832')).toBe(25832);
    expect(utmMatrixSet('EPSG:25832')).toBe('utm32n');
    expect(utmMatrixSet('EPSG:25833')).toBe('utm33n');
  });
});

describe('dtmWcsTemplate', () => {
  it('targets the DTM coverage in the project CRS', () => {
    const url = dtmWcsTemplate('EPSG:25832');
    expect(url).toContain('wcs.hoyde-dtm-nhm-25832');
    expect(url).toContain('coverage=nhm_dtm_topo_25832');
    expect(url).toContain('bbox={minx},{miny},{maxx},{maxy}');
    expect(url).toContain('format=GeoTIFF');
  });
});

describe('Klæbuveien test area', () => {
  it('contains the whole reference road', () => {
    const b = areaBounds(KLAEBUVEIEN);
    for (const p of KLAEBUVEIEN.reference?.points ?? []) {
      expect(p.x).toBeGreaterThan(b.minX);
      expect(p.x).toBeLessThan(b.maxX);
      expect(p.y).toBeGreaterThan(b.minY);
      expect(p.y).toBeLessThan(b.maxY);
    }
  });
});
