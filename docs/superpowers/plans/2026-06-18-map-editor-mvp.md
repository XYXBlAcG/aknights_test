# Map Editor MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser map editor at `editor.html` that can create, edit, validate, import, and export v2.0 map JSON compatible with the existing game.

**Architecture:** Keep editor state changes in pure functions under `src/editor/EditorModel.js` so map editing behavior is covered by Node tests. Keep Canvas rendering and DOM controls in `src/editor/EditorRenderer.js` and `src/editor/EditorController.js` as adapters over the pure model.

**Tech Stack:** HTML5, CSS3, JavaScript ES Modules, Vite multipage entry, Node `node:test`.

---

## Scope

This MVP implements:

- `editor.html` multipage entry.
- Grid editing for `path`, `high`, and `wall`.
- Map metadata editing: name, dimensions, initial cost, max cost, lives, total waves.
- Path management: create path, select path, add path point by clicking path cells, remove last point, auto entry/exit.
- Timeline event editing: add event, remove event, edit wave, start time, enemy type, count, interval, path id.
- Import JSON from textarea/file content, normalize via `MapLoader`, and load into editor state.
- Export JSON to textarea and download file.
- Validation panel using existing `validateMap()`.

This MVP does not implement drag-reordering path points, resizing an existing map with preservation, custom enemy catalogs, or visual timeline charts.

## Files

- Create: `editor.html`
- Create: `src/editor.js`
- Create: `src/editor/EditorModel.js`
- Create: `src/editor/EditorRenderer.js`
- Create: `src/editor/EditorController.js`
- Modify: `src/styles.css`
- Modify: `index.html`
- Test: `tests/editor-model.test.js`

## Task 1: Editor Model

- [ ] **Step 1: Write failing model tests**

Create `tests/editor-model.test.js` with tests for blank map creation, cell painting, path point management, timeline event management, export validation, and import normalization.

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: tests fail because `src/editor/EditorModel.js` does not exist.

- [ ] **Step 3: Implement model functions**

Implement these exports in `src/editor/EditorModel.js`:

- `createEditorState(options)`
- `setCellType(state, cell, type)`
- `addPath(state, name)`
- `selectPath(state, pathId)`
- `addPointToSelectedPath(state, cell)`
- `removeLastPointFromSelectedPath(state)`
- `addTimelineEvent(state)`
- `updateTimelineEvent(state, eventId, patch)`
- `removeTimelineEvent(state, eventId)`
- `toMapJson(state)`
- `loadMapIntoEditor(rawMap)`
- `getValidation(state)`

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: editor model tests and existing tests pass.

## Task 2: Editor UI And Renderer

- [ ] **Step 1: Add editor page shell**

Create `editor.html` with left tool panel, canvas center, right properties panel, timeline panel, import/export textarea, and result message area.

- [ ] **Step 2: Implement Canvas renderer**

Implement `EditorRenderer` to draw the grid, current paths, path points, selected path, hover cell, and grid coordinates.

- [ ] **Step 3: Implement DOM controller**

Implement `EditorController` to bind tools, metadata inputs, path buttons, timeline event forms, import/export buttons, validation messages, canvas click/hover, and download.

- [ ] **Step 4: Add editor entrypoint**

Create `src/editor.js` to instantiate the controller and renderer with a default blank map.

## Task 3: Navigation, Styling, And Verification

- [ ] **Step 1: Add navigation link**

Add an editor link to `index.html` and a game link to `editor.html`.

- [ ] **Step 2: Style editor layout**

Extend `src/styles.css` with dense, utilitarian editor styles consistent with the tactical terminal theme.

- [ ] **Step 3: Verify**

Run:

```bash
npm test
npm run build
curl -I http://127.0.0.1:5173/editor.html
```

Expected:

- Tests pass.
- Build exits 0.
- Local editor page returns HTTP 200.

