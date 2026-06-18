import './styles.css';
import { loadCustomCatalogs } from './data/CatalogStore.js';
import { CustomEditorController } from './custom-editor/CustomEditorController.js';
import { createCustomEditorState } from './custom-editor/CustomEditorModel.js';

const app = document.querySelector('#custom-editor-app');

if (app) {
  const loaded = loadCustomCatalogs();
  const state = createCustomEditorState(loaded.data);
  new CustomEditorController({
    root: app,
    initialState: {
      ...state,
      message: loaded.errors.join('\n') || state.message
    }
  });
}
