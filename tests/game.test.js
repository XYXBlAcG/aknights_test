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
