import './style.css';
import { loadData } from './data.js';
import { G } from './game.js';

(async () => {
  await loadData();
  try { await document.fonts.load('700 16px "Pixelify Sans"'); } catch {}
  G.init();
})();
