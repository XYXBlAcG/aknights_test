import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPath,
  addPointToSelectedPath,
  addTimelineEvent,
  addWaypointAction,
  buildTimelinePreviewModel,
  cellsInRect,
  createEditorState,
  getValidation,
  loadMapIntoEditor,
  paintCells,
  removeLastPointFromSelectedPath,
  removeTimelineEvent,
  resizeMap,
  selectPath,
  setCellsDeployable,
  setCellType,
  toMapJson,
  updateTimelineEvent
} from '../src/editor/EditorModel.js';

test('createEditorState builds a valid blank editor map', () => {
  const state = createEditorState({ width: 4, height: 3, name: '测试地图' });

  assert.equal(state.map.width, 4);
  assert.equal(state.map.height, 3);
  assert.equal(state.map.name, '测试地图');
  assert.equal(state.map.grid.length, 3);
  assert.equal(state.map.grid[0].every((cell) => cell === 'wall'), true);
});

test('setCellType paints a cell without mutating the original state', () => {
  const state = createEditorState({ width: 2, height: 2 });
  const next = setCellType(state, { x: 1, y: 0 }, 'path');

  assert.equal(state.map.grid[0][1], 'wall');
  assert.equal(next.map.grid[0][1], 'path');
});

test('paintCells paints multiple cells without mutating the original state', () => {
  const state = createEditorState({ width: 4, height: 3 });
  const next = paintCells(state, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 0 },
    { x: 9, y: 9 }
  ], 'high');

  assert.equal(state.map.grid[0][0], 'wall');
  assert.equal(state.map.grid[0][1], 'wall');
  assert.equal(next.map.grid[0][0], 'high');
  assert.equal(next.map.grid[0][1], 'high');
});

test('cellsInRect returns row-major cells between two corners', () => {
  assert.deepEqual(cellsInRect({ x: 2, y: 1 }, { x: 0, y: 2 }), [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 0, y: 2 },
    { x: 1, y: 2 },
    { x: 2, y: 2 }
  ]);
});

test('path editing adds points only on path terrain and updates entry exit', () => {
  let state = createEditorState({ width: 3, height: 1 });
  state = setCellType(state, { x: 0, y: 0 }, 'path');
  state = setCellType(state, { x: 1, y: 0 }, 'path');
  state = addPath(state, '主线');
  state = addPointToSelectedPath(state, { x: 0, y: 0 });
  state = addPointToSelectedPath(state, { x: 1, y: 0 });

  const path = state.map.paths[0];
  assert.equal(path.name, '主线');
  assert.deepEqual(path.entry, { x: 0, y: 0 });
  assert.deepEqual(path.exit, { x: 1, y: 0 });
  assert.deepEqual(path.points, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);

  assert.throws(() => addPointToSelectedPath(state, { x: 2, y: 0 }), /path terrain/);

  const shortened = removeLastPointFromSelectedPath(state);
  assert.deepEqual(shortened.map.paths[0].points, [{ x: 0, y: 0 }]);
});

test('painting over path terrain removes path points on overwritten cells', () => {
  let state = createEditorState({ width: 3, height: 1 });
  state = paintCells(state, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 'path');
  state = addPath(state, '主线');
  state = addPointToSelectedPath(state, { x: 0, y: 0 });
  state = addPointToSelectedPath(state, { x: 1, y: 0 });
  state = addPointToSelectedPath(state, { x: 2, y: 0 });

  const next = paintCells(state, [{ x: 1, y: 0 }], 'wall');

  assert.deepEqual(next.map.paths[0].points, [{ x: 0, y: 0 }, { x: 2, y: 0 }]);
  assert.deepEqual(next.map.paths[0].entry, { x: 0, y: 0 });
  assert.deepEqual(next.map.paths[0].exit, { x: 2, y: 0 });
});

test('editor toggles deployability metadata for multiple path cells', () => {
  let state = createEditorState({ width: 3, height: 1 });
  state = paintCells(state, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 'path');
  state = setCellsDeployable(state, [{ x: 1, y: 0 }], false);

  assert.deepEqual(state.map.tileMeta, { '1,0': { deployable: false } });

  const restored = setCellsDeployable(state, [{ x: 1, y: 0 }], true);
  assert.deepEqual(restored.map.tileMeta, {});
});

test('resizeMap expands with walls and crops out-of-bounds path points', () => {
  let state = createEditorState({ width: 4, height: 2 });
  state = paintCells(state, [{ x: 0, y: 0 }, { x: 3, y: 0 }], 'path');
  state = addPath(state, '主线');
  state = addPointToSelectedPath(state, { x: 0, y: 0 });
  state = addPointToSelectedPath(state, { x: 3, y: 0 });

  const expanded = resizeMap(state, 5, 3);
  assert.equal(expanded.map.width, 5);
  assert.equal(expanded.map.height, 3);
  assert.equal(expanded.map.grid[0][0], 'path');
  assert.equal(expanded.map.grid[2][4], 'wall');

  const cropped = resizeMap(expanded, 3, 3);
  assert.equal(cropped.map.width, 3);
  assert.equal(cropped.map.height, 3);
  assert.deepEqual(cropped.map.paths[0].points, [{ x: 0, y: 0 }]);
  assert.deepEqual(cropped.map.paths[0].entry, { x: 0, y: 0 });
  assert.deepEqual(cropped.map.paths[0].exit, { x: 0, y: 0 });
});

test('timeline events can be added, updated, and removed', () => {
  let state = createEditorState({ width: 2, height: 1 });
  state = setCellType(state, { x: 0, y: 0 }, 'path');
  state = setCellType(state, { x: 1, y: 0 }, 'path');
  state = addPath(state, '主线');
  state = addPointToSelectedPath(state, { x: 0, y: 0 });
  state = addPointToSelectedPath(state, { x: 1, y: 0 });
  state = addTimelineEvent(state);
  const eventId = state.timelineEvents[0].id;

  state = updateTimelineEvent(state, eventId, { enemyType: 'heavy', count: 3, startTime: 5 });

  assert.equal(state.timelineEvents[0].enemyType, 'heavy');
  assert.equal(state.timelineEvents[0].count, 3);
  assert.equal(state.timelineEvents[0].startTime, 5);

  state = removeTimelineEvent(state, eventId);
  assert.equal(state.timelineEvents.length, 0);
});

test('timeline preview maps spawn groups onto wave rows and percentages', () => {
  let state = createEditorState({ width: 2, height: 1 });
  state = addPath(state, '主线');
  state = addTimelineEvent(state);
  const firstId = state.timelineEvents[0].id;
  state = updateTimelineEvent(state, firstId, {
    wave: 1,
    startTime: 10,
    enemyType: 'infantry',
    count: 3,
    interval: 2,
    pathId: 'path-1'
  });
  state = addTimelineEvent(state);
  const secondId = state.timelineEvents[1].id;
  state = updateTimelineEvent(state, secondId, {
    wave: 2,
    startTime: 20,
    enemyType: 'heavy',
    count: 1,
    interval: 1,
    pathId: 'path-1'
  });

  const preview = buildTimelinePreviewModel(state.timelineEvents, state.map.totalWaves);

  assert.equal(preview.duration, 30);
  assert.equal(preview.rows.length, 3);
  assert.equal(preview.rows[0].events[0].leftPercent, 33.33);
  assert.equal(preview.rows[0].events[0].widthPercent, 13.33);
  assert.equal(preview.rows[1].events[0].label, 'heavy x1');
});

test('toMapJson exports a validateMap-compatible v2 map', () => {
  let state = createEditorState({ width: 2, height: 1, name: '可导出地图' });
  state = setCellType(state, { x: 0, y: 0 }, 'path');
  state = setCellType(state, { x: 1, y: 0 }, 'path');
  state = addPath(state, '主线');
  state = addPointToSelectedPath(state, { x: 0, y: 0 });
  state = addPointToSelectedPath(state, { x: 1, y: 0 });
  state = addTimelineEvent(state);

  const map = toMapJson(state);
  const validation = getValidation(state);

  assert.equal(map.version, '2.0');
  assert.equal(map.name, '可导出地图');
  assert.equal(map.timeline.length, 1);
  assert.equal(validation.ok, true);
});

test('editor exports waypoint actions only on intermediate path points', () => {
  let state = createEditorState({ width: 3, height: 1 });
  state = addPath(state, 'main');
  state = paintCells(state, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 'path', { appendPathPoints: true });
  state = addWaypointAction(state, state.selectedPathId, 1, { type: 'pause', duration: 2 });
  const map = toMapJson(state);

  assert.equal(map.paths[0].waypointActions[0].pointIndex, 1);
  assert.equal(map.paths[0].waypointActions[0].actions[0].duration, 2);
  assert.throws(() => addWaypointAction(state, state.selectedPathId, 0, { type: 'pause', duration: 1 }), /intermediate/);
});

test('loadMapIntoEditor normalizes imported v1 maps', () => {
  const state = loadMapIntoEditor({
    version: '1.0',
    id: 'legacy-editor',
    name: 'Legacy Editor',
    width: 2,
    height: 1,
    initialCost: 10,
    maxCost: 30,
    maxLives: 3,
    totalWaves: 1,
    grid: [['path', 'path']],
    path: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1 }]
  });

  assert.equal(state.map.version, '2.0');
  assert.equal(state.map.paths[0].id, 'main');
  assert.equal(state.timelineEvents[0].pathId, 'main');
});

test('selectPath changes the selected path id', () => {
  let state = createEditorState({ width: 2, height: 1 });
  state = addPath(state, 'A');
  state = addPath(state, 'B');

  const next = selectPath(state, state.map.paths[0].id);

  assert.equal(next.selectedPathId, state.map.paths[0].id);
});
