import './styles.css';
import trainingGround from '../maps/training-ground.json';
import crossroads from '../maps/crossroads.json';
import mazeFortress from '../maps/maze-fortress.json';
import { DEFAULT_ENEMIES } from './data/defaultEnemies.js';
import { DEFAULT_OPERATORS } from './data/defaultOperators.js';
import { CanvasRenderer } from './renderers/CanvasRenderer.js';
import { UIController } from './ui/UIController.js';

const app = document.querySelector('#app');
const canvas = document.querySelector('#battlefield');

if (app && canvas) {
  app.dataset.ready = 'true';
  const renderer = new CanvasRenderer(canvas);
  new UIController({
    root: app,
    canvas,
    renderer,
    maps: [trainingGround, crossroads, mazeFortress],
    operatorCatalog: DEFAULT_OPERATORS,
    enemyCatalog: DEFAULT_ENEMIES
  });
}
