import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMap, validateMap } from '../src/data/MapLoader.js';
import { isCellInDiamondRange, pathPositionAtDistance } from '../src/utils/GridMath.js';

test('normalizeMap converts v1 path into v2 paths and timeline shape', () => {
  const map = normalizeMap({
    version: '1.0',
    id: 'legacy',
    name: 'Legacy',
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

  assert.equal(map.version, '2.0');
  assert.equal(map.paths[0].id, 'main');
  assert.equal(map.timeline[0].pathId, 'main');
});

test('validateMap rejects path points outside the grid', () => {
  assert.throws(() => validateMap({
    version: '2.0',
    id: 'bad',
    name: 'Bad',
    width: 1,
    height: 1,
    initialCost: 10,
    maxCost: 30,
    maxLives: 3,
    totalWaves: 1,
    grid: [['path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1, pathId: 'main' }]
  }), /outside grid/);
});

test('diamond range uses Manhattan distance', () => {
  assert.equal(isCellInDiamondRange({ x: 0, y: 0 }, { x: 2, y: 1 }, 3), true);
  assert.equal(isCellInDiamondRange({ x: 0, y: 0 }, { x: 3, y: 1 }, 3), false);
});

test('pathPositionAtDistance interpolates along path segments', () => {
  const position = pathPositionAtDistance([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }], 4);

  assert.deepEqual(position.cell, { x: 3, y: 1 });
  assert.equal(position.segmentIndex, 1);
});
