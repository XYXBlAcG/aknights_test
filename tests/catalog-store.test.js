import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ENEMIES } from '../src/data/defaultEnemies.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';
import {
  normalizeEnemyTemplate,
  normalizeOperatorTemplate,
  validateCustomCatalogs,
  validateOperatorTemplate
} from '../src/data/CatalogValidators.js';
import {
  emptyCustomCatalogs,
  loadCustomCatalogs,
  mergeCatalogs,
  saveCustomCatalogs
} from '../src/data/CatalogStore.js';

test('operator and enemy templates normalize into gameplay-ready data', () => {
  const operator = normalizeOperatorTemplate({
    id: 'custom-sniper',
    name: '自定义狙击',
    class: 'sniper',
    className: '狙击',
    deployType: 'high',
    cost: '11',
    maxHp: '150',
    attack: '31',
    defense: '2',
    resistance: '0.1',
    attackInterval: '0.9',
    block: '0',
    damageType: 'physical',
    targeting: 'flying-first',
    range: { type: 'pattern', cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }] },
    color: '#5fc9ff'
  });
  const enemy = normalizeEnemyTemplate({
    id: 'custom-heavy',
    name: '自定义重甲',
    maxHp: '260',
    attack: '22',
    defense: '15',
    resistance: '0.2',
    speed: '0.7',
    attackInterval: '2',
    canBeBlocked: true,
    isFlying: false,
    rewardCost: '7',
    elite: true,
    boss: false,
    color: '#ffaa55'
  });

  assert.equal(operator.cost, 11);
  assert.deepEqual(operator.range.cells, [{ x: 0, y: 0 }, { x: 2, y: 0 }]);
  assert.equal(enemy.maxHp, 260);
  assert.equal(enemy.elite, true);
});

test('operator normalization migrates legacy skill into a three-skill list', () => {
  const operator = normalizeOperatorTemplate({
    ...DEFAULT_OPERATORS.guard,
    skill: {
      ...DEFAULT_OPERATORS.guard.skill,
      triggerMode: 'auto',
      range: { type: 'pattern', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }
    }
  });

  assert.equal(operator.skills.length, 1);
  assert.equal(operator.skill.id, 'power_strike');
  assert.equal(operator.skills[0].triggerMode, 'auto');
  assert.deepEqual(operator.skills[0].range.cells, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
});

test('operator validation rejects more than three skills', () => {
  const result = validateOperatorTemplate({
    ...DEFAULT_OPERATORS.sniper,
    skill: null,
    skills: [
      { ...DEFAULT_OPERATORS.sniper.skill, id: 'skill_a' },
      { ...DEFAULT_OPERATORS.sniper.skill, id: 'skill_b' },
      { ...DEFAULT_OPERATORS.sniper.skill, id: 'skill_c' },
      { ...DEFAULT_OPERATORS.sniper.skill, id: 'skill_d' }
    ]
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /at most 3 skills/);
});

test('operator validation rejects malformed ids and empty pattern ranges', () => {
  const result = validateOperatorTemplate({
    ...DEFAULT_OPERATORS.sniper,
    id: 'Bad ID',
    range: { type: 'pattern', cells: [] }
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /id/);
  assert.match(result.errors.join('\n'), /Pattern range/);
});

test('custom catalog storage handles malformed JSON safely', () => {
  const storage = createMemoryStorage({ 'aknights.customCatalogs.v1': '{bad json' });
  const result = loadCustomCatalogs(storage);

  assert.deepEqual(result.data, emptyCustomCatalogs());
  assert.equal(result.errors.length, 1);
});

test('custom catalogs save, load, validate, and merge with defaults', () => {
  const storage = createMemoryStorage();
  const custom = {
    version: 1,
    operators: {
      sniper: {
        ...DEFAULT_OPERATORS.sniper,
        name: '覆盖速射手',
        attack: 99,
        range: { type: 'pattern', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }
      }
    },
    enemies: {
      'custom-heavy': {
        ...DEFAULT_ENEMIES.heavy,
        id: 'custom-heavy',
        name: '自定义重甲',
        maxHp: 240
      }
    }
  };

  saveCustomCatalogs(custom, storage);
  const loaded = loadCustomCatalogs(storage);
  const validation = validateCustomCatalogs(loaded.data);
  const merged = mergeCatalogs(DEFAULT_OPERATORS, DEFAULT_ENEMIES, loaded.data);

  assert.equal(loaded.errors.length, 0);
  assert.equal(validation.ok, true);
  assert.equal(merged.errors.length, 0);
  assert.equal(merged.operatorCatalog.sniper.name, '覆盖速射手');
  assert.equal(merged.operatorCatalog.sniper.attack, 99);
  assert.equal(merged.enemyCatalog['custom-heavy'].name, '自定义重甲');
  assert.equal(merged.enemyCatalog.infantry.name, DEFAULT_ENEMIES.infantry.name);
});

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
