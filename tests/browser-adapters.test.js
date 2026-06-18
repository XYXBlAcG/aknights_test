import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCanvasMetrics, rangeCellsFor, tileColorForType } from '../src/renderers/CanvasRenderer.js';
import {
  buildOperatorDeckModel,
  buildRenderKeys,
  buildSkillPanelModel,
  formatBattleTime
} from '../src/ui/UIController.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';
import { DEFAULT_ENEMIES } from '../src/data/defaultEnemies.js';
import { buildEnemyOptionsModel } from '../src/editor/EditorController.js';

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

test('buildOperatorDeckModel includes custom operators after default order', () => {
  const model = buildOperatorDeckModel({
    operatorCatalog: {
      ...DEFAULT_OPERATORS,
      'custom-guard': {
        ...DEFAULT_OPERATORS.guard,
        id: 'custom-guard',
        name: '自定义近卫',
        class: 'custom',
        className: '自定'
      }
    },
    operators: [],
    cost: 99,
    selectedOperatorType: 'custom-guard'
  });

  assert.deepEqual(model.slice(0, 6).map((operator) => operator.id), [
    'vanguard',
    'guard',
    'defender',
    'sniper',
    'caster',
    'medic'
  ]);
  assert.equal(model.at(-1).id, 'custom-guard');
  assert.equal(model.at(-1).limit, 8);
  assert.equal(model.at(-1).selected, true);
});

test('buildEnemyOptionsModel includes custom enemies and missing selected ids', () => {
  const options = buildEnemyOptionsModel({
    enemyCatalog: {
      ...DEFAULT_ENEMIES,
      'custom-heavy': {
        ...DEFAULT_ENEMIES.heavy,
        id: 'custom-heavy',
        name: '自定义重甲'
      }
    },
    selectedEnemyType: 'missing-enemy'
  });

  assert.equal(options.some((option) => option.id === 'custom-heavy' && option.label === '自定义重甲'), true);
  assert.equal(options.some((option) => option.id === 'missing-enemy' && option.missing), true);
});

test('formatBattleTime renders minute and second clock', () => {
  assert.equal(formatBattleTime(125.2), '02:05');
});

test('rangeCellsFor returns own cell for melee operators', () => {
  assert.deepEqual(rangeCellsFor({ x: 2, y: 3 }, { type: 'melee', radius: 0 }), [{ x: 2, y: 3 }]);
});

test('rangeCellsFor returns translated pattern cells for custom ranges', () => {
  assert.deepEqual(rangeCellsFor({ x: 2, y: 3 }, {
    type: 'pattern',
    cells: [{ x: 0, y: 0 }, { x: -1, y: 2 }]
  }), [{ x: 2, y: 3 }, { x: 1, y: 5 }]);
});

test('buildSkillPanelModel exposes ready state for selected operator skill', () => {
  const operator = {
    skill: {
      name: '战术补给',
      description: '立刻回复6费用',
      sp: 10,
      spCost: 10,
      activeRemaining: 0
    }
  };

  assert.deepEqual(buildSkillPanelModel(operator), {
    name: '战术补给',
    description: '立刻回复6费用',
    sp: 10,
    spCost: 10,
    ready: true,
    activeRemaining: 0
  });
});

test('buildRenderKeys keeps interactive regions stable across frame-only changes', () => {
  const baseOperator = {
    id: 'vanguard-1',
    templateId: 'vanguard',
    class: 'vanguard',
    className: '先锋',
    name: '巡线员',
    hp: 180,
    maxHp: 180,
    attack: 18,
    defense: 6,
    attackInterval: 1.5,
    blockedCount: 0,
    block: 2,
    skill: {
      name: '战术补给',
      description: '立刻回复6费用。',
      sp: 4.1,
      spCost: 10,
      activeRemaining: 0
    }
  };
  const baseState = {
    map: { name: '新手训练场' },
    cost: 20,
    maxCost: 30,
    lives: 10,
    maxLives: 10,
    currentWave: 1,
    totalWaves: 3,
    elapsed: 12.1,
    status: 'running',
    speed: 1,
    operators: [baseOperator],
    operatorCatalog: DEFAULT_OPERATORS,
    selectedOperatorType: null,
    selectedOperatorId: 'vanguard-1',
    kills: 0,
    leaks: 0,
    stars: 0
  };
  const nextFrameState = {
    ...baseState,
    elapsed: 12.6,
    operators: [{ ...baseOperator, skill: { ...baseOperator.skill, sp: 4.6 } }]
  };

  const before = buildRenderKeys(baseState, '');
  const after = buildRenderKeys(nextFrameState, '');

  assert.equal(after.operatorDeck, before.operatorDeck);
  assert.equal(after.infoPanel, before.infoPanel);
  assert.equal(after.controls, before.controls);
});
