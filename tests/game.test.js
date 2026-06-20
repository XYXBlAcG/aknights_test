import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/Game.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';
import { DEFAULT_ENEMIES } from '../src/data/defaultEnemies.js';
import { Enemy } from '../src/entities/Enemy.js';
import { createWaveSystem } from '../src/systems/WaveSystem.js';
import { buildOperatorSpBarModel } from '../src/ui/UIController.js';

const map = {
  version: '2.0',
  id: 'tiny',
  name: 'Tiny',
  width: 3,
  height: 1,
  initialCost: 30,
  maxCost: 30,
  maxLives: 2,
  totalWaves: 1,
  grid: [['path', 'path', 'path']],
  paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], lifeDamage: 1 }],
  timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
};

function simpleOnePathMap(enemyType = 'infantry') {
  return {
    version: '2.0',
    id: 'simple-one-path',
    name: 'Simple One Path',
    width: 3,
    height: 1,
    initialCost: 30,
    maxCost: 50,
    maxLives: 10,
    totalWaves: 1,
    grid: [['path', 'path', 'path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], color: '#f6c445' }],
    timeline: [{ wave: 1, startTime: 0, enemyType, count: 1, interval: 0.1, pathId: 'main' }]
  };
}

function waypointPauseMap() {
  return {
    version: '2.0',
    id: 'waypoint-pause',
    name: 'Waypoint Pause',
    width: 4,
    height: 1,
    initialCost: 30,
    maxCost: 30,
    maxLives: 10,
    totalWaves: 1,
    grid: [['path', 'path', 'path', 'path']],
    paths: [{
      id: 'main',
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }],
      color: '#f6c445',
      waypointActions: [{
        id: 'pause-node',
        pointIndex: 1,
        oncePerEnemy: true,
        actions: [{ type: 'pause', duration: 2 }]
      }]
    }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
}

function waypointDefenseMap() {
  return {
    ...waypointPauseMap(),
    id: 'waypoint-defense',
    name: 'Waypoint Defense',
    paths: [{
      id: 'main',
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }],
      color: '#f6c445',
      waypointActions: [{
        id: 'armor-node',
        pointIndex: 1,
        oncePerEnemy: true,
        actions: [{
          type: 'add_defense_module',
          module: { id: 'armor-plating', duration: 4, defenseDelta: 20, resistanceDelta: 15 }
        }]
      }]
    }]
  };
}

function simpleLeakMap() {
  return {
    version: '2.0',
    id: 'simple-leak',
    name: 'Simple Leak',
    width: 2,
    height: 1,
    initialCost: 30,
    maxCost: 30,
    maxLives: 10,
    totalWaves: 1,
    grid: [['path', 'path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], color: '#f6c445' }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'runner', count: 1, interval: 0.1, pathId: 'main' }]
  };
}

test('game can deploy, tick, and expose UI state', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  const deployed = game.deployOperator('vanguard', { x: 1, y: 0 });
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
  const vanguard = game.deployOperator('vanguard', { x: 2, y: 0 }).operator;
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

test('operator killed by enemy starts redeploy cooldown', () => {
  const operatorCatalog = {
    paper_vanguard: {
      ...DEFAULT_OPERATORS.vanguard,
      id: 'paper_vanguard',
      name: '纸面先锋',
      maxHp: 40,
      cost: 1,
      normalAttack: {
        interval: 10,
        range: { type: 'melee', radius: 0 },
        targeting: 'blocked-first',
        components: [],
        effects: []
      },
      attack: 0
    }
  };
  const game = new Game({
    map: {
      ...simpleOnePathMap('executioner'),
      redeployCooldownSeconds: 12,
      timeline: []
    },
    operatorCatalog,
    enemyCatalog: {
      executioner: {
        ...DEFAULT_ENEMIES.infantry,
        id: 'executioner',
        maxHp: 999,
        attack: 80,
        normalAttack: {
          interval: 1,
          range: { type: 'melee', radius: 0 },
          targeting: 'blocked-first',
          components: [{ type: 'physical', value: 80 }],
          effects: []
        }
      }
    }
  });
  const deployed = game.deployOperator('paper_vanguard', { x: 1, y: 0 });
  const enemy = new Enemy(game.enemyCatalog.executioner, { pathId: 'main' });
  game.placeEnemyAtPathDistance(enemy, 1);
  enemy.blockedBy = deployed.operator.id;
  deployed.operator.blockedEnemies = [enemy];
  game.enemies.push(enemy);

  game.start();
  game.tick(0.1);

  const state = game.getState();
  assert.equal(state.operators.length, 0);
  assert.equal(state.redeployCooldowns.paper_vanguard, 12);
  assert.equal(game.canDeploy('paper_vanguard', { x: 1, y: 0 }).ok, false);
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
  const deployed = game.deployOperator('vanguard', { x: 1, y: 0 });

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

test('active duration skill drains displayed sp ratio from full to empty', () => {
  const game = new Game({
    map: simpleOnePathMap(),
    operatorCatalog: {
      test_guard: {
        ...DEFAULT_OPERATORS.guard,
        id: 'test_guard',
        normalAttack: { interval: 1, range: { type: 'melee', radius: 0 }, targeting: 'blocked-first', components: [], effects: [] },
        skills: [{
          id: 'duration_skill',
          name: '持续技能',
          description: '测试持续时间。',
          triggerMode: 'manual',
          spCost: 1,
          duration: 4,
          type: 'buff',
          components: [],
          effects: [{ type: 'attack_multiplier', value: 2, duration: 4 }]
        }]
      }
    },
    enemyCatalog: DEFAULT_ENEMIES
  });
  game.deployOperator('test_guard', { x: 1, y: 0 });
  const operator = game.getState().operators[0];
  operator.skills[0].sp = 1;

  game.activateSkill(operator.id, 'duration_skill');
  game.start();
  game.tick(1);

  const skillModel = buildOperatorSpBarModel(game.getState().operators[0]);
  assert.equal(skillModel.visible, true);
  assert.equal(skillModel.ratio, 0.75);
});

test('enemy hp threshold skill fires once', () => {
  const enemyCatalog = {
    threshold_enemy: {
      ...DEFAULT_ENEMIES.infantry,
      id: 'threshold_enemy',
      maxHp: 100,
      normalAttack: { interval: 10, range: { type: 'melee', radius: 0 }, targeting: 'blocked-first', components: [], effects: [] },
      skills: [{
        id: 'panic_neural',
        name: '临界反击',
        description: '半血后释放神经冲击。',
        triggerMode: 'hp_threshold',
        hpThresholdPercent: 50,
        range: { type: 'diamond', radius: 3 },
        targeting: 'nearest',
        components: [{ type: 'neural', value: 40 }],
        effects: []
      }]
    }
  };
  const game = new Game({ map: simpleOnePathMap('threshold_enemy'), operatorCatalog: DEFAULT_OPERATORS, enemyCatalog });
  game.deployOperator('defender', { x: 1, y: 0 });
  game.start();
  game.tick(1);
  const enemy = game.enemies[0];
  enemy.hp = 50;

  game.tick(0.1);
  const operator = game.getState().operators[0];

  assert.equal(operator.neuralDamage, 40);
  game.tick(0.1);
  assert.equal(operator.neuralDamage, 40);
});

test('waypoint pause stops enemy movement and then resumes', () => {
  const game = new Game({
    map: waypointPauseMap(),
    operatorCatalog: DEFAULT_OPERATORS,
    enemyCatalog: DEFAULT_ENEMIES
  });
  game.start();
  game.tick(1.1);
  const enemy = game.enemies[0];
  const pausedDistance = enemy.pathDistance;

  game.tick(1);
  assert.equal(enemy.pathDistance, pausedDistance);
  game.tick(2);
  assert.ok(enemy.pathDistance > pausedDistance);
});

test('waypoint defense module attaches to enemy until expiry', () => {
  const game = new Game({
    map: waypointDefenseMap(),
    operatorCatalog: DEFAULT_OPERATORS,
    enemyCatalog: DEFAULT_ENEMIES
  });
  game.start();
  game.tick(1.1);
  const enemy = game.enemies[0];

  assert.ok(enemy.defenseModules.length > 0);
  game.tick(4.1);
  assert.equal(enemy.defenseModules.length, 0);
});

test('enemy leak deducts enemy life value', () => {
  const game = new Game({
    map: simpleLeakMap(),
    operatorCatalog: DEFAULT_OPERATORS,
    enemyCatalog: {
      runner: { ...DEFAULT_ENEMIES.infantry, id: 'runner', speed: 10, lifeValue: 8 }
    }
  });
  game.start();
  game.tick(2);
  assert.equal(game.getState().lives, game.getState().maxLives - 8);
});

test('game releases defender skill with self heal and active duration', () => {
  const skillMap = {
    ...map,
    initialCost: 14,
    maxCost: 50,
    timeline: [{ wave: 1, startTime: 999, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const game = new Game({ map: skillMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const deployed = game.deployOperator('defender', { x: 1, y: 0 });
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
    width: 4,
    height: 1,
    initialCost: 20,
    maxCost: 50,
    maxLives: 2,
    totalWaves: 1,
    grid: [['path', 'path', 'high', 'path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 3, y: 0 }], lifeDamage: 1 }],
    timeline: [{ wave: 1, startTime: 999, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const game = new Game({ map: skillMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const vanguard = game.deployOperator('vanguard', { x: 1, y: 0 }).operator;
  const medic = game.deployOperator('medic', { x: 2, y: 0 }).operator;

  game.start();
  game.tick(14);
  vanguard.hp = 40;
  const result = game.activateSkill(medic.id);

  assert.equal(result.ok, true);
  assert.equal(vanguard.hp, 120);
});

test('heal components restore allies and emit heal effects', () => {
  const healMap = {
    version: '2.0',
    id: 'heal-component-test',
    name: 'Heal Component Test',
    width: 4,
    height: 1,
    initialCost: 30,
    maxCost: 50,
    maxLives: 2,
    totalWaves: 1,
    grid: [['path', 'path', 'high', 'path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 3, y: 0 }], lifeDamage: 1 }],
    timeline: [{ wave: 1, startTime: 999, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const operatorCatalog = {
    ...DEFAULT_OPERATORS,
    component_medic: {
      ...DEFAULT_OPERATORS.medic,
      id: 'component_medic',
      cost: 1,
      attack: 40,
      damageType: 'heal',
      normalAttack: {
        interval: 1,
        range: { type: 'diamond', radius: 2 },
        targeting: 'lowest-hp-percent',
        components: [{ type: 'heal', value: 40 }],
        effects: []
      }
    }
  };
  const game = new Game({ map: healMap, operatorCatalog, enemyCatalog: DEFAULT_ENEMIES });
  const vanguard = game.deployOperator('vanguard', { x: 1, y: 0 }).operator;
  game.deployOperator('component_medic', { x: 2, y: 0 });
  vanguard.hp = 40;

  game.start();
  game.tick(1.1);

  assert.equal(vanguard.hp, 80);
  assert.equal(game.getState().effects.some((effect) => effect.type === 'operator_heal'), true);
});

test('operator skill damage components hit enemies in skill range', () => {
  const skillMap = {
    version: '2.0',
    id: 'skill-component-damage-test',
    name: 'Skill Component Damage Test',
    width: 3,
    height: 2,
    initialCost: 20,
    maxCost: 50,
    maxLives: 2,
    totalWaves: 1,
    grid: [
      ['path', 'path', 'path'],
      ['wall', 'high', 'wall']
    ],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], lifeDamage: 1 }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'stationary', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const operatorCatalog = {
    component_caster: {
      ...DEFAULT_OPERATORS.caster,
      id: 'component_caster',
      cost: 0,
      attack: 0,
      normalAttack: {
        interval: 99,
        range: { type: 'diamond', radius: 2 },
        targeting: 'exit-first',
        components: [],
        effects: []
      },
      skill: null,
      skills: [{
        id: 'component_burst',
        name: '组件爆破',
        description: '使用技能组件造成混合伤害。',
        spCost: 1,
        triggerMode: 'manual',
        type: 'buff',
        duration: 0,
        range: { type: 'diamond', radius: 3 },
        components: [
          { type: 'physical', value: 50 },
          { type: 'arts', value: 20 }
        ],
        effects: []
      }]
    }
  };
  const enemyCatalog = {
    stationary: {
      ...DEFAULT_ENEMIES.infantry,
      id: 'stationary',
      maxHp: 100,
      defense: 5,
      resistance: 0,
      speed: 0,
      normalAttack: {
        interval: 99,
        range: { type: 'melee', radius: 0 },
        targeting: 'blocked-first',
        components: [],
        effects: []
      }
    }
  };
  const game = new Game({ map: skillMap, operatorCatalog, enemyCatalog });
  const caster = game.deployOperator('component_caster', { x: 1, y: 1 }).operator;

  game.start();
  game.tick(1.1);
  const result = game.activateSkill(caster.id, 'component_burst');

  assert.equal(result.ok, true);
  assert.equal(game.enemies[0].hp, 35);
  assert.equal(game.getState().effects.some((effect) => effect.type === 'operator_attack'), true);
});

test('duration skill components wait for normal attacks instead of applying on release', () => {
  const skillMap = {
    version: '2.0',
    id: 'duration-component-test',
    name: 'Duration Component Test',
    width: 3,
    height: 2,
    initialCost: 20,
    maxCost: 50,
    maxLives: 2,
    totalWaves: 1,
    grid: [
      ['path', 'path', 'path'],
      ['wall', 'high', 'wall']
    ],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], lifeDamage: 1 }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'stationary', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const operatorCatalog = {
    component_sniper: {
      ...DEFAULT_OPERATORS.sniper,
      id: 'component_sniper',
      cost: 0,
      attack: 0,
      normalAttack: {
        interval: 1,
        range: { type: 'diamond', radius: 3 },
        targeting: 'exit-first',
        components: [{ id: 'base-hit', type: 'physical', value: 20 }],
        effects: []
      },
      skill: null,
      skills: [{
        id: 'duration_components',
        name: '持续组件',
        spCost: 1,
        triggerMode: 'manual',
        type: 'buff',
        duration: 5,
        range: { type: 'diamond', radius: 3 },
        components: [{ id: 'skill-hit', type: 'arts', value: 30 }],
        effects: []
      }]
    }
  };
  const enemyCatalog = {
    stationary: {
      ...DEFAULT_ENEMIES.infantry,
      id: 'stationary',
      maxHp: 100,
      defense: 0,
      resistance: 0,
      speed: 0,
      normalAttack: { interval: 99, range: { type: 'melee', radius: 0 }, targeting: 'blocked-first', components: [], effects: [] }
    }
  };
  const game = new Game({ map: skillMap, operatorCatalog, enemyCatalog });
  const sniper = game.deployOperator('component_sniper', { x: 1, y: 1 }).operator;
  game.start();
  game.tick(1.1);

  const result = game.activateSkill(sniper.id, 'duration_components');

  assert.equal(result.ok, true);
  assert.equal(game.enemies[0].hp, 80);
  game.tick(1.1);
  assert.equal(game.enemies[0].hp, 30);
});

test('ammo skill components trigger only on attacks and stop after charges are spent', () => {
  const skillMap = {
    version: '2.0',
    id: 'ammo-skill-test',
    name: 'Ammo Skill Test',
    width: 3,
    height: 2,
    initialCost: 20,
    maxCost: 50,
    maxLives: 2,
    totalWaves: 1,
    grid: [
      ['path', 'path', 'path'],
      ['wall', 'high', 'wall']
    ],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], lifeDamage: 1 }],
    timeline: [{ wave: 1, startTime: 999, enemyType: 'stationary', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const operatorCatalog = {
    ammo_sniper: {
      ...DEFAULT_OPERATORS.sniper,
      id: 'ammo_sniper',
      cost: 0,
      attack: 0,
      normalAttack: {
        interval: 1,
        range: { type: 'diamond', radius: 3 },
        targeting: 'exit-first',
        components: [{ id: 'base-hit', type: 'physical', value: 10 }],
        effects: []
      },
      skill: null,
      skills: [{
        id: 'loaded_rounds',
        name: '装填弹药',
        description: '接下来两次攻击追加法术伤害。',
        spCost: 1,
        triggerMode: 'manual',
        type: 'buff',
        ammo: 2,
        components: [{ type: 'arts', value: 30 }],
        effects: []
      }]
    }
  };
  const enemyCatalog = {
    stationary: {
      ...DEFAULT_ENEMIES.infantry,
      id: 'stationary',
      maxHp: 200,
      defense: 0,
      resistance: 0,
      speed: 0,
      normalAttack: { interval: 99, range: { type: 'melee', radius: 0 }, targeting: 'blocked-first', components: [], effects: [] }
    }
  };
  const game = new Game({ map: skillMap, operatorCatalog, enemyCatalog });
  const sniper = game.deployOperator('ammo_sniper', { x: 1, y: 1 }).operator;
  game.start();
  game.tick(1.1);

  const result = game.activateSkill(sniper.id, 'loaded_rounds');

  assert.equal(result.ok, true);
  assert.equal(sniper.skills[0].ammoRemaining, 2);
  game.tick(1.1);
  assert.equal(sniper.skills[0].ammoRemaining, 2);

  const enemy = new Enemy(enemyCatalog.stationary, { pathId: 'main' });
  game.placeEnemyAtPathDistance(enemy, 1);
  game.enemies.push(enemy);

  game.tick(1.1);
  assert.equal(enemy.hp, 160);
  assert.equal(sniper.skills[0].ammoRemaining, 1);
  game.tick(1.1);
  assert.equal(enemy.hp, 120);
  assert.equal(sniper.skills[0].ammoRemaining, 0);
  game.tick(1.1);
  assert.equal(enemy.hp, 110);
});

test('duration skills can temporarily change max hp defense resistance and block', () => {
  const game = new Game({
    map: {
      ...map,
      timeline: [{ wave: 1, startTime: 999, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }],
      initialCost: 30,
      maxCost: 50
    },
    operatorCatalog: {
      stat_guard: {
        ...DEFAULT_OPERATORS.guard,
        id: 'stat_guard',
        cost: 0,
        skills: [{
          id: 'stat_up',
          name: '体能强化',
          spCost: 1,
          triggerMode: 'manual',
          type: 'buff',
          duration: 2,
          effect: {
            maxHpDelta: 50,
            defenseDelta: 20,
            resistanceDelta: 15,
            blockDelta: 1
          },
          components: [],
          effects: []
        }]
      }
    },
    enemyCatalog: DEFAULT_ENEMIES
  });
  const guard = game.deployOperator('stat_guard', { x: 1, y: 0 }).operator;
  game.start();
  game.tick(1.1);

  const result = game.activateSkill(guard.id, 'stat_up');

  assert.equal(result.ok, true);
  assert.equal(guard.maxHp, DEFAULT_OPERATORS.guard.maxHp + 50);
  assert.equal(guard.hp, DEFAULT_OPERATORS.guard.maxHp + 50);
  assert.equal(guard.defense, DEFAULT_OPERATORS.guard.defense + 20);
  assert.equal(guard.resistance, DEFAULT_OPERATORS.guard.resistance + 15);
  assert.equal(guard.block, DEFAULT_OPERATORS.guard.block + 1);
  game.tick(2.1);
  assert.equal(guard.maxHp, DEFAULT_OPERATORS.guard.maxHp);
  assert.equal(guard.defense, DEFAULT_OPERATORS.guard.defense);
  assert.equal(guard.resistance, DEFAULT_OPERATORS.guard.resistance);
  assert.equal(guard.block, DEFAULT_OPERATORS.guard.block);
});

test('operator skill heal components restore allies and emit heal effects', () => {
  const skillMap = {
    version: '2.0',
    id: 'skill-component-heal-test',
    name: 'Skill Component Heal Test',
    width: 3,
    height: 2,
    initialCost: 20,
    maxCost: 50,
    maxLives: 2,
    totalWaves: 1,
    grid: [
      ['path', 'path', 'path'],
      ['wall', 'high', 'wall']
    ],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], lifeDamage: 1 }],
    timeline: [{ wave: 1, startTime: 999, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const operatorCatalog = {
    ...DEFAULT_OPERATORS,
    component_healer: {
      ...DEFAULT_OPERATORS.medic,
      id: 'component_healer',
      cost: 0,
      attack: 0,
      normalAttack: {
        interval: 99,
        range: { type: 'diamond', radius: 2 },
        targeting: 'lowest-hp-percent',
        components: [],
        effects: []
      },
      skill: null,
      skills: [{
        id: 'component_heal',
        name: '组件治疗',
        description: '使用技能组件治疗友方。',
        spCost: 1,
        triggerMode: 'manual',
        type: 'buff',
        duration: 0,
        range: { type: 'diamond', radius: 2 },
        components: [{ type: 'heal', value: 45 }],
        effects: []
      }]
    }
  };
  const game = new Game({ map: skillMap, operatorCatalog, enemyCatalog: DEFAULT_ENEMIES });
  const vanguard = game.deployOperator('vanguard', { x: 1, y: 0 }).operator;
  const healer = game.deployOperator('component_healer', { x: 1, y: 1 }).operator;
  vanguard.hp = 20;

  game.start();
  game.tick(1.1);
  const result = game.activateSkill(healer.id, 'component_heal');

  assert.equal(result.ok, true);
  assert.equal(vanguard.hp, 65);
  assert.equal(game.getState().effects.some((effect) => effect.type === 'operator_heal'), true);
});

test('medics passively regenerate their own hp', () => {
  const healMap = {
    version: '2.0',
    id: 'medic-self-regen-test',
    name: 'Medic Self Regen Test',
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
  const game = new Game({ map: healMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const medic = game.deployOperator('medic', { x: 1, y: 0 }).operator;
  medic.hp = 100;

  game.start();
  game.tick(1);

  assert.equal(medic.hp > 100, true);
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

  const deployed = game.deployOperator('vanguard', { x: 1, y: 0 }, 'left');

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

  const deployed = game.deployOperator('auto-guard', { x: 1, y: 0 });
  game.start();
  game.tick(1.1);

  assert.equal(deployed.operator.skills[0].sp, 0);
  assert.equal(game.getState().cost, 6);
});

test('inspecting a placed operator lowers speed and clearing inspection restores it', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const deployed = game.deployOperator('vanguard', { x: 1, y: 0 });
  game.setSpeed(3);

  game.selectPlacedOperator(deployed.operator.id);
  assert.equal(game.getState().speed, 0.5);

  game.clearSelection();
  assert.equal(game.getState().speed, 3);
});

test('restarting while inspecting restores the previous battle speed', () => {
  const game = new Game({ map, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  const deployed = game.deployOperator('vanguard', { x: 1, y: 0 });
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
  const guard = game.deployOperator('rewardGuard', { x: 1, y: 0 }).operator;
  game.placeEnemyAtPathDistance(enemy, 1);
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
  const guard = game.deployOperator('guard', { x: 1, y: 0 }).operator;
  const enemy = new Enemy({ ...DEFAULT_ENEMIES.infantry, maxHp: 1 }, { pathId: 'main' });
  enemy.cell = { x: 1, y: 0 };
  enemy.x = 1;
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

test('game emits floating text and boss bar effects for hp changes and boss phases', () => {
  const bossMap = {
    version: '2.0',
    id: 'boss-effects',
    name: 'Boss Effects',
    width: 3,
    height: 2,
    initialCost: 30,
    maxCost: 50,
    maxLives: 2,
    totalWaves: 1,
    grid: [
      ['path', 'path', 'path'],
      ['wall', 'high', 'wall']
    ],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], lifeDamage: 1 }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'boss-test', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const operatorCatalog = {
    boss_sniper: {
      ...DEFAULT_OPERATORS.sniper,
      id: 'boss_sniper',
      cost: 0,
      attack: 0,
      normalAttack: {
        interval: 0.1,
        range: { type: 'diamond', radius: 3 },
        targeting: 'exit-first',
        components: [{ id: 'base-hit', type: 'physical', value: 30 }],
        effects: []
      }
    }
  };
  const enemyCatalog = {
    'boss-test': {
      ...DEFAULT_ENEMIES.infantry,
      id: 'boss-test',
      name: '测试 Boss',
      boss: true,
      maxHp: 30,
      defense: 0,
      resistance: 0,
      speed: 0,
      phases: [
        {
          name: '阶段一',
          maxHp: 30,
          defense: 0,
          speed: 0,
          normalAttack: { interval: 99, range: { type: 'melee', radius: 0 }, targeting: 'blocked-first', components: [], effects: [] }
        },
        {
          name: '阶段二',
          maxHp: 40,
          defense: 0,
          speed: 0,
          normalAttack: { interval: 99, range: { type: 'melee', radius: 0 }, targeting: 'blocked-first', components: [], effects: [] }
        }
      ],
      normalAttack: { interval: 99, range: { type: 'melee', radius: 0 }, targeting: 'blocked-first', components: [], effects: [] }
    }
  };
  const game = new Game({ map: bossMap, operatorCatalog, enemyCatalog });
  game.deployOperator('boss_sniper', { x: 1, y: 1 });

  game.start();
  game.tick(0.2);

  const effects = game.getState().effects;
  assert.equal(effects.some((effect) => effect.type === 'boss_bar' && effect.payload.kind === 'enter'), true);
  assert.equal(effects.some((effect) => effect.type === 'floating_text' && effect.payload.amount < 0), true);
  assert.equal(effects.some((effect) => effect.type === 'boss_bar' && effect.payload.kind === 'phase_refill'), true);
});

test('game offsets simultaneous floating texts for the same target', () => {
  const game = new Game({
    map: { ...map, timeline: [] },
    operatorCatalog: DEFAULT_OPERATORS,
    enemyCatalog: DEFAULT_ENEMIES
  });
  const target = {
    id: 'operator-1',
    cell: { x: 1, y: 0 }
  };

  game.addFloatingText(target, -20, 'damage');
  game.addFloatingText(target, 15, 'heal');
  game.addFloatingText(target, 40, 'neural');

  const stackIndexes = game.getState().effects
    .filter((effect) => effect.type === 'floating_text')
    .map((effect) => effect.payload.stackIndex);

  assert.deepEqual(stackIndexes, [0, 1, 2]);
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
  const limitedMap = {
    ...map,
    width: 4,
    grid: [['path', 'path', 'path', 'path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 3, y: 0 }], lifeDamage: 1 }],
    deployLimit: 1,
    initialCost: 30
  };
  const game = new Game({ map: limitedMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  assert.equal(game.deployOperator('vanguard', { x: 1, y: 0 }).ok, true);
  assert.equal(game.canDeploy('guard', { x: 2, y: 0 }).ok, false);
  assert.match(game.canDeploy('guard', { x: 2, y: 0 }).reason, /Total deploy limit/);
  assert.equal(game.getState().deployLimit, 1);
});

test('game queues enemy intel once per enemy type', () => {
  const intelMap = {
    ...map,
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 2, interval: 0.1, pathId: 'main' }]
  };
  const game = new Game({ map: intelMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  game.start();
  game.tick(0.2);

  const state = game.getState();
  assert.equal(state.enemyIntelQueue.length, 1);
  assert.equal(state.enemyIntelQueue[0].id, 'infantry');
});

test('game auto-dismisses enemy intel after the configured display time', () => {
  const intelMap = {
    ...map,
    id: 'intel-auto-dismiss',
    width: 5,
    grid: [['path', 'path', 'path', 'path', 'path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], lifeDamage: 1 }],
    enemyIntelDisplaySeconds: 2,
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' }]
  };
  const game = new Game({ map: intelMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });

  game.start();
  game.tick(0);
  assert.equal(game.getState().enemyIntelQueue.length, 1);

  game.tick(1.9);
  assert.equal(game.getState().enemyIntelQueue.length, 1);

  game.tick(0.2);
  assert.equal(game.getState().enemyIntelQueue.length, 0);

  game.restart();
  game.start();
  game.tick(0);
  assert.deepEqual(game.getState().enemyIntelQueue.map((enemy) => enemy.id), ['infantry']);
});

test('game queues enemy intel in spawn order and keeps snapshots isolated', () => {
  const enemyCatalog = {
    infantry: { ...DEFAULT_ENEMIES.infantry },
    heavy: { ...DEFAULT_ENEMIES.heavy }
  };
  const intelMap = {
    ...map,
    timeline: [
      { wave: 1, startTime: 0, enemyType: 'infantry', count: 1, interval: 0.1, pathId: 'main' },
      { wave: 1, startTime: 0.1, enemyType: 'heavy', count: 1, interval: 0.1, pathId: 'main' }
    ]
  };
  const game = new Game({ map: intelMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog });

  game.start();
  game.tick(0.2);

  assert.deepEqual(game.getState().enemyIntelQueue.map((enemy) => enemy.id), ['infantry', 'heavy']);

  game.dismissEnemyIntel('infantry');
  const afterDismiss = game.getState();
  assert.deepEqual(afterDismiss.enemyIntelQueue.map((enemy) => enemy.id), ['heavy']);

  const queuedHeavyName = afterDismiss.enemyIntelQueue[0].name;
  afterDismiss.enemyIntelQueue[0].name = 'state-mutated-name';
  assert.equal(game.getState().enemyIntelQueue[0].name, queuedHeavyName);

  enemyCatalog.heavy.name = 'catalog-mutated-name';
  assert.equal(game.getState().enemyIntelQueue[0].name, queuedHeavyName);

  game.restart();
  game.start();
  game.tick(0);

  assert.deepEqual(game.getState().enemyIntelQueue.map((enemy) => enemy.id), ['infantry']);
});
