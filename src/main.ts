import { createViewer } from './viewer/createViewer';
import './style.css';

const target = document.querySelector<HTMLDivElement>('#viewer');
if (!target) throw new Error('Missing #viewer element');

// Placeholder project area (Oslo, EUREF89 UTM33). Replaced by area picking in step 1.
createViewer({ target, center: { x: 262_000, y: 6_650_000 }, size: 2000 });
