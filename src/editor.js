import './styles.css';
import { EditorController } from './editor/EditorController.js';
import { EditorRenderer } from './editor/EditorRenderer.js';

const app = document.querySelector('#editor-app');
const canvas = document.querySelector('#editor-canvas');

if (app && canvas) {
  const renderer = new EditorRenderer(canvas);
  new EditorController({ root: app, canvas, renderer });
}
