import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

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

function cssBlock(selectorPattern) {
  const match = styles.match(new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Missing CSS block for ${selectorPattern}`);
  return match[1];
}

