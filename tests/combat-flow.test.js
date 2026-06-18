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

test('blocking ignores enemies whose block bypass exceeds operator block', () => {
  const map = { width: 1, height: 1, grid: [['path']], initialCost: 30, maxCost: 30 };
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });
  const vanguard = deployment.deploy('vanguard', { x: 0, y: 0 }).operator;
  const enemy = {
    id: 'bypass-1',
    cell: { x: 0, y: 0 },
    isFlying: false,
    canBeBlocked: true,
    blockBypass: 3,
    blockedBy: null,
    isDead: false
  };

  createBlockingSystem().update([vanguard], [enemy]);

  assert.equal(enemy.blockedBy, null);
  assert.equal(vanguard.blockedEnemies.length, 0);
});

test('enemy runtime applies first phase stats when phases are present', () => {
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.heavy,
    id: 'phase-heavy',
    phases: [{
      name: '装甲外壳',
      maxHp: 60,
      attack: 12,
      defense: 20,
      resistance: 0.1,
      speed: 0.4,
      attackInterval: 2.2,
      color: '#85a6ff'
    }, {
      name: '核心暴露',
      maxHp: 40,
      attack: 24,
      defense: 4,
      resistance: 0,
      speed: 1.2,
      attackInterval: 1.2,
      color: '#ff8a4d'
    }]
  }, { pathId: 'main' });

  assert.equal(enemy.phaseIndex, 0);
  assert.equal(enemy.maxHp, 60);
  assert.equal(enemy.hp, 60);
  assert.equal(enemy.defense, 20);
  assert.equal(enemy.color, '#85a6ff');
  assert.equal(enemy.attackTimer, enemy.attackInterval);
  assert.equal(enemy.phases.length, 2);
});

test('enemy runtime phase advancement falls back to base optional fields', () => {
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.heavy,
    id: 'phase-fallback-heavy',
    damageType: 'physical',
    range: { type: 'melee', radius: 0 },
    color: '#base',
    canBeBlocked: true,
    description: 'base',
    phases: [{
      name: '术式外壳',
      maxHp: 60,
      attack: 18,
      defense: 16,
      resistance: 0.2,
      speed: 0.5,
      attackInterval: 2,
      damageType: 'arts',
      range: { type: 'diamond', radius: 2 },
      color: '#phase',
      canBeBlocked: false,
      description: 'phase zero'
    }, {
      name: '核心暴露',
      maxHp: 40,
      attack: 24,
      defense: 4,
      resistance: 0,
      speed: 1.2,
      attackInterval: 1.2
    }]
  }, { pathId: 'main' });

  assert.equal(enemy.hasMorePhases, true);
  assert.equal(enemy.damageType, 'arts');
  assert.deepEqual(enemy.range, { type: 'diamond', radius: 2 });
  assert.equal(enemy.color, '#phase');
  assert.equal(enemy.canBeBlocked, false);
  assert.equal(enemy.description, 'phase zero');

  enemy.blockedBy = 'defender-1';
  assert.equal(enemy.advancePhase(), true);

  assert.equal(enemy.phaseIndex, 1);
  assert.equal(enemy.hasMorePhases, false);
  assert.equal(enemy.damageType, 'physical');
  assert.deepEqual(enemy.range, { type: 'melee', radius: 0 });
  assert.equal(enemy.color, '#base');
  assert.equal(enemy.canBeBlocked, true);
  assert.equal(enemy.description, 'base');
  assert.equal(enemy.blockedBy, 'defender-1');
});

test('enemy runtime clears blocker when advancing into unblockable phase', () => {
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.heavy,
    id: 'unblockable-phase-heavy',
    canBeBlocked: true,
    phases: [{
      name: '装甲外壳',
      maxHp: 60,
      attack: 12,
      defense: 20,
      resistance: 0.1,
      speed: 0.4,
      attackInterval: 2.2,
      canBeBlocked: true
    }, {
      name: '高速突袭',
      maxHp: 40,
      attack: 24,
      defense: 4,
      resistance: 0,
      speed: 1.2,
      attackInterval: 1.2,
      canBeBlocked: false
    }]
  }, { pathId: 'main' });

  enemy.blockedBy = 'defender-1';
  assert.equal(enemy.advancePhase(), true);

  assert.equal(enemy.canBeBlocked, false);
  assert.equal(enemy.blockedBy, null);
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

test('ranged enemies attack operators in range while moving', () => {
  const map = { width: 3, height: 1, grid: [['path', 'path', 'high']], initialCost: 30, maxCost: 30 };
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });
  const sniper = deployment.deploy('sniper', { x: 2, y: 0 }).operator;
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.infantry,
    id: 'ranged-caster',
    attack: 40,
    attackInterval: 1,
    damageType: 'arts',
    range: { type: 'diamond', radius: 2 },
    targeting: 'nearest'
  }, { pathId: 'main' });
  enemy.cell = { x: 0, y: 0 };
  enemy.attackTimer = 1;

  const result = createCombatSystem().tick(1, { operators: [sniper], enemies: [enemy] });

  assert.equal(sniper.hp, 100);
  assert.equal(result.damagedOperators[0], sniper);
});

test('enemy combat clears stale live blockers without melee attacking them', () => {
  const map = { width: 2, height: 1, grid: [['path', 'path']], initialCost: 30, maxCost: 30 };
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });
  const guard = deployment.deploy('guard', { x: 0, y: 0 }).operator;
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.infantry,
    attack: 40,
    attackInterval: 1,
    range: { type: 'melee', radius: 0 }
  }, { pathId: 'main' });
  enemy.cell = { x: 1, y: 0 };
  enemy.blockedBy = guard.id;
  enemy.attackTimer = 1;
  guard.blockedEnemies = [];

  const result = createCombatSystem().tick(1, { operators: [guard], enemies: [enemy] });

  assert.equal(guard.hp, guard.maxHp);
  assert.equal(enemy.blockedBy, null);
  assert.equal(result.damagedOperators.length, 0);
});

test('combat system lets pattern range operators hit painted cells only', () => {
  const operatorCatalog = {
    patternSniper: {
      ...DEFAULT_OPERATORS.sniper,
      id: 'patternSniper',
      range: { type: 'pattern', cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }
    }
  };
  const map = { width: 4, height: 1, grid: [['path', 'high', 'path', 'path']], initialCost: 30, maxCost: 30 };
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog
  });
  const sniper = deployment.deploy('patternSniper', { x: 1, y: 0 }).operator;
  const inPattern = new Enemy(DEFAULT_ENEMIES.drone, { pathId: 'main' });
  const outsidePattern = new Enemy(DEFAULT_ENEMIES.drone, { pathId: 'main' });
  inPattern.cell = { x: 3, y: 0 };
  outsidePattern.cell = { x: 2, y: 0 };
  const combat = createCombatSystem();

  combat.tick(0.8, { operators: [sniper], enemies: [outsidePattern, inPattern] });

  assert.equal(inPattern.hp, 92);
  assert.equal(outsidePattern.hp, 120);
});

test('combat system applies active attack multiplier skill effects', () => {
  const map = { width: 1, height: 1, grid: [['path']], initialCost: 30, maxCost: 30 };
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });
  const guard = deployment.deploy('guard', { x: 0, y: 0 }).operator;
  const enemy = new Enemy(DEFAULT_ENEMIES.infantry, { pathId: 'main' });
  enemy.cell = { x: 0, y: 0 };
  enemy.blockedBy = guard.id;
  guard.blockedEnemies = [enemy];
  guard.skill = {
    activeRemaining: 10,
    effect: { attackMultiplier: 1.6 }
  };
  const combat = createCombatSystem();

  combat.tick(1.2, { operators: [guard], enemies: [enemy] });

  assert.equal(enemy.hp, 46);
});

test('combat system applies active attack interval multiplier effects', () => {
  const map = { width: 2, height: 1, grid: [['path', 'high']], initialCost: 30, maxCost: 30 };
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });
  const sniper = deployment.deploy('sniper', { x: 1, y: 0 }).operator;
  const enemy = new Enemy(DEFAULT_ENEMIES.drone, { pathId: 'main' });
  enemy.cell = { x: 0, y: 0 };
  sniper.attackTimer = 0;
  sniper.skill.activeRemaining = 8;
  const combat = createCombatSystem();

  combat.tick(0.45, { operators: [sniper], enemies: [enemy] });

  assert.equal(enemy.hp, 92);
});

test('combat system consumes caster next attack multiplier', () => {
  const map = { width: 2, height: 1, grid: [['path', 'high']], initialCost: 30, maxCost: 30 };
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });
  const caster = deployment.deploy('caster', { x: 1, y: 0 }).operator;
  const enemy = new Enemy(DEFAULT_ENEMIES.infantry, { pathId: 'main' });
  enemy.cell = { x: 0, y: 0 };
  caster.skill.nextAttackMultiplier = 2.5;
  const combat = createCombatSystem();

  combat.tick(2.5, { operators: [caster], enemies: [enemy] });

  assert.equal(enemy.hp, 0);
  assert.equal(caster.skill.nextAttackMultiplier, null);
});

test('win lose evaluator distinguishes victory stars and defeat', () => {
  assert.equal(evaluateBattleResult({ lives: 0, leaks: 3, wavesComplete: false, enemiesRemaining: 2 }).state, 'defeat');
  assert.equal(evaluateBattleResult({ lives: 1, leaks: 0, wavesComplete: true, enemiesRemaining: 0 }).stars, 3);
  assert.equal(evaluateBattleResult({ lives: 1, leaks: 1, wavesComplete: true, enemiesRemaining: 0 }).stars, 2);
});
