import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCanvasMetrics, rangeCellsFor, tileColorForType } from '../src/renderers/CanvasRenderer.js';
import {
  buildOperatorDeckModel,
  buildRenderKeys,
  buildEnemyIntelModel,
  buildOperatorSpBarModel,
  buildSkillPanelModel,
  UIController,
  formatBattleTime,
  importMapJsonIntoList
} from '../src/ui/UIController.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';
import { DEFAULT_ENEMIES } from '../src/data/defaultEnemies.js';
import { buildEnemyOptionsModel } from '../src/editor/EditorController.js';
import { fieldEditRenderMode } from '../src/custom-editor/CustomEditorController.js';

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

test('importMapJsonIntoList normalizes and appends imported map JSON', () => {
  const initial = [{ id: 'existing', name: 'Existing Map' }];
  const result = importMapJsonIntoList(initial, JSON.stringify({
    version: '1.0',
    id: 'imported-map',
    name: '导入地图',
    width: 2,
    height: 1,
    initialCost: 15,
    maxCost: 30,
    maxLives: 5,
    totalWaves: 1,
    grid: [['path', 'path']],
    path: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1 }]
  }));

  assert.equal(result.maps.length, 2);
  assert.equal(result.mapIndex, 1);
  assert.equal(result.map.version, '2.0');
  assert.equal(result.map.name, '导入地图');
  assert.equal(result.maps[0], initial[0]);
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

test('buildSkillPanelModel exposes all selected operator skills', () => {
  const operator = {
    skills: [{
      id: 'manual_supply',
      name: '战术补给',
      description: '立刻回复6费用',
      sp: 10,
      spCost: 10,
      activeRemaining: 0,
      triggerMode: 'manual',
      range: { type: 'pattern', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }
    }, {
      id: 'auto_fire',
      name: '自动速射',
      description: '自动缩短攻击间隔',
      sp: 4,
      spCost: 8,
      activeRemaining: 3,
      triggerMode: 'auto'
    }]
  };

  assert.deepEqual(buildSkillPanelModel(operator), [{
    id: 'manual_supply',
    name: '战术补给',
    description: '立刻回复6费用',
    sp: 10,
    spCost: 10,
    ready: true,
    activeRemaining: 0,
    triggerMode: 'manual',
    manual: true,
    rangeSummary: '2格'
  }, {
    id: 'auto_fire',
    name: '自动速射',
    description: '自动缩短攻击间隔',
    sp: 4,
    spCost: 8,
    ready: false,
    activeRemaining: 3,
    triggerMode: 'auto',
    manual: false,
    rangeSummary: '默认范围'
  }]);
});

test('custom editor input events avoid full form rerender to preserve focus', () => {
  assert.equal(fieldEditRenderMode({ eventType: 'input', tagName: 'INPUT' }), 'partial');
  assert.equal(fieldEditRenderMode({ eventType: 'change', tagName: 'INPUT' }), 'full');
  assert.equal(fieldEditRenderMode({ eventType: 'change', tagName: 'SELECT' }), 'full');
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

test('render keys ignore transient effect-only changes', () => {
  const state = {
    map: { name: 'Effect Map' },
    cost: 10,
    maxCost: 30,
    lives: 3,
    maxLives: 3,
    currentWave: 1,
    totalWaves: 1,
    elapsed: 1,
    status: 'running',
    speed: 1,
    operators: [],
    enemies: [],
    operatorCatalog: DEFAULT_OPERATORS,
    selectedOperatorType: null,
    selectedOperatorId: null,
    kills: 0,
    leaks: 0,
    stars: 0,
    effects: []
  };
  const before = buildRenderKeys(state, '');
  const after = buildRenderKeys({
    ...state,
    effects: [{ id: 'effect-1', type: 'wave_warning', elapsed: 0, duration: 2, payload: {} }]
  }, '');

  assert.equal(after.topStatus, before.topStatus);
  assert.equal(after.operatorDeck, before.operatorDeck);
  assert.equal(after.infoPanel, before.infoPanel);
});

test('operator deck model exposes redeploy cooldown and deploy limit', () => {
  const model = buildOperatorDeckModel({
    operatorCatalog: DEFAULT_OPERATORS,
    operators: [],
    cost: 30,
    selectedOperatorType: null,
    redeployCooldowns: { vanguard: 7.4 },
    deployLimit: 8
  });

  const vanguard = model.find((operator) => operator.id === 'vanguard');
  assert.equal(vanguard.disabled, true);
  assert.equal(vanguard.disabledReason, '再部署 8s');
  assert.equal(vanguard.cooldownRemaining, 8);
});

test('operator battlefield model exposes first skill sp ratio', () => {
  const operator = {
    skills: [{ id: 'skill', sp: 5, spCost: 10, triggerMode: 'manual' }]
  };

  assert.deepEqual(buildOperatorSpBarModel(operator), {
    visible: true,
    ratio: 0.5,
    ready: false
  });
});

test('operator battlefield model hides non-positive skill sp cost', () => {
  const model = buildOperatorSpBarModel({
    skills: [{ id: 'skill', sp: 5, spCost: 0, triggerMode: 'manual' }]
  });

  assert.deepEqual(model, {
    visible: false,
    ratio: 0,
    ready: false
  });
  assert.equal(Number.isFinite(model.ratio), true);
});

test('operator battlefield model hides missing skill sp cost', () => {
  const model = buildOperatorSpBarModel({
    skills: [{ id: 'skill', sp: 5, triggerMode: 'manual' }]
  });

  assert.deepEqual(model, {
    visible: false,
    ratio: 0,
    ready: false
  });
  assert.equal(Number.isFinite(model.ratio), true);
});

test('operator deck model reason priority matches deployment checks', () => {
  const totalFull = buildOperatorDeckModel({
    operatorCatalog: DEFAULT_OPERATORS,
    operators: [{ class: 'guard' }],
    cost: 0,
    selectedOperatorType: null,
    redeployCooldowns: { vanguard: 7.4 },
    deployLimit: 1
  });
  assert.equal(totalFull.find((operator) => operator.id === 'vanguard').disabledReason, '部署上限');

  const classFull = buildOperatorDeckModel({
    operatorCatalog: DEFAULT_OPERATORS,
    operators: [{ class: 'guard' }, { class: 'guard' }, { class: 'guard' }],
    cost: 0,
    selectedOperatorType: null,
    redeployCooldowns: { guard: 7.4 },
    deployLimit: 8
  });
  assert.equal(classFull.find((operator) => operator.id === 'guard').disabledReason, '职业上限');
});

test('operator deck model uses map deploy limit for custom class fallback', () => {
  const custom = {
    ...DEFAULT_OPERATORS.guard,
    id: 'custom-specialist',
    name: '自定义特种',
    class: 'specialist-custom',
    className: '特种',
    cost: 1
  };
  const operators = Array.from({ length: 8 }, (_, index) => ({
    id: `custom-specialist-${index}`,
    class: custom.class
  }));

  const model = buildOperatorDeckModel({
    operatorCatalog: { custom },
    operators,
    cost: 99,
    selectedOperatorType: null,
    deployLimit: 10
  });

  const card = model.find((operator) => operator.id === custom.id);
  assert.equal(card.limit, 10);
  assert.equal(card.disabledReason, '');
  assert.equal(card.disabled, false);
});

test('enemy intel model summarizes range and traits', () => {
  const model = buildEnemyIntelModel({
    id: 'caster',
    name: '术式兵',
    maxHp: 120,
    attack: 30,
    defense: 5,
    resistance: 0.2,
    speed: 0.8,
    range: { type: 'diamond', radius: 2 },
    damageType: 'arts',
    isFlying: false,
    canBeBlocked: true,
    blockBypass: 2,
    elite: true,
    boss: false,
    description: '远程法术攻击。'
  });

  assert.equal(model.name, '术式兵');
  assert.equal(model.rangeSummary, '菱形2');
  assert.deepEqual(model.traits, ['法术', '远程', '防阻挡2', '精英']);
});

test('enemy intel model defaults missing optional fields', () => {
  const model = buildEnemyIntelModel({ id: 'x', name: 'X' });

  assert.equal(model.resistance, 0);
  assert.equal(typeof model.rangeSummary, 'string');
  assert.equal(model.rangeSummary.includes('NaN'), false);
  assert.equal(model.phaseCount, 0);
  assert.deepEqual(model.traits, []);
});

test('enemy intel render treats custom catalog text as text content', () => {
  const panel = createFakeElement('aside');
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => createFakeElement(tagName)
  };

  try {
    UIController.prototype.renderEnemyIntel.call({
      enemyIntelPanel: panel,
      root: createFakeElement('div')
    }, {
      enemyIntelQueue: [{
        id: 'bad"id',
        name: '<img src=x onerror=alert(1)>',
        maxHp: 1,
        attack: 2,
        defense: 3,
        resistance: 0,
        speed: 1,
        range: { type: 'diamond', radius: 1 },
        damageType: 'arts',
        description: '<script>alert(1)</script>'
      }]
    });
  } finally {
    globalThis.document = originalDocument;
  }

  assert.equal(panel.innerHTML.includes('<img'), false);
  assert.equal(panel.innerHTML.includes('<script>'), false);
  assert.equal(panel.innerHTML.includes('&lt;img'), true);
  assert.equal(panel.innerHTML.includes('&lt;script&gt;'), true);
  const closeButton = panel.querySelector('[data-enemy-intel-close]');
  assert.equal(closeButton?.dataset.enemyIntelClose, 'bad"id');
  assert.equal(closeButton?.attributes['aria-label'], '关闭敌人情报');
});

function createFakeElement(tagName) {
  const element = {
    tagName,
    attributes: {},
    children: [],
    dataset: {},
    _textContent: '',
    _rawInnerHTML: null,
    classList: {
      values: new Set(),
      add(...classes) {
        classes.forEach((className) => this.values.add(className));
      },
      remove(...classes) {
        classes.forEach((className) => this.values.delete(className));
      },
      contains(className) {
        return this.values.has(className);
      }
    },
    appendChild(child) {
      this._rawInnerHTML = null;
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this._rawInnerHTML = null;
      this._textContent = '';
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    querySelector(selector) {
      if (selector === '[data-enemy-intel-close]' && this.dataset.enemyIntelClose !== undefined) {
        return this;
      }
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) {
          return found;
        }
      }
      return null;
    }
  };

  Object.defineProperty(element, 'className', {
    get() {
      return Array.from(this.classList.values).join(' ');
    },
    set(value) {
      this.classList.values = new Set(String(value).split(/\s+/).filter(Boolean));
    }
  });

  Object.defineProperty(element, 'textContent', {
    get() {
      return element._textContent;
    },
    set(value) {
      element._rawInnerHTML = null;
      element.children = [];
      element._textContent = String(value);
    }
  });

  Object.defineProperty(element, 'innerHTML', {
    get() {
      if (element._rawInnerHTML !== null) {
        return element._rawInnerHTML;
      }
      return serializeFakeElementChildren(element);
    },
    set(value) {
      element.children = [];
      element._textContent = '';
      element._rawInnerHTML = String(value);
    }
  });

  return element;
}

function serializeFakeElementChildren(element) {
  return [
    escapeFakeHtml(element._textContent),
    ...element.children.map((child) => serializeFakeElement(child))
  ].join('');
}

function serializeFakeElement(element) {
  const attrs = { ...element.attributes };
  if (element.className) {
    attrs.class = element.className;
  }
  Object.entries(element.dataset).forEach(([key, value]) => {
    attrs[`data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`] = value;
  });
  const attrText = Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeFakeHtml(value)}"`)
    .join('');
  return `<${element.tagName}${attrText}>${serializeFakeElementChildren(element)}</${element.tagName}>`;
}

function escapeFakeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
