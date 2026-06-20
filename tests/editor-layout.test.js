import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const editorHtml = readFileSync(new URL('../editor.html', import.meta.url), 'utf8');

test('editor layout keeps side panels scrollable without expanding the battlefield', () => {
  const editorApp = cssBlock('#editor-app');
  const editorShell = cssBlock('.editor-shell');
  const sidebars = cssBlock('.editor-left,\\s*\\.editor-right');

  assert.match(editorApp, /height:\s*100vh;/);
  assert.match(editorShell, /overflow:\s*hidden;/);
  assert.match(sidebars, /height:\s*100%;/);
  assert.match(sidebars, /overflow-y:\s*auto;/);
  assert.match(sidebars, /overflow-x:\s*hidden;/);
});

test('battle layout keeps the operator deck scrollable without moving the battlefield', () => {
  const app = cssBlock('#app');
  const battleShell = cssBlock('.battle-shell');
  const bottomShell = cssBlock('.bottom-shell');
  const operatorDeck = cssBlock('.operator-deck');
  const mapLibraryPanel = cssBlock('.map-library-panel');
  const infoPanel = cssBlock('.info-panel');
  const controlPanel = cssBlock('.control-panel');
  const enemyIntelPanel = cssBlock('.enemy-intel-panel');

  assert.match(app, /height:\s*100vh;/);
  assert.match(battleShell, /overflow:\s*hidden;/);
  assert.match(mapLibraryPanel, /overflow:\s*auto;/);
  assert.match(infoPanel, /min-height:\s*0;/);
  assert.match(infoPanel, /overflow:\s*auto;/);
  assert.match(bottomShell, /min-height:\s*0;/);
  assert.match(bottomShell, /overflow:\s*hidden;/);
  assert.match(operatorDeck, /overflow-x:\s*auto;/);
  assert.match(operatorDeck, /overflow-y:\s*hidden;/);
  assert.match(operatorDeck, /grid-auto-flow:\s*column;/);
  assert.match(controlPanel, /min-height:\s*0;/);
  assert.match(controlPanel, /overflow:\s*auto;/);
  assert.match(enemyIntelPanel, /max-height:\s*calc\(100vh - 180px\);/);
  assert.match(enemyIntelPanel, /overflow:\s*auto;/);
});

test('custom editor panels scroll inside the viewport', () => {
  const app = cssBlock('#custom-editor-app');
  const shell = cssBlock('.custom-editor-shell');
  const panels = cssBlock('.custom-list-panel,\\s*\\.custom-form-panel,\\s*\\.custom-side-panel');

  assert.match(app, /height:\s*100vh;/);
  assert.match(app, /grid-template-rows:\s*58px 1fr;/);
  assert.match(shell, /min-height:\s*0;/);
  assert.match(shell, /overflow:\s*hidden;/);
  assert.match(panels, /min-height:\s*0;/);
  assert.match(panels, /overflow:\s*auto;/);
});

test('editor exposes deployability tools and waypoint action controls', () => {
  assert.match(editorHtml, /data-deployability="false"/);
  assert.match(editorHtml, /data-deployability="true"/);
  assert.match(editorHtml, /id="waypoint-action-panel"/);
});

function cssBlock(selectorPattern) {
  const match = styles.match(new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Missing CSS block for ${selectorPattern}`);
  return match[1];
}
