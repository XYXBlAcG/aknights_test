# Custom Editors And Range Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-cell map editing, resizable maps, custom operator/enemy editing, local catalog persistence, and hand-painted pattern ranges that work in battle.

**Architecture:** Keep behavior in testable model/data utilities, with DOM controllers and Canvas renderers as adapters. Add a shared range utility so combat, deployment previews, selected-range rendering, and custom editor previews use the same range semantics.

**Tech Stack:** HTML5, CSS3, JavaScript ES Modules, Vite multipage build, Node `node:test`, browser `localStorage`.

---

## Files

- Modify: `src/editor/EditorModel.js` for batch painting and resizing.
- Modify: `src/editor/EditorRenderer.js` for selection previews.
- Modify: `src/editor/EditorController.js` for drag paint, Shift box paint, width/height inputs, and dynamic enemy options.
- Modify: `editor.html` for size inputs and navigation.
- Create: `src/data/CatalogStore.js` for localStorage load/save/merge.
- Create: `src/data/CatalogValidators.js` for operator/enemy normalization and validation.
- Create: `src/utils/RangeMath.js` for `rangeCellsFor`, `isCellInRange`, range normalization, and presets.
- Create: `custom-editor.html`.
- Create: `src/custom-editor.js`.
- Create: `src/custom-editor/CustomEditorModel.js`.
- Create: `src/custom-editor/CustomEditorController.js`.
- Modify: `src/renderers/CanvasRenderer.js` to use shared range utilities.
- Modify: `src/systems/CombatSystem.js` to use shared range utilities.
- Modify: `src/ui/UIController.js` to support dynamic operator order.
- Modify: `src/main.js` to load merged custom catalogs.
- Modify: `src/styles.css` for updated editor and custom editor UI.
- Modify: `vite.config.js` to include `custom-editor.html`.
- Test: `tests/editor-model.test.js`.
- Test: `tests/range-math.test.js`.
- Test: `tests/catalog-store.test.js`.
- Test: `tests/custom-editor-model.test.js`.
- Test: `tests/combat-flow.test.js`.
- Test: `tests/browser-adapters.test.js`.

## Task 1: Shared Pattern Range Utilities

- [ ] **Step 1: Write failing tests**

Add `tests/range-math.test.js` covering:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCellInRange,
  normalizeRange,
  rangeCellsFor,
  rangePreset
} from '../src/utils/RangeMath.js';

test('pattern range translates relative cells from origin', () => {
  const range = normalizeRange({
    type: 'pattern',
    cells: [{ x: 0, y: 0 }, { x: 2, y: -1 }, { x: 2, y: -1 }]
  });

  assert.deepEqual(range.cells, [{ x: 0, y: 0 }, { x: 2, y: -1 }]);
  assert.deepEqual(rangeCellsFor({ x: 5, y: 5 }, range), [
    { x: 5, y: 5 },
    { x: 7, y: 4 }
  ]);
  assert.equal(isCellInRange({ x: 5, y: 5 }, { x: 7, y: 4 }, range), true);
  assert.equal(isCellInRange({ x: 5, y: 5 }, { x: 6, y: 5 }, range), false);
});

test('diamond and melee ranges keep existing behavior', () => {
  assert.equal(isCellInRange({ x: 2, y: 2 }, { x: 2, y: 2 }, { type: 'melee', radius: 0 }), true);
  assert.equal(isCellInRange({ x: 2, y: 2 }, { x: 3, y: 2 }, { type: 'melee', radius: 0 }), false);
  assert.equal(isCellInRange({ x: 2, y: 2 }, { x: 4, y: 3 }, { type: 'diamond', radius: 3 }), true);
  assert.equal(isCellInRange({ x: 2, y: 2 }, { x: 5, y: 3 }, { type: 'diamond', radius: 3 }), false);
});

test('range presets return editable pattern ranges', () => {
  const line = rangePreset('front-line-3');
  assert.equal(line.type, 'pattern');
  assert.deepEqual(line.cells, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because `src/utils/RangeMath.js` does not exist.

- [ ] **Step 3: Implement range utilities**

Create `src/utils/RangeMath.js` with:

- `normalizeRange(range)`
- `rangeCellsFor(origin, range)`
- `isCellInRange(origin, target, range)`
- `rangePreset(name)`

Rules:

- `pattern` cells are deduplicated, sorted by `y` then `x`, and limited to `-5..5`.
- Existing `melee` and `diamond` ranges remain supported.
- Presets return `pattern` ranges.

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: all tests pass.

## Task 2: Map Editor Batch Painting And Resize Model

- [ ] **Step 1: Write failing tests**

Extend `tests/editor-model.test.js` with tests for:

- `paintCells()` painting several cells immutably.
- `cellsInRect()` returning a row-major rectangle.
- Painting non-path terrain removes path points on overwritten cells.
- `resizeMap()` expands with walls.
- `resizeMap()` crops grid and removes out-of-bounds path points.

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because `paintCells`, `cellsInRect`, and `resizeMap` are missing.

- [ ] **Step 3: Implement model functions**

Modify `src/editor/EditorModel.js`:

- Add `paintCells(state, cells, type, options = {})`.
- Add `cellsInRect(start, end)`.
- Add `resizeMap(state, width, height, fillType = 'wall')`.
- Reimplement `setCellType()` through `paintCells()` for compatibility.
- Recalculate path endpoints whenever points are removed or added.

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: all tests pass.

## Task 3: Catalog Validation And Local Storage

- [ ] **Step 1: Write failing tests**

Add `tests/catalog-store.test.js` covering:

- Valid operator and enemy templates normalize.
- Invalid IDs and invalid pattern ranges are rejected.
- Malformed localStorage JSON returns empty catalogs plus an error message.
- Custom templates override defaults during merge.
- New custom templates are appended during merge.

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because `CatalogStore.js` and `CatalogValidators.js` are missing.

- [ ] **Step 3: Implement validators and store**

Create `src/data/CatalogValidators.js`:

- `normalizeOperatorTemplate(template)`
- `normalizeEnemyTemplate(template)`
- `validateOperatorTemplate(template)`
- `validateEnemyTemplate(template)`
- `validateCustomCatalogs(data)`

Create `src/data/CatalogStore.js`:

- `CUSTOM_CATALOG_STORAGE_KEY`
- `emptyCustomCatalogs()`
- `loadCustomCatalogs(storage)`
- `saveCustomCatalogs(data, storage)`
- `mergeCatalogs(defaultOperators, defaultEnemies, customData)`

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: all tests pass.

## Task 4: Combat And Rendering Range Integration

- [ ] **Step 1: Write failing tests**

Extend `tests/combat-flow.test.js` to verify:

- A ranged operator with a `pattern` range hits an enemy on a painted relative cell.
- The same operator cannot hit an enemy outside the pattern.

Extend `tests/browser-adapters.test.js` to verify:

- `rangeCellsFor()` used by render adapters returns pattern cells within the canvas preview model.

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because combat still checks diamond range directly.

- [ ] **Step 3: Update combat and renderer**

Modify:

- `src/systems/CombatSystem.js` to use `isCellInRange()`.
- `src/renderers/CanvasRenderer.js` to import `rangeCellsFor()` from `RangeMath.js`.
- Remove duplicate range helper logic from `CanvasRenderer.js` when possible.

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: all tests pass.

## Task 5: Dynamic Catalog Integration In Game And Map Editor

- [ ] **Step 1: Write failing tests**

Extend `tests/browser-adapters.test.js` with:

- `buildOperatorDeckModel()` includes default operators first and custom operators after them.
- `buildEnemyOptionsModel()` includes custom enemies and preserves missing event enemy IDs.

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because operator order and enemy options are hardcoded.

- [ ] **Step 3: Implement dynamic models**

Modify `src/ui/UIController.js`:

- Build operator deck from dynamic catalog using default order first, then custom sorted entries.
- Keep class limits for known classes and total limit fallback for custom class.

Modify `src/editor/EditorController.js`:

- Accept `enemyCatalog`.
- Render timeline enemy options from the catalog.
- Include missing event enemy IDs as temporary options.

Modify `src/editor.js` and `src/main.js`:

- Load custom catalogs from localStorage.
- Merge defaults and custom catalogs.
- Pass `enemyCatalog` and `operatorCatalog` where needed.

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: all tests pass.

## Task 6: Custom Editor Model

- [ ] **Step 1: Write failing tests**

Add `tests/custom-editor-model.test.js` covering:

- Creating operator and enemy drafts.
- Selecting, updating, duplicating, and deleting templates.
- Applying range presets.
- Toggling hand-painted range cells.
- Exporting valid custom catalog JSON.
- Importing valid JSON and preserving selected template.

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because `src/custom-editor/CustomEditorModel.js` does not exist.

- [ ] **Step 3: Implement custom editor model**

Create `src/custom-editor/CustomEditorModel.js` with pure functions:

- `createCustomEditorState(customData)`
- `selectTemplate(state, kind, id)`
- `createTemplate(state, kind)`
- `duplicateTemplate(state)`
- `deleteSelectedTemplate(state)`
- `updateSelectedTemplate(state, patch)`
- `applyRangePresetToSelected(state, presetName)`
- `toggleRangeCellForSelected(state, cell)`
- `toCustomCatalogJson(state)`
- `loadCustomCatalogJson(raw)`

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: all tests pass.

## Task 7: Custom Editor Page And Controller

- [ ] **Step 1: Add page shell**

Create `custom-editor.html` with:

- Header navigation.
- Left template list and create/duplicate/delete controls.
- Center editor form.
- Right range painter and JSON panel.

- [ ] **Step 2: Implement controller**

Create `src/custom-editor.js` and `src/custom-editor/CustomEditorController.js`.

The controller:

- Loads custom catalogs from storage.
- Renders operator/enemy tabs.
- Renders forms for selected template.
- Binds numeric, text, select, checkbox, and color fields.
- Binds range grid click/drag and preset buttons.
- Saves to localStorage.
- Imports and exports JSON.

- [ ] **Step 3: Add styles and navigation**

Modify:

- `index.html` to link `custom-editor.html`.
- `editor.html` to link `custom-editor.html` and show width/height inputs.
- `src/styles.css` for custom editor and range painter.
- `vite.config.js` to include `custom-editor.html`.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: build includes `dist/custom-editor.html`.

## Task 8: Map Editor Pointer Interactions

- [ ] **Step 1: Wire drag and box paint**

Modify `src/editor/EditorController.js`:

- Track `isPainting`, `dragStartCell`, `paintedCellKeys`, and `previewCells`.
- On pointer down, start paint.
- On pointer move, update drag paint or Shift box preview.
- On pointer up, commit box paint or finish drag paint.
- Keep single click behavior as a one-cell paint.

- [ ] **Step 2: Wire resize inputs**

Modify:

- `editor.html` to add `width` and `height`.
- `src/editor/EditorController.js` to call `resizeMap()`.

- [ ] **Step 3: Update renderer preview**

Modify `src/editor/EditorRenderer.js`:

- Accept preview cells.
- Draw preview cells before paths and above terrain.

- [ ] **Step 4: Verify tests**

Run: `npm test`

Expected: all tests pass.

## Task 9: Final Verification

- [ ] **Step 1: Full automated verification**

Run:

```bash
npm test
npm run build
git status --short
```

Expected:

- Tests pass.
- Build exits 0.
- Only intended source, test, HTML, CSS, and docs files changed.

- [ ] **Step 2: Local browser smoke**

With dev server running, verify:

```bash
curl -I http://127.0.0.1:5174/editor.html
curl -I http://127.0.0.1:5174/custom-editor.html
```

Expected: both return `HTTP/1.1 200 OK`.

Use the browser to confirm:

- Custom editor loads.
- Creating an operator, toggling range cells, saving, and exporting shows valid JSON.
- Map editor loads and has width/height controls.
- Main page still loads.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add custom-editor.html editor.html index.html vite.config.js src tests docs/superpowers/plans/2026-06-18-custom-editors-and-range-patterns.md
git commit -m "Add custom catalogs and editor range patterns"
```

Expected: commit succeeds.

