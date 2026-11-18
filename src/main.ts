import { KLAEBUVEIEN } from './core/projects';
import type { BaseMap } from './io/kartverket';
import { ACCEPTED_TERRAIN_EXTENSIONS } from './io/terrainFiles';
import { createViewer } from './viewer/createViewer';
import { addTerrainFile, type AddedTerrain } from './viewer/terrainImport';
import './style.css';

const target = document.querySelector<HTMLDivElement>('#viewer');
if (!target) throw new Error('Missing #viewer element');

const area = KLAEBUVEIEN;
const { instance, map, crs, setBaseMap } = createViewer({ target, area });

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
