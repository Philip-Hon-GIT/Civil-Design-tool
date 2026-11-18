export type TerrainFileKind = 'geotiff' | 'las' | 'landxml';

/** Which terrain importer handles a file, by extension. */
export function terrainFileKind(fileName: string): TerrainFileKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith('.tif') || name.endsWith('.tiff')) return 'geotiff';
  if (name.endsWith('.las') || name.endsWith('.laz')) return 'las';
  if (name.endsWith('.xml') || name.endsWith('.landxml')) return 'landxml';
  return null;
}

export const ACCEPTED_TERRAIN_EXTENSIONS = '.tif,.tiff,.las,.laz,.xml,.landxml';
