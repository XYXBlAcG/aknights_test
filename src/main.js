import './styles.css';
import trainingGround from '../maps/training-ground.json';
import crossroads from '../maps/crossroads.json';
import mazeFortress from '../maps/maze-fortress.json';
import neuralDamageLab from '../maps/neural-damage-lab.json';
import restrictedEntryTest from '../maps/restricted-entry-test.json';
import highValueBreakthrough from '../maps/high-value-breakthrough.json';
import crisisKillzone from '../maps/crisis-killzone.json';
import { DEFAULT_ENEMIES } from './data/defaultEnemies.js';
import { DEFAULT_OPERATORS } from './data/defaultOperators.js';
import { loadCustomCatalogs, mergeCatalogs } from './data/CatalogStore.js';
import { buildMapLibrary, loadCustomMapLibrary } from './data/MapLibraryStore.js';
import { CanvasRenderer } from './renderers/CanvasRenderer.js';
import { UIController } from './ui/UIController.js';

const app = document.querySelector('#app');
const canvas = document.querySelector('#battlefield');

if (app && canvas) {
  app.dataset.ready = 'true';
  const renderer = new CanvasRenderer(canvas);
  const customCatalogs = loadCustomCatalogs();
  const customMaps = loadCustomMapLibrary();
  const mergedCatalogs = mergeCatalogs(DEFAULT_OPERATORS, DEFAULT_ENEMIES, customCatalogs.data);
  if ([...customCatalogs.errors, ...mergedCatalogs.errors, ...customMaps.errors].length > 0) {
    console.warn('Custom data load warnings', [...customCatalogs.errors, ...mergedCatalogs.errors, ...customMaps.errors]);
  }
  const defaultMaps = [
    trainingGround,
    crossroads,
    mazeFortress,
    neuralDamageLab,
    restrictedEntryTest,
    highValueBreakthrough,
    crisisKillzone
  ];
  new UIController({
    root: app,
    canvas,
    renderer,
    maps: defaultMaps,
    mapEntries: buildMapLibrary(defaultMaps, customMaps.maps),
    operatorCatalog: mergedCatalogs.operatorCatalog,
    enemyCatalog: mergedCatalogs.enemyCatalog
  });
}
