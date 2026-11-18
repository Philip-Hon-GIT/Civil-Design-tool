import { KLAEBUVEIEN } from './core/projects';
import type { BaseMap } from './io/kartverket';
import { ACCEPTED_TERRAIN_EXTENSIONS } from './io/terrainFiles';
import { buildCorridor, corridorFootprint, sectionAtStation } from './core/corridor';
import type { SectionTemplate } from './core/crossSection';
import { checkDesign, type DesignCriteria } from './core/designCriteria';
import { elevationAt, type Profile } from './core/profile';
import { SectionView } from './ui/sectionView';
import { mountTemplatePanel } from './ui/templatePanel';
import { buildRoadMesh } from './viewer/roadMesh';
import type { Mesh } from 'three';
import { mountAlignmentPanel } from './ui/alignmentPanel';
import { ProfileView } from './ui/profileView';
import { AlignmentView } from './viewer/alignmentView';
import { createViewer } from './viewer/createViewer';
import { addTerrainFile, type AddedTerrain } from './viewer/terrainImport';
import './style.css';

const target = document.querySelector<HTMLDivElement>('#viewer');
if (!target) throw new Error('Missing #viewer element');

const area = KLAEBUVEIEN;
const { instance, map, crs, controls, setBaseMap, setRoadFootprint } = createViewer({
  target,
  area,
});

const alignmentView = new AlignmentView(instance, map, controls, area.center);
const alignmentRoot = document.querySelector<HTMLElement>('#alignment-panel');
if (alignmentRoot) mountAlignmentPanel(alignmentRoot, alignmentView, area);

const ground = (x: number, y: number) => map.getElevationFast(x, y)?.elevation;
const profileRoot = document.querySelector<HTMLElement>('#profile');
const sectionRoot = document.querySelector<HTMLElement>('#section');
const templateRoot = document.querySelector<HTMLElement>('#template-panel');
if (profileRoot && sectionRoot && templateRoot) {
  const profileView = new ProfileView(profileRoot, ground);
  const sectionView = new SectionView(sectionRoot);
  let profile: Profile | null = null;
  let road: Mesh | null = null;
  let sectionStation = 0;
  let rebuildTimer = 0;

  const panel = mountTemplatePanel(templateRoot, (t, c, se) => {
    template = t;
    criteria = c;
    superelevation = se;
    rebuildRoad();
  });
  let template: SectionTemplate = panel.template();
  let criteria: DesignCriteria = panel.criteria();
  let superelevation = panel.superelevation();
  const corridorOptions = () => ({ speed: superelevation ? criteria.speed : undefined });

  const showSection = (station: number) => {
    sectionStation = station;
    const al = alignmentView.getAlignment();
    if (!al || !profile) return sectionView.show(null, () => undefined);
    const sec = sectionAtStation(al, profile, template, ground, station, corridorOptions());
    sectionView.show(sec, (o) => ground(sec.x + sec.rightX * o, sec.y + sec.rightY * o));
  };

  // Rebuild the 3D road, quantities and current section (debounced).
  function rebuildRoad() {
    clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => {
      if (road) {
        instance.remove(road);
        road.geometry.dispose();
        road = null;
      }
      setRoadFootprint(null);
      const al = alignmentView.getAlignment();
      if (al && profile) {
        const corridor = buildCorridor(al, profile, template, ground, 2, corridorOptions());
        road = buildRoadMesh(corridor, area.center);
        instance.add(road);
        setRoadFootprint(corridorFootprint(corridor));
        panel.setQuantities(corridor.cutVolume, corridor.fillVolume, al.length);
        panel.setIssues(checkDesign(al, profile, criteria));
        const s = Math.min(Math.max(sectionStation, al.startStation), al.startStation + al.length);
        showSection(s);
      }
      instance.notifyChange();
    }, 150);
  }

  alignmentView.onChange((al) => profileView.setAlignment(al));
  profileView.onChange((p) => {
    profile = p;
    alignmentView.setDesignElevation(p ? (s) => elevationAt(p, s) : null);
    rebuildRoad();
  });
  profileView.onHover(showSection);
  // Terrain tiles load progressively; refresh the ground line when they do.
  let timer = 0;
  map.addEventListener('elevation-changed', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      profileView.resampleGround();
      rebuildRoad();
    }, 500);
  });
}

const title = document.querySelector('#area-name');
if (title) title.textContent = `${area.name} · ${area.crs}`;

document.querySelector<HTMLSelectElement>('#basemap')?.addEventListener('change', (e) => {
  void setBaseMap((e.target as HTMLSelectElement).value as BaseMap | 'none');
});

// --- Add terrain: button, drag and drop, and the list of added sources ---
const list = document.querySelector<HTMLUListElement>('#terrain-list');
const status = document.querySelector<HTMLDivElement>('#status');
const fileInput = document.querySelector<HTMLInputElement>('#terrain-file');
if (fileInput) fileInput.accept = ACCEPTED_TERRAIN_EXTENSIONS;

function showStatus(text: string, isError = false) {
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('error', isError);
}

function addToList(entry: AddedTerrain) {
  const li = document.createElement('li');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = true;
  box.addEventListener('change', () => entry.setVisible(box.checked));
  const label = document.createElement('span');
  label.textContent = entry.name;
  label.title = `${entry.kind.toUpperCase()} · ${entry.name}`;
  const del = document.createElement('button');
  del.textContent = '×';
  del.title = 'Remove';
  del.addEventListener('click', () => {
    entry.remove();
    li.remove();
  });
  li.append(box, label, del);
  list?.append(li);
}

async function importFiles(files: Iterable<File>) {
  for (const file of files) {
    showStatus(`Loading ${file.name}…`);
    try {
      const entries = await addTerrainFile({ instance, map, crs }, file);
      entries.forEach(addToList);
      showStatus(`Added ${file.name}`);
    } catch (err) {
      showStatus(err instanceof Error ? err.message : String(err), true);
    }
  }
}

document.querySelector('#add-terrain')?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', () => {
  if (fileInput.files) void importFiles(Array.from(fileInput.files));
  fileInput.value = '';
});
target.addEventListener('dragover', (e) => {
  e.preventDefault();
  target.classList.add('dropping');
});
target.addEventListener('dragleave', () => target.classList.remove('dropping'));
target.addEventListener('drop', (e) => {
  e.preventDefault();
  target.classList.remove('dropping');
  if (e.dataTransfer?.files) void importFiles(Array.from(e.dataTransfer.files));
});
