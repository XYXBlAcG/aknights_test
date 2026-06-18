# Custom Editors And Range Patterns Design

## 1. Goal

This phase expands the current playable tower-defense prototype with two editor-facing upgrades:

- The map editor can paint multiple cells at once and resize maps while preserving valid content.
- A new custom data editor can create, edit, duplicate, delete, import, export, and persist operator and enemy templates.

The custom editor must support hand-painted operator attack ranges. Presets are useful for speed, but the canonical range data is a list of relative cells so designers can draw arbitrary shapes.

The first implementation remains browser-local and data-driven. It does not introduce account storage, server persistence, sprite uploads, a scripting language, or a full skill authoring system.

## 2. Existing Context

The game currently has:

- `editor.html` with single-cell terrain painting, path management, timeline editing, JSON import/export, and validation.
- Default operator data in `src/data/defaultOperators.js`.
- Default enemy data in `src/data/defaultEnemies.js`.
- `Game` accepting `operatorCatalog` and `enemyCatalog` constructor arguments.
- Combat range checks limited to melee and diamond ranges.
- UI operator deck order and timeline enemy options derived from hardcoded default IDs.

This phase keeps the same architectural style:

- Pure model functions for editor behavior.
- DOM controllers as thin adapters.
- Canvas renderers for visual feedback.
- Node tests for data transformations and combat behavior.

## 3. Map Editor Upgrade

### 3.1 Multi-Cell Selection And Painting

The editor supports three paint modes:

- Single click: paint one cell, same as the current editor.
- Drag paint: while holding the pointer on the canvas, every entered cell is painted with the selected terrain.
- Box paint: hold Shift while dragging to preview a rectangular selection; release to paint all cells inside the rectangle.

The model exposes a single batch operation:

```js
paintCells(state, cells, terrain, options)
```

Rules:

- Invalid terrain values are rejected.
- Out-of-bounds cells are ignored by default.
- Duplicate cells are collapsed.
- The operation returns a new editor state and does not mutate the original state.
- If `terrain === 'path'` and `options.appendPathPoints === true`, newly painted path cells are appended to the selected path in deterministic row-major order.
- If path terrain is overwritten by `high` or `wall`, existing path points on those cells are removed from every path. Path entry and exit are recalculated.
- Timeline events are not removed unless their referenced path is deleted.

The renderer shows:

- Hover cell.
- Dragged cells during drag paint.
- Rectangular preview during Shift box paint.
- Selected path overlay remains visible above terrain previews.

### 3.2 Custom Map Size

The map property panel gains `width` and `height` numeric inputs.

The model exposes:

```js
resizeMap(state, width, height, fillType = 'wall')
```

Rules:

- Minimum size is `3 x 3`.
- Maximum size is `30 x 20` for this browser-first version.
- Expanding a map preserves existing cells and fills new cells with `wall`.
- Shrinking a map crops grid cells outside the new bounds.
- Path points outside the new bounds are removed.
- Paths with fewer than two points remain editable but fail validation until fixed.
- Timeline events remain attached to their path IDs unless the path itself is deleted.
- The selected path remains selected when it still exists.

The editor does not automatically reroute paths after resizing. Designers remain responsible for path shape.

## 4. Custom Data Editor

### 4.1 Page And Navigation

Add `custom-editor.html` and `src/custom-editor.js`.

Navigation:

- Main game header links to map editor and custom editor.
- Map editor links back to battle and custom editor.
- Custom editor links back to battle and map editor.

Layout:

- Left column: tabs for operators and enemies, list of templates, create/duplicate/delete controls.
- Center: form fields for the selected template.
- Right column: JSON import/export and validation panel.
- For operators only, the right column also contains the range painter.

The visual style follows the existing dense tactical terminal UI.

### 4.2 Persistence And Catalog Merge

Add a browser-local catalog store:

```js
loadCustomCatalogs(storage = localStorage)
saveCustomCatalogs(data, storage = localStorage)
mergeCatalogs(defaultOperators, defaultEnemies, customData)
```

Storage key:

```text
aknights.customCatalogs.v1
```

Stored shape:

```js
{
  version: 1,
  operators: { [id]: OperatorTemplate },
  enemies: { [id]: EnemyTemplate }
}
```

Merge rules:

- Default templates are always available.
- Custom templates with the same ID override default templates.
- Custom templates with new IDs are appended.
- Invalid custom templates are skipped during game startup and reported in the custom editor validation panel.
- The game never crashes because of malformed localStorage data; it falls back to defaults.

### 4.3 Operator Fields

The custom editor supports these operator fields:

- `id`: unique stable ID, lowercase letters, numbers, dashes, and underscores.
- `name`: display name.
- `class`: one of `vanguard`, `guard`, `defender`, `sniper`, `caster`, `medic`, or `custom`.
- `className`: display class label.
- `deployType`: `ground` or `high`.
- `cost`: deployment cost.
- `maxHp`: maximum HP.
- `attack`: attack or healing value.
- `defense`: physical defense.
- `resistance`: arts resistance from `0` to `0.95`.
- `attackInterval`: seconds between attacks.
- `block`: block count.
- `damageType`: `physical`, `arts`, or `heal`.
- `targeting`: `blocked-first`, `exit-first`, `flying-first`, `high-defense`, or `lowest-hp-percent`.
- `range`: hand-painted pattern range.
- `skill`: optional existing skill template.
- `color`: CSS color used for the canvas token and deck badge.

Skill authoring in this phase is intentionally limited to known skill types:

- `instant_cost`
- `buff`
- `next_attack`
- `instant_heal`

The editor exposes these types through structured fields rather than arbitrary JSON scripts.

### 4.4 Enemy Fields

The custom editor supports these enemy fields:

- `id`: unique stable ID.
- `name`: display name.
- `maxHp`: maximum HP.
- `attack`: physical attack value used while blocked.
- `defense`: physical defense.
- `resistance`: arts resistance from `0` to `0.95`.
- `speed`: path movement speed.
- `attackInterval`: seconds between attacks.
- `canBeBlocked`: boolean.
- `isFlying`: boolean.
- `rewardCost`: cost awarded when defeated.
- `elite`: boolean marker for future display and filtering.
- `boss`: boolean marker for future display and filtering.
- `color`: CSS color used for canvas rendering.

This phase does not add ranged enemy attacks or enemy skills. Those can be added later using the same validation and storage layer.

## 5. Hand-Painted Range Pattern

### 5.1 Data Shape

The canonical custom range type is:

```js
{
  type: 'pattern',
  cells: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 }
  ]
}
```

Rules:

- Coordinates are relative to the deployed operator.
- `{ x: 0, y: 0 }` is allowed and represents the operator's own tile.
- At least one cell is required.
- Duplicate cells are removed.
- Pattern coordinates are limited to `-5..5` in both axes in this version.
- Presets generate this same `pattern` shape.

Existing ranges remain supported:

```js
{ type: 'melee', radius: 0 }
{ type: 'diamond', radius: 2.5 }
```

During normalization, built-in `melee` and `diamond` ranges can be converted to pattern previews for editing, but they may remain as-is in default data.

### 5.2 Range Painter UI

The range painter is an 11 x 11 grid centered on the operator.

Controls:

- Click a cell to toggle it.
- Drag across cells to toggle to the drag-start target state.
- Center cell is visually marked as the operator tile.
- Preset buttons:
  - Melee
  - Diamond 2
  - Diamond 3
  - Front Line 3
  - Front Box 3x3
  - Cross
  - Wide Medic
- Clear button.

This first version stores a single orientation-neutral pattern. Direction-specific deployment facing is not introduced yet. Designers can still draw directional shapes by placing cells mostly to one side of the center.

### 5.3 Combat And Rendering

Add a shared range utility:

```js
rangeCellsFor(origin, range)
isCellInRange(origin, target, range)
```

Behavior:

- `melee`: own cell only.
- `diamond`: current Manhattan-distance behavior.
- `pattern`: translate each relative cell by the operator cell and compare exact grid cells.

Combat, healing, deployment preview, selected range drawing, and editor range preview use the same utility.

## 6. Game Integration

### 6.1 Main Game Startup

`src/main.js` loads custom catalogs from localStorage and merges them with defaults before creating `UIController`.

If loading fails:

- The console receives a concise warning.
- The game starts with default catalogs.
- The custom editor validation panel can still show the stored-data error when opened.

### 6.2 Dynamic Operator Deck

The operator deck no longer relies on only `DEFAULT_OPERATOR_ORDER`.

Order rules:

- Default operators keep their current order.
- Custom operators appear after defaults, sorted by `class` then `name`.
- Class deployment limits continue to apply for known classes.
- Unknown/custom class uses the total deploy limit as its class limit.

### 6.3 Dynamic Timeline Enemy Options

The map editor loads the merged enemy catalog and renders the timeline enemy dropdown from it.

If an imported map references an enemy ID not present in the current catalog:

- The event remains visible.
- The select includes a temporary option for that missing ID.
- Validation reports the missing enemy only when exporting for game use if enemy-catalog validation is enabled.

The existing `MapLoader.validateMap()` remains focused on map structure and path validity. Enemy-catalog validation is editor-level because maps can be shared independently from custom catalogs.

## 7. Validation

Add dedicated validators:

```js
validateOperatorTemplate(template)
validateEnemyTemplate(template)
validateCustomCatalogs(data)
normalizeOperatorTemplate(template)
normalizeEnemyTemplate(template)
```

Validation rules include:

- Required string IDs and names.
- Numeric fields are finite and within gameplay-safe ranges.
- Resistance is clamped or rejected outside `0..0.95`.
- Colors must be non-empty CSS-style strings.
- Operator deploy type, damage type, targeting, and range type must be recognized.
- Pattern ranges require at least one valid relative cell.
- Enemy movement and combat values must be non-negative, with speed greater than zero.

The editor should show validation messages without throwing uncaught errors.

## 8. Testing Strategy

Node tests cover:

- Batch painting does not mutate old state and paints all cells.
- Shift-box cell generation returns the expected rectangle.
- Resizing expands with walls and crops out-of-bounds path points.
- Custom catalog persistence handles malformed JSON safely.
- Catalog merge overrides defaults and appends new templates.
- Operator and enemy validators accept valid templates and reject malformed ones.
- Pattern range utilities return exact translated cells.
- Combat can attack with a pattern range and cannot hit outside the pattern.
- UI adapter model functions produce dynamic operator order and dynamic enemy options.

Browser smoke verification covers:

- `editor.html` loads and can batch paint/export.
- `custom-editor.html` loads, creates a template, edits range cells, exports JSON, and reports valid data.
- Main game loads after custom data is saved.

## 9. Acceptance Criteria

The phase is complete when:

- Map editor supports drag paint and Shift box paint.
- Map editor can resize maps within `3x3` to `30x20`.
- Custom editor can create, duplicate, delete, edit, save, import, export, and validate operators and enemies.
- Operator range painter supports arbitrary hand-painted cells plus presets.
- Custom operators and enemies persist in localStorage.
- Game startup merges custom catalogs with defaults.
- Operator deck includes custom operators.
- Map editor timeline enemy dropdown includes custom enemies.
- Pattern ranges work in combat and selected-range rendering.
- `npm test` and `npm run build` pass.

## 10. Deliberate Non-Goals

This phase does not implement:

- Server-side storage.
- Image or sprite uploads.
- Arbitrary JavaScript or formula scripting for skills.
- Direction chosen at deployment time.
- Enemy ranged attacks or enemy skills.
- 3D editor support.
- Full campaign/roster management.

