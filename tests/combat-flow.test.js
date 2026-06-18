import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaveSystem } from '../src/systems/WaveSystem.js';
import { createBlockingSystem } from '../src/systems/BlockingSystem.js';
import { createCombatSystem } from '../src/systems/CombatSystem.js';
import { evaluateBattleResult } from '../src/systems/WinLoseSystem.js';
import { createDeploymentSystem } from '../src/systems/DeploymentSystem.js';
import { createCostSystem } from '../src/systems/CostSystem.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';
import { DEFAULT_ENEMIES } from '../src/data/defaultEnemies.js';
import { Enemy } from '../src/entities/Enemy.js';

test('wave system spawns scheduled enemies once', () => {
  const wave = createWaveSystem({
    timeline: [{ wave: 1, startTime: 1, enemyType: 'infantry', count: 2, interval: 0.5, pathId: 'main' }],
    enemyCatalog: DEFAULT_ENEMIES
  });

  assert.equal(wave.tick(0.9).spawned.length, 0);
  assert.equal(wave.tick(0.2).spawned.length, 1);
  assert.equal(wave.tick(0.5).spawned.length, 1);
  assert.equal(wave.isComplete(), true);
});

test('blocking stops ground enemies but ignores flying enemies', () => {
  const map = { width: 1, height: 1, grid: [['path']], initialCost: 30, maxCost: 30 };
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });
  const placed = deployment.deploy('defender', { x: 0, y: 0 }).operator;
  const blocking = createBlockingSystem();
  const ground = { id: 'e1', cell: { x: 0, y: 0 }, isFlying: false, canBeBlocked: true, blockedBy: null };
  const flying = { id: 'e2', cell: { x: 0, y: 0 }, isFlying: true, canBeBlocked: false, blockedBy: null };

  blocking.update([placed], [ground, flying]);

  assert.equal(ground.blockedBy, placed.id);
  assert.equal(flying.blockedBy, null);
});

test('combat system lets ranged operators damage enemies in range', () => {
  const map = { width: 2, height: 1, grid: [['path', 'high']], initialCost: 30, maxCost: 30 };
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });
  const sniper = deployment.deploy('sniper', { x: 1, y: 0 }).operator;
  const enemy = new Enemy(DEFAULT_ENEMIES.drone, { pathId: 'main' });
  enemy.cell = { x: 0, y: 0 };
  const combat = createCombatSystem();

  combat.tick(0.8, { operators: [sniper], enemies: [enemy] });

  assert.equal(enemy.hp, 92);
});

test('win lose evaluator distinguishes victory stars and defeat', () => {
  assert.equal(evaluateBattleResult({ lives: 0, leaks: 3, wavesComplete: false, enemiesRemaining: 2 }).state, 'defeat');
  assert.equal(evaluateBattleResult({ lives: 1, leaks: 0, wavesComplete: true, enemiesRemaining: 0 }).stars, 3);
  assert.equal(evaluateBattleResult({ lives: 1, leaks: 1, wavesComplete: true, enemiesRemaining: 0 }).stars, 2);
});
