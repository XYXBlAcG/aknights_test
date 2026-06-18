import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCanvasMetrics, tileColorForType } from '../src/renderers/CanvasRenderer.js';
import { buildOperatorDeckModel, formatBattleTime } from '../src/ui/UIController.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';

test('calculateCanvasMetrics fits map into available canvas area', () => {
  const metrics = calculateCanvasMetrics({ width: 10, height: 5 }, 1000, 600);

  assert.equal(metrics.tileSize, 80);
  assert.equal(metrics.boardWidth, 800);
  assert.equal(metrics.boardHeight, 400);
  assert.equal(metrics.offsetX, 100);
  assert.equal(metrics.offsetY, 100);
});

test('tileColorForType returns distinct tactical colors', () => {
  assert.notEqual(tileColorForType('path'), tileColorForType('high'));
  assert.notEqual(tileColorForType('wall'), tileColorForType('path'));
});

test('buildOperatorDeckModel marks unaffordable operators disabled', () => {
  const model = buildOperatorDeckModel({
    operatorCatalog: DEFAULT_OPERATORS,
    operators: [],
    cost: 5,
    selectedOperatorType: null
  });

  assert.equal(model.find((operator) => operator.id === 'vanguard').disabled, true);
  assert.equal(model.find((operator) => operator.id === 'vanguard').disabledReason, '费用不足');
});

test('formatBattleTime renders minute and second clock', () => {
  assert.equal(formatBattleTime(125.2), '02:05');
});
