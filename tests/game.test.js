import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/Game.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';
import { DEFAULT_ENEMIES } from '../src/data/defaultEnemies.js';
import { Enemy } from '../src/entities/Enemy.js';
import { createWaveSystem } from '../src/systems/WaveSystem.js';

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

test('game clears stale enemy blockers before movement', () => {
  const movementMap = {
    version: '2.0',
    id: 'stale-block-move',
    name: 'Stale Block Move',
    width: 4,
    height: 1,
    initialCost: 30,
    maxCost: 30,
    maxLives: 2,
    totalWaves: 1,
    grid: [['path', 'path', 'path', 'path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 3, y: 0 }], lifeDamage: 1 }],
    timeline: []
  };
  const game = new Game({ map: movementMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const vanguard = game.deployOperator('vanguard', { x: 3, y: 0 }).operator;
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.infantry,
    id: 'stale-zero-attack',
    attack: 0
  }, { pathId: 'main' });
  game.placeEnemyAtPathDistance(enemy, 0);
  enemy.blockedBy = vanguard.id;
  vanguard.blockedEnemies = [];
  game.enemies.push(enemy);

  game.start();
  game.tick(1);

  assert.equal(enemy.blockedBy, null);
  assert.equal(vanguard.hp, vanguard.maxHp);
  assert.equal(enemy.pathDistance > 0, true);
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

test('default operators each define at least one skill', () => {
  Object.values(DEFAULT_OPERATORS).forEach((operator) => {
    const skills = operator.skills ?? [operator.skill].filter(Boolean);
    assert.equal(skills.length >= 1, true);
    assert.equal(typeof skills[0].name, 'string');
    assert.equal(skills[0].spCost > 0, true);
    assert.equal(typeof skills[0].description, 'string');
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

test('game can deploy operators with a chosen facing direction', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  const deployed = game.deployOperator('vanguard', { x: 0, y: 0 }, 'left');

  assert.equal(deployed.ok, true);
  assert.equal(deployed.operator.direction, 'left');
});

test('auto trigger skills release when charged without manual input', () => {
  const autoOperator = {
    ...DEFAULT_OPERATORS.guard,
    id: 'auto-guard',
    cost: 0,
    skill: null,
    skills: [{
      id: 'auto_supply',
      name: '自动补给',
      description: '自动回复费用。',
      spCost: 1,
      triggerMode: 'auto',
      type: 'instant_cost',
      amount: 5
    }]
  };
  const game = new Game({
    map: { ...map, initialCost: 0, maxCost: 20, timeline: [] },
    operatorCatalog: { 'auto-guard': autoOperator },
    enemyCatalog: DEFAULT_ENEMIES
  });

  const deployed = game.deployOperator('auto-guard', { x: 0, y: 0 });
  game.start();
  game.tick(1.1);

  assert.equal(deployed.operator.skills[0].sp, 0);
  assert.equal(game.getState().cost, 6);
});

test('inspecting a placed operator lowers speed and clearing inspection restores it', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const deployed = game.deployOperator('vanguard', { x: 0, y: 0 });
  game.setSpeed(3);

  game.selectPlacedOperator(deployed.operator.id);
  assert.equal(game.getState().speed, 0.5);

  game.clearSelection();
  assert.equal(game.getState().speed, 3);
});

test('restarting while inspecting restores the previous battle speed', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const deployed = game.deployOperator('vanguard', { x: 0, y: 0 });
  game.setSpeed(4);
  game.selectPlacedOperator(deployed.operator.id);

  game.restart();

  assert.equal(game.getState().speed, 4);
});

test('multi-phase enemy rewards cost only after final phase death', () => {
  const phaseMap = {
    ...map,
    initialCost: 30,
    maxCost: 50,
    timeline: []
  };
  const operatorCatalog = {
    rewardGuard: {
      ...DEFAULT_OPERATORS.guard,
      id: 'rewardGuard',
      cost: 0,
      attack: 100,
      attackInterval: 1,
      skill: null,
      skills: []
    }
  };
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.infantry,
    id: 'reward-phase',
    rewardCost: 9,
    phases: [
      { name: 'first', maxHp: 1, attack: 0, defense: 0, resistance: 0, speed: 1, attackInterval: 1, color: '#e15f5f' },
      { name: 'second', maxHp: 1, attack: 0, defense: 0, resistance: 0, speed: 1, attackInterval: 1, color: '#d89d4a' }
    ]
  }, { pathId: 'main' });
  const game = new Game({ map: phaseMap, operatorCatalog, enemyCatalog: DEFAULT_ENEMIES });
  const guard = game.deployOperator('rewardGuard', { x: 0, y: 0 }).operator;
  game.placeEnemyAtPathDistance(enemy, 0);
  enemy.blockedBy = guard.id;
  guard.blockedEnemies = [enemy];
  game.enemies.push(enemy);
  game.start();

  const initialCost = game.getState().cost;

  game.tick(0);

  assert.equal(game.getState().kills, 0);
  assert.equal(game.getState().cost, initialCost);

  guard.attackTimer = guard.attackInterval;
  game.tick(0);

  assert.equal(game.getState().kills, 1);
  assert.equal(game.getState().cost, initialCost + 9);
});

test('game emits route warning before scheduled enemy spawn', () => {
  const warningMap = {
    ...map,
    timeline: [{ wave: 1, startTime: 2, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }],
    waveWarningSeconds: 1
  };
  const game = new Game({ map: warningMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  game.start();
  game.tick(1.1);

  const effects = game.getState().effects;
  assert.equal(effects.some((effect) => effect.type === 'wave_warning' && effect.payload.pathId === 'main'), true);
});

test('game emits attack and death effects during combat', () => {
  const effectMap = { ...map, initialCost: 30, maxCost: 50, timeline: [] };
  const game = new Game({ map: effectMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const guard = game.deployOperator('guard', { x: 0, y: 0 }).operator;
  const enemy = new Enemy({ ...DEFAULT_ENEMIES.infantry, maxHp: 1 }, { pathId: 'main' });
  enemy.cell = { x: 0, y: 0 };
  enemy.x = 0;
  enemy.y = 0;
  enemy.blockedBy = guard.id;
  guard.blockedEnemies = [enemy];
  game.enemies.push(enemy);

  game.start();
  game.tick(1.2);

  const types = game.getState().effects.map((effect) => effect.type);
  assert.equal(types.includes('operator_attack'), true);
  assert.equal(types.includes('enemy_death'), true);
});

test('game emits phase break effect even when enemy object is now dead', () => {
  const game = new Game({
    map: { ...map, timeline: [] },
    operatorCatalog: DEFAULT_OPERATORS,
    enemyCatalog: DEFAULT_ENEMIES
  });
  const enemy = {
    cell: { x: 0, y: 0 },
    color: '#e15f5f',
    isDead: true
  };

  game.addCombatEffects({
    phaseChangedEnemies: [enemy],
    killedEnemies: [enemy]
  });

  assert.equal(game.getState().effects.some((effect) => {
    return effect.type === 'enemy_death' && effect.payload.phaseBreak === true;
  }), true);
});

test('wave warnings are unique for duplicate timeline entries', () => {
  const waveSystem = createWaveSystem({
    enemyCatalog: DEFAULT_ENEMIES,
    timeline: [
      { wave: 1, startTime: 2, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' },
      { wave: 1, startTime: 2, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }
    ]
  });

  const warnings = waveSystem.warningsDue(2);

  assert.equal(warnings.length, 2);
  assert.equal(new Set(warnings.map((warning) => warning.id)).size, 2);
});

test('selecting the same operator type twice cancels deck selection', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  game.selectOperator('vanguard');
  game.toggleOperatorSelection('vanguard');

  assert.equal(game.getState().selectedOperatorType, null);
});

test('map deploy limit overrides global deploy limit', () => {
  const limitedMap = { ...map, deployLimit: 1, initialCost: 30 };
  const game = new Game({ map: limitedMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  assert.equal(game.deployOperator('vanguard', { x: 0, y: 0 }).ok, true);
  assert.equal(game.canDeploy('guard', { x: 1, y: 0 }).ok, false);
  assert.match(game.canDeploy('guard', { x: 1, y: 0 }).reason, /Total deploy limit/);
  assert.equal(game.getState().deployLimit, 1);
});
