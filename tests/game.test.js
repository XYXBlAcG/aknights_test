import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/Game.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';
import { DEFAULT_ENEMIES } from '../src/data/defaultEnemies.js';

const map = {
  version: '2.0',
  id: 'tiny',
  name: 'Tiny',
  width: 2,
  height: 1,
  initialCost: 30,
  maxCost: 30,
  maxLives: 2,
  totalWaves: 1,
  grid: [['path', 'path']],
  paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], lifeDamage: 1 }],
  timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
};

test('game can deploy, tick, and expose UI state', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  const deployed = game.deployOperator('vanguard', { x: 0, y: 0 });
  game.start();
  game.tick(0.2);

  const state = game.getState();
  assert.equal(deployed.ok, true);
  assert.equal(state.operators.length, 1);
  assert.equal(state.enemies.length, 1);
  assert.equal(state.status, 'running');
});

test('game cycles speed through configured multipliers', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  assert.equal(game.getState().speed, 1);
  game.cycleSpeed();
  assert.equal(game.getState().speed, 1.5);
  game.setSpeed(5);
  assert.equal(game.getState().speed, 5);
});

test('game awards two stars when an enemy leaks but lives remain', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  game.start();
  game.tick(2);

  const state = game.getState();
  assert.equal(state.status, 'victory');
  assert.equal(state.leaks, 1);
  assert.equal(state.stars, 2);
});

test('game charges and releases vanguard active skill', () => {
  const skillMap = {
    ...map,
    initialCost: 8,
    maxCost: 50,
    timeline: [{ wave: 1, startTime: 999, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const game = new Game({ map: skillMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const deployed = game.deployOperator('vanguard', { x: 0, y: 0 });

  game.start();
  game.tick(10);
  const result = game.activateSkill(deployed.operator.id);
  const operator = game.getState().operators[0];

  assert.equal(result.ok, true);
  assert.equal(operator.skill.sp, 0);
  assert.equal(game.getState().cost, 22);
});

test('default operators each define an active skill', () => {
  Object.values(DEFAULT_OPERATORS).forEach((operator) => {
    assert.equal(typeof operator.skill.name, 'string');
    assert.equal(operator.skill.spCost > 0, true);
    assert.equal(typeof operator.skill.description, 'string');
  });
});

test('game releases defender skill with self heal and active duration', () => {
  const skillMap = {
    ...map,
    initialCost: 14,
    maxCost: 50,
    timeline: [{ wave: 1, startTime: 999, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const game = new Game({ map: skillMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const deployed = game.deployOperator('defender', { x: 0, y: 0 });
  deployed.operator.hp = 300;

  game.start();
  game.tick(18);
  const result = game.activateSkill(deployed.operator.id);

  assert.equal(result.ok, true);
  assert.equal(deployed.operator.hp, 384);
  assert.equal(deployed.operator.skill.activeRemaining, 10);
});

test('game releases medic skill to heal lowest hp ground operator', () => {
  const skillMap = {
    version: '2.0',
    id: 'heal-test',
    name: 'Heal Test',
    width: 3,
    height: 1,
    initialCost: 20,
    maxCost: 50,
    maxLives: 2,
    totalWaves: 1,
    grid: [['path', 'high', 'path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], lifeDamage: 1 }],
    timeline: [{ wave: 1, startTime: 999, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const game = new Game({ map: skillMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const vanguard = game.deployOperator('vanguard', { x: 0, y: 0 }).operator;
  const medic = game.deployOperator('medic', { x: 1, y: 0 }).operator;

  game.start();
  game.tick(14);
  vanguard.hp = 40;
  const result = game.activateSkill(medic.id);

  assert.equal(result.ok, true);
  assert.equal(vanguard.hp, 120);
});

test('game does not consume medic skill sp when there is no heal target', () => {
  const skillMap = {
    version: '2.0',
    id: 'heal-empty-test',
    name: 'Heal Empty Test',
    width: 3,
    height: 1,
    initialCost: 12,
    maxCost: 50,
    maxLives: 2,
    totalWaves: 1,
    grid: [['path', 'high', 'path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], lifeDamage: 1 }],
    timeline: [{ wave: 1, startTime: 999, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const game = new Game({ map: skillMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const medic = game.deployOperator('medic', { x: 1, y: 0 }).operator;

  game.start();
  game.tick(14);
  const result = game.activateSkill(medic.id);

  assert.equal(result.ok, false);
  assert.equal(medic.skill.sp, medic.skill.spCost);
});
