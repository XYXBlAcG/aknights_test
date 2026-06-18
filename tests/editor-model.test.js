import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPath,
  addPointToSelectedPath,
  addTimelineEvent,
  createEditorState,
  getValidation,
  loadMapIntoEditor,
  removeLastPointFromSelectedPath,
  removeTimelineEvent,
  selectPath,
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
