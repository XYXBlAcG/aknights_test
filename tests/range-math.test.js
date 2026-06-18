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

test('pattern ranges rotate from right-facing origin direction', () => {
  const range = { type: 'pattern', cells: [{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 2, y: 0 }] };

  assert.deepEqual(rangeCellsFor({ x: 4, y: 4 }, range, 'right'), [
    { x: 4, y: 4 },
    { x: 5, y: 3 },
    { x: 6, y: 4 }
  ]);
  assert.deepEqual(rangeCellsFor({ x: 4, y: 4 }, range, 'down'), [
    { x: 4, y: 4 },
    { x: 5, y: 5 },
    { x: 4, y: 6 }
  ]);
  assert.deepEqual(rangeCellsFor({ x: 4, y: 4 }, range, 'left'), [
    { x: 4, y: 4 },
    { x: 3, y: 5 },
    { x: 2, y: 4 }
  ]);
  assert.deepEqual(rangeCellsFor({ x: 4, y: 4 }, range, 'up'), [
    { x: 4, y: 4 },
    { x: 3, y: 3 },
    { x: 4, y: 2 }
  ]);
  assert.equal(isCellInRange({ x: 4, y: 4 }, { x: 4, y: 6 }, range, 'down'), true);
});
