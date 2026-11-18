# Civil Design Tool

A browser-based GIS+BIM road design tool for smaller municipal road projects.
Pick an area, bring in terrain and map data, design a road, and export IFC 4.3. No installation.

**Try it:** https://philip-hon-git.github.io/Civil-Design-tool/ (deployed from `main`).

## Status

Working prototype on Klæbuveien, Trondheim: Kartverket terrain and map layers, survey import
(GeoTIFF, LAS/LAZ, LandXML, SOSI, DXF), alignment, profile, cross-sections, 3D road with
cut/fill, road class checks and IFC 4.3 export.

## Getting started

```bash
npm install
npm run dev     # open the printed URL
npm run check   # typecheck, lint and tests
```

Requires Node 22.

## Plan

1. Real-world base: pick an area, load Kartverket terrain, orthophoto and GIS layers, import GeoTIFF, LAS and LandXML.
2. Road design on that base: alignment, profile and cross-sections with municipal road norm presets.
3. Georeferenced IFC 4.3 export, validated with buildingSMART tools.
4. Test on a real municipal road.

## Data

Real project data goes in `data/` (git-ignored). Only small open test files go in `samples/`.
