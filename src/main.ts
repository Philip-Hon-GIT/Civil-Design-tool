import { KLAEBUVEIEN } from './core/projects';
import type { BaseMap } from './io/kartverket';
import { createViewer } from './viewer/createViewer';
import './style.css';

const target = document.querySelector<HTMLDivElement>('#viewer');
if (!target) throw new Error('Missing #viewer element');

const area = KLAEBUVEIEN;
const { setBaseMap } = createViewer({ target, area });

const title = document.querySelector('#area-name');
if (title) title.textContent = `${area.name} · ${area.crs}`;

document.querySelector<HTMLSelectElement>('#basemap')?.addEventListener('change', (e) => {
  void setBaseMap((e.target as HTMLSelectElement).value as BaseMap | 'none');
});
