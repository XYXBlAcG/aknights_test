import './styles.css';
import { DEFAULT_ENEMIES } from './data/defaultEnemies.js';
import { DEFAULT_OPERATORS } from './data/defaultOperators.js';
import { loadCustomCatalogs, mergeCatalogs } from './data/CatalogStore.js';
import { EditorController } from './editor/EditorController.js';
import { EditorRenderer } from './editor/EditorRenderer.js';

const app = document.querySelector('#editor-app');
const canvas = document.querySelector('#editor-canvas');

if (app && canvas) {
  const renderer = new EditorRenderer(canvas);
  const customCatalogs = loadCustomCatalogs();
  const mergedCatalogs = mergeCatalogs(DEFAULT_OPERATORS, DEFAULT_ENEMIES, customCatalogs.data);
  if ([...customCatalogs.errors, ...mergedCatalogs.errors].length > 0) {
    console.warn('Custom catalog load warnings', [...customCatalogs.errors, ...mergedCatalogs.errors]);
  }
  new EditorController({
    root: app,
    canvas,
    renderer,
    enemyCatalog: mergedCatalogs.enemyCatalog
  });
}
