import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLandXmlSurfaces } from '../src/io/landxml';
import { terrainFileKind } from '../src/io/terrainFiles';

describe('parseLandXmlSurfaces', () => {
  it('reads the sample surface with east/north swapped to x/y', () => {
    const xml = readFileSync(new URL('../samples/small-surface.landxml', import.meta.url), 'utf8');
    const [s] = parseLandXmlSurfaces(xml);
    expect(s?.name).toBe('Test survey');
    expect(s?.positions.length).toBe(9 * 3);
    expect(s?.indices.length).toBe(8 * 3);
    expect(Array.from(s?.positions.slice(0, 3) ?? [])).toEqual([569780, 7032850, 60]);
  });

  it('skips invisible faces and faces with unknown points', () => {
    const xml = `<Surface name="a"><P id="a">1 2 3</P><P id="b">4 5 6</P><P id="c">7 8 9</P>
      <F>a b c</F><F i="1">a b c</F><F>a b x</F></Surface>`;
    const [s] = parseLandXmlSurfaces(xml);
    expect(s?.indices.length).toBe(3);
  });

  it('returns nothing for a file without faces', () => {
    expect(parseLandXmlSurfaces('<LandXML/>')).toEqual([]);
  });
});

describe('terrainFileKind', () => {
  it('maps extensions to importers', () => {
    expect(terrainFileKind('DTM.TIF')).toBe('geotiff');
    expect(terrainFileKind('scan.laz')).toBe('las');
    expect(terrainFileKind('survey.xml')).toBe('landxml');
    expect(terrainFileKind('drawing.dwg')).toBeNull();
  });
});
