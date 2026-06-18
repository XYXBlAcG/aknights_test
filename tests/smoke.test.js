import test from 'node:test';
import assert from 'node:assert/strict';
import { manhattanDistance } from '../src/utils/GridMath.js';

test('manhattanDistance returns grid distance between two cells', () => {
  assert.equal(manhattanDistance({ x: 1, y: 2 }, { x: 4, y: 6 }), 7);
});
