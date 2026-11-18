# Civil Design Tool

Browser-based GIS+BIM road design tool for smaller municipal road projects in Norway.
Users: designers, consultants, contractors and municipal clients who want a good-enough
model with minimal effort. Roads first, utilities later.

## Principles

- Quick and simple: a user should get from "pick an area" to a 3D road in minutes.
- Runs in the browser, no install. Heavy work in Web Workers / WASM, not a server, unless unavoidable.
- Open standards: IFC 4.3 (IfcAlignment, IfcRoad), georeferenced with IfcMapConversion.
- Norwegian context: EUREF89 UTM (EPSG:25832/25833/25835, default 25833), Kartverket and
  Geonorge open data, Statens vegvesen N100 and municipal road norms (kommunal vegnorm).

## Stack

- TypeScript, Vite, Vitest, ESLint, Prettier. Node 22.
- Giro3D (Three.js-based geospatial engine) for terrain, map layers and point clouds.
  Giro3D 2.x pins `three` to 0.180.x; keep `three` and `@types/three` in step with it.
- IFC: That Open Engine / web-ifc (to be added).

## Layout

- `src/core/` pure domain logic (geometry, stations, CRS). No DOM. Must have unit tests.
- `src/viewer/` 3D viewer and rendering.
- `src/io/` importers and exporters (GeoTIFF, LAS/LAZ, LandXML, SOSI, DWG/DXF, IFC) (to be added).
- `tests/` Vitest unit tests, mirroring `src/`.
- `samples/` small open test data only. `data/` is local and git-ignored.

## Commands

- `npm run dev` start the dev server
- `npm run check` typecheck + lint + tests (run before every commit)
- `npm run build` production build
- `npm run format` Prettier

## Rules

- Never commit project, client or survey data, or secrets. `.gitignore` covers common formats; keep it that way.
- Work on a branch and open a pull request; CI must pass.
- Keep changes small and focused. The owner wants this project to stay within about half
  of their weekly token budget, so prefer simple solutions and avoid speculative work.
