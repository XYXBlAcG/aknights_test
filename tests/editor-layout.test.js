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

test('battle layout keeps all controls reachable on phone-sized viewports', () => {
  const body = cssBlockInMedia(640, 'body');
  const app = cssBlockInMedia(640, '#app');
  const battleShell = cssBlockInMedia(640, '.battle-shell');
  const battlefieldWrap = cssBlockInMedia(640, '.battlefield-wrap');
  const mapLibraryPanel = cssBlockInMedia(640, '.map-library-panel');
  const infoPanel = cssBlockInMedia(640, '.info-panel');
  const bottomShell = cssBlockInMedia(640, '.bottom-shell');
  const operatorDeck = cssBlockInMedia(640, '.operator-deck');
  const controlPanel = cssBlockInMedia(640, '.control-panel');
  const enemyIntelPanel = cssBlockInMedia(640, '.enemy-intel-panel');

  assert.match(body, /overflow:\s*auto;/);
  assert.match(app, /height:\s*auto;/);
  assert.match(app, /min-height:\s*100dvh;/);
  assert.match(battleShell, /grid-template-columns:\s*1fr;/);
  assert.match(battleShell, /overflow:\s*visible;/);
  assert.match(battlefieldWrap, /min-height:\s*min\(52dvh,\s*420px\);/);
  assert.match(mapLibraryPanel, /max-height:\s*160px;/);
  assert.match(infoPanel, /display:\s*block;/);
  assert.doesNotMatch(infoPanel, /display:\s*none;/);
  assert.match(infoPanel, /max-height:\s*260px;/);
  assert.match(infoPanel, /overflow:\s*auto;/);
  assert.match(bottomShell, /overflow:\s*visible;/);
  assert.match(operatorDeck, /grid-auto-columns:\s*minmax\(92px,\s*36vw\);/);
  assert.match(controlPanel, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(enemyIntelPanel, /max-height:\s*42dvh;/);
});

test('editor and custom editor switch to single-column mobile workflows', () => {
  const editorPage = cssBlockInMedia(640, '.editor-page');
  const editorApps = cssBlockInMedia(640, '#editor-app,\\s*#custom-editor-app');
  const editorShells = cssBlockInMedia(640, '.editor-shell,\\s*\\.custom-editor-shell');
  const editorCanvas = cssBlockInMedia(640, '.editor-canvas-wrap');
  const customForm = cssBlockInMedia(640, '.custom-form-panel form');
  const rangePresets = cssBlockInMedia(640, '.range-presets');
  const skillEditorCard = cssBlockInMedia(640, '.skill-editor-card');
  const componentRow = cssBlockInMedia(640, '.component-row');
  const componentAdvanced = cssBlockInMedia(640, '.component-advanced');

  assert.match(editorPage, /overflow:\s*auto;/);
  assert.match(editorApps, /height:\s*auto;/);
  assert.match(editorApps, /min-height:\s*100dvh;/);
  assert.match(editorShells, /grid-template-columns:\s*1fr;/);
  assert.match(editorShells, /overflow:\s*visible;/);
  assert.match(editorCanvas, /min-height:\s*min\(58dvh,\s*460px\);/);
  assert.match(customForm, /grid-template-columns:\s*1fr;/);
  assert.match(rangePresets, /grid-template-columns:\s*repeat\(2,\s*1fr\);/);
  assert.match(skillEditorCard, /grid-template-columns:\s*1fr;/);
  assert.match(componentRow, /grid-template-columns:\s*1fr;/);
  assert.match(componentAdvanced, /grid-template-columns:\s*1fr;/);
});

function cssBlock(selectorPattern) {
  const match = styles.match(new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Missing CSS block for ${selectorPattern}`);
  return match[1];
}

function cssBlockInMedia(maxWidth, selectorPattern) {
  const block = mediaBlock(maxWidth);
  const match = block.match(new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Missing CSS block for ${selectorPattern} in max-width ${maxWidth}px`);
  return match[1];
}

function mediaBlock(maxWidth) {
  const marker = `@media (max-width: ${maxWidth}px)`;
  const start = styles.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${marker} responsive block`);

  const openBrace = styles.indexOf('{', start);
  assert.notEqual(openBrace, -1, `Missing opening brace for ${marker}`);

  let depth = 0;
  for (let i = openBrace; i < styles.length; i += 1) {
    if (styles[i] === '{') {
      depth += 1;
    } else if (styles[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return styles.slice(openBrace + 1, i);
      }
    }
  }

  assert.fail(`Missing closing brace for ${marker}`);
}
