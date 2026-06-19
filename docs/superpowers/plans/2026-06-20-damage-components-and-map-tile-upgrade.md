# Damage Components And Map Tile Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single attack/damage-type combat model with component damage, add enemy skills, waypoint actions, tile deployability, neural damage feedback, and three experimental maps.

**Architecture:** Normalize all old catalog/map data at load boundaries, then make runtime systems read only the new model: `normalAttack`, `skills`, `components`, `tileMeta`, and `waypointActions`. Keep deterministic behavior in pure systems (`DamageSystem`, validators, map/editor models) and keep DOM/Canvas layers as adapters over those models.

**Tech Stack:** HTML5 Canvas, CSS3, JavaScript ES Modules, Vite, Node `node:test`, browser `localStorage`.

---

## File Structure

- Create `src/systems/DamageSystem.js`: damage components, resistance scaling, neural accumulation, active module stat helpers.
- Modify `src/data/CatalogValidators.js`: normalize new operator/enemy schema, migrate legacy `attack/damageType/range/skills`.
- Modify `src/data/CatalogStore.js`: keep existing localStorage behavior but rely on new validators for migration.
- Modify `src/data/defaultOperators.js`: convert default operators to `normalAttack`, `effects`, component skills, resistance `0..100`.
- Modify `src/data/defaultEnemies.js`: convert default enemies to `normalAttack`, `lifeValue`, `blockBypass`, component skills, resistance `0..100`.
- Modify `src/entities/Operator.js`: store `normalAttack`, `skills`, `neuralDamage`, `neuralThreshold`, active skill state.
- Modify `src/entities/Enemy.js`: store `normalAttack`, `skills`, `lifeValue`, modules, waypoint triggers, pause state.
- Modify `src/systems/CombatSystem.js`: select targets from `normalAttack` and modules; apply components through `DamageSystem`.
- Modify `src/systems/SkillSystem.js`: unified skill effects, active SP drain, enemy HP-threshold skills.
- Modify `src/core/Game.js`: call enemy skills, waypoint actions, module ticking, `lifeValue` leak logic.
- Modify `src/data/MapLoader.js`: validate and normalize `tileMeta` and `waypointActions`.
- Modify `src/systems/DeploymentSystem.js`: reject entry/exit and `tileMeta.deployable === false`.
- Modify `src/editor/EditorModel.js`: edit/export `tileMeta` and waypoint actions.
- Modify `src/editor/EditorController.js`: controls for deployability and waypoint action editing.
- Modify `src/editor/EditorRenderer.js`: entry/exit/forbidden/waypoint markers.
- Modify `src/custom-editor/CustomEditorModel.js`: edit component arrays, normal attacks, enemy skills, `lifeValue`, `blockBypass`.
- Modify `src/custom-editor/CustomEditorController.js`: form controls and range targets for operator/enemy normal attacks and skills.
- Modify `src/renderers/CanvasRenderer.js`: neural bars, SP active drain, tile overlays, waypoint/pause markers.
- Modify `src/ui/OperatorViewModels.js` and `src/ui/UIController.js`: active SP ratios, enemy intel component summaries.
- Modify `src/main.js`: register three experimental maps after existing defaults.
- Create `maps/neural-damage-lab.json`, `maps/restricted-entry-test.json`, `maps/high-value-breakthrough.json`.
- Tests: update existing tests and add `tests/damage-system.test.js`.

## Task 1: Damage System And Catalog Migration

**Files:**
- Create: `src/systems/DamageSystem.js`
- Modify: `src/data/CatalogValidators.js`
- Modify: `src/data/defaultOperators.js`
- Modify: `src/data/defaultEnemies.js`
- Test: `tests/damage-system.test.js`
- Test: `tests/catalog-store.test.js`
- Test: `tests/custom-editor-model.test.js`

- [ ] **Step 1: Write failing damage system tests**

Create `tests/damage-system.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDamageComponents,
  calculateComponentDamage,
  effectiveDefense,
  effectiveResistance,
  normalizeDamageComponent
} from '../src/systems/DamageSystem.js';

test('physical damage subtracts defense without chip damage', () => {
  assert.equal(calculateComponentDamage({ type: 'physical', value: 80 }, { defense: 25, resistance: 0 }), 55);
  assert.equal(calculateComponentDamage({ type: 'physical', value: 20 }, { defense: 25, resistance: 0 }), 0);
});

test('arts damage uses resistance from 0 to 100', () => {
  assert.equal(calculateComponentDamage({ type: 'arts', value: 80 }, { defense: 0, resistance: 25 }), 60);
  assert.equal(calculateComponentDamage({ type: 'arts', value: 80 }, { defense: 0, resistance: 100 }), 0);
});

test('multiple damage components apply independently', () => {
  const target = { hp: 200, maxHp: 200, defense: 20, resistance: 50, neuralDamage: 0, neuralThreshold: 100 };
  const result = applyDamageComponents([
    { type: 'physical', value: 70 },
    { type: 'arts', value: 60 }
  ], target);

  assert.equal(result.hpDamage, 80);
  assert.equal(target.hp, 120);
});

test('neural damage fills and bursts operator neural bar', () => {
  const target = { hp: 200, maxHp: 200, defense: 0, resistance: 0, neuralDamage: 70, neuralThreshold: 100 };
  const result = applyDamageComponents([{ type: 'neural', value: 40 }], target);

  assert.equal(result.neuralBurstDamage, 50);
  assert.equal(target.neuralDamage, 0);
  assert.equal(target.hp, 150);
});

test('defense modules affect physical and arts mitigation', () => {
  const target = {
    defense: 10,
    resistance: 20,
    defenseModules: [{ defenseDelta: 15, resistanceDelta: 30, remaining: 5 }]
  };

  assert.equal(effectiveDefense(target), 25);
  assert.equal(effectiveResistance(target), 50);
});

test('damage components validate supported types and values', () => {
  assert.deepEqual(normalizeDamageComponent({ type: 'arts', value: '12' }), { type: 'arts', value: 12 });
  assert.throws(() => normalizeDamageComponent({ type: 'true-damage', value: 10 }), /damage component type/);
});
```

- [ ] **Step 2: Run red test**

Run:

```bash
npm test -- tests/damage-system.test.js
```

Expected: FAIL because `src/systems/DamageSystem.js` does not exist.

- [ ] **Step 3: Implement `DamageSystem`**

Create `src/systems/DamageSystem.js` with these exports:

```js
const DAMAGE_TYPES = new Set(['physical', 'arts', 'neural']);
const NEURAL_BURST_HP_RATIO = 0.25;

export function normalizeDamageComponent(component) {
  if (!DAMAGE_TYPES.has(component?.type)) {
    throw new Error('damage component type must be physical, arts, or neural');
  }
  const value = Number(component.value);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('damage component value must be a non-negative number');
  }
  return { type: component.type, value };
}

export function effectiveDefense(target) {
  const base = Number(target?.defense ?? 0);
  const bonus = (target?.defenseModules ?? []).reduce((sum, module) => sum + Number(module.defenseDelta ?? 0), 0);
  return Math.max(0, Math.round(base + bonus));
}

export function effectiveResistance(target) {
  const base = Number(target?.resistance ?? 0);
  const bonus = (target?.defenseModules ?? []).reduce((sum, module) => sum + Number(module.resistanceDelta ?? 0), 0);
  return Math.max(0, Math.min(100, base + bonus));
}

export function calculateComponentDamage(component, target) {
  const normalized = normalizeDamageComponent(component);
  if (normalized.type === 'physical') {
    return Math.max(0, Math.round(normalized.value - effectiveDefense(target)));
  }
  if (normalized.type === 'arts') {
    return Math.max(0, Math.round(normalized.value * (1 - effectiveResistance(target) / 100)));
  }
  return 0;
}

export function applyDamageComponents(components, target) {
  const result = { hpDamage: 0, neuralDamage: 0, neuralBurstDamage: 0 };
  components.map(normalizeDamageComponent).forEach((component) => {
    if (component.type === 'neural') {
      result.neuralDamage += component.value;
      applyNeuralDamage(target, component.value, result);
      return;
    }
    const damage = calculateComponentDamage(component, target);
    result.hpDamage += damage;
    target.hp = Math.max(0, target.hp - damage);
  });
  return result;
}

function applyNeuralDamage(target, value, result) {
  if (!Number.isFinite(target?.neuralThreshold) || target.neuralThreshold <= 0) {
    return;
  }
  target.neuralDamage = Math.max(0, Number(target.neuralDamage ?? 0) + value);
  if (target.neuralDamage < target.neuralThreshold) {
    return;
  }
  target.neuralDamage = 0;
  const burst = Math.round(target.maxHp * NEURAL_BURST_HP_RATIO);
  result.neuralBurstDamage += burst;
  target.hp = Math.max(0, target.hp - burst);
}
```

- [ ] **Step 4: Run green test**

Run:

```bash
npm test -- tests/damage-system.test.js
```

Expected: PASS.

- [ ] **Step 5: Write failing catalog migration tests**

Add to `tests/catalog-store.test.js`:

```js
import { normalizeEnemyTemplate, normalizeOperatorTemplate } from '../src/data/CatalogValidators.js';

test('operator validator migrates legacy attack fields into normalAttack', () => {
  const operator = normalizeOperatorTemplate({
    id: 'legacy-caster',
    name: 'Legacy Caster',
    class: 'caster',
    className: '术士',
    deployType: 'high',
    cost: 16,
    maxHp: 120,
    attack: 50,
    defense: 0,
    resistance: 0.1,
    attackInterval: 2,
    block: 0,
    damageType: 'arts',
    range: { type: 'diamond', radius: 2 },
    targeting: 'high-defense',
    trait: 'legacy',
    skills: [],
    color: '#ffffff'
  });

  assert.equal(operator.resistance, 10);
  assert.deepEqual(operator.normalAttack.components, [{ type: 'arts', value: 50 }]);
  assert.equal(operator.normalAttack.interval, 2);
});

test('enemy validator migrates legacy attack fields and defaults life value', () => {
  const enemy = normalizeEnemyTemplate({
    id: 'legacy-heavy',
    name: 'Legacy Heavy',
    maxHp: 180,
    attack: 30,
    defense: 12,
    resistance: 0.2,
    speed: 0.8,
    attackInterval: 1.8,
    canBeBlocked: true,
    isFlying: false,
    rewardCost: 5,
    damageType: 'physical',
    targeting: 'blocked-first',
    range: { type: 'melee', radius: 0 },
    color: '#ff0000'
  });

  assert.equal(enemy.resistance, 20);
  assert.equal(enemy.lifeValue, 1);
  assert.deepEqual(enemy.normalAttack.components, [{ type: 'physical', value: 30 }]);
});
```

- [ ] **Step 6: Run red catalog tests**

Run:

```bash
npm test -- tests/catalog-store.test.js
```

Expected: FAIL because validators still return legacy attack fields and resistance `0..0.95`.

- [ ] **Step 7: Update `CatalogValidators`**

Modify `src/data/CatalogValidators.js`:

- Add `DAMAGE_COMPONENT_TYPES`, `normalizeDamageComponents()`, `normalizeResistance()`, `normalizeNormalAttack()`, and `normalizeEffects()`.
- `normalizeOperatorTemplate()` should return `normalAttack` and `effects`.
- `normalizeEnemyTemplate()` should return `normalAttack`, `lifeValue`, `skills`.
- Legacy `skill.type` values should migrate into `effects` and optional `components`.

Required helper signatures:

```js
function normalizeResistance(value) {
  const number = numberInRange(value ?? 0, 0, 100, 'resistance');
  return number > 0 && number <= 1 ? Math.round(number * 100) : number;
}

function normalizeDamageComponents(components, fallback = []) {
  const source = Array.isArray(components) ? components : fallback;
  return source.map((component) => ({
    type: oneOf(component?.type, DAMAGE_COMPONENT_TYPES, 'damage component type'),
    value: numberInRange(component?.value, 0, 999999, 'damage component value')
  }));
}
```

- [ ] **Step 8: Convert default catalogs**

Modify `src/data/defaultOperators.js` and `src/data/defaultEnemies.js` so defaults are authored in the new structure. Example for sniper:

```js
normalAttack: {
  interval: 0.8,
  range: { type: 'diamond', radius: 3 },
  targeting: 'flying-first',
  components: [{ type: 'physical', value: 28 }]
},
effects: []
```

Keep legacy-looking values only where migration tests need them, not in defaults.

- [ ] **Step 9: Run catalog tests**

Run:

```bash
npm test -- tests/catalog-store.test.js tests/custom-editor-model.test.js
```

Expected: PASS after any custom editor assumptions are updated to the new normalized shape.

- [ ] **Step 10: Commit**

Run:

```bash
git add src/systems/DamageSystem.js src/data/CatalogValidators.js src/data/defaultOperators.js src/data/defaultEnemies.js tests/damage-system.test.js tests/catalog-store.test.js tests/custom-editor-model.test.js
git commit -m "feat: add damage components and catalog migration"
```

## Task 2: Runtime Entities And Combat Components

**Files:**
- Modify: `src/entities/Operator.js`
- Modify: `src/entities/Enemy.js`
- Modify: `src/systems/CombatSystem.js`
- Modify: `src/systems/BlockingSystem.js`
- Test: `tests/combat-flow.test.js`

- [ ] **Step 1: Write failing combat tests**

Add to `tests/combat-flow.test.js`:

```js
test('operator normal attack applies physical and arts components', () => {
  const operator = new Operator({
    ...DEFAULT_OPERATORS.sniper,
    id: 'component-sniper',
    normalAttack: {
      interval: 0.1,
      range: { type: 'diamond', radius: 3 },
      targeting: 'exit-first',
      components: [
        { type: 'physical', value: 50 },
        { type: 'arts', value: 40 }
      ]
    }
  }, { x: 0, y: 0 });
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.heavy,
    id: 'component-target',
    maxHp: 200,
    defense: 20,
    resistance: 50
  }, { pathId: 'main' });
  enemy.cell = { x: 1, y: 0 };
  enemy.pathDistance = 1;

  createCombatSystem().tick(0.2, { operators: [operator], enemies: [enemy] });

  assert.equal(enemy.hp, 150);
});

test('enemy ranged normal attack applies neural component to operator', () => {
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.infantry,
    id: 'neural-ranged',
    normalAttack: {
      interval: 0.1,
      range: { type: 'diamond', radius: 2 },
      targeting: 'nearest',
      components: [{ type: 'neural', value: 60 }]
    }
  }, { pathId: 'main' });
  const operator = new Operator(DEFAULT_OPERATORS.defender, { x: 1, y: 0 });
  enemy.cell = { x: 0, y: 0 };

  createCombatSystem().tick(0.2, { operators: [operator], enemies: [enemy] });

  assert.equal(operator.neuralDamage, 60);
  assert.equal(operator.hp, operator.maxHp);
});
```

- [ ] **Step 2: Run red combat tests**

Run:

```bash
npm test -- tests/combat-flow.test.js
```

Expected: FAIL because combat still reads `attack`, `damageType`, and `attackInterval`.

- [ ] **Step 3: Update runtime entities**

Modify `src/entities/Operator.js`:

- Store `this.normalAttack = structuredClone(template.normalAttack)`.
- Set `this.attackTimer = this.normalAttack.interval`.
- Add `this.effects = structuredClone(template.effects ?? [])`.
- Add `this.neuralDamage = 0` and `this.neuralThreshold = template.neuralThreshold ?? 100`.
- Keep `this.attack`, `this.attackInterval`, `this.damageType`, and `this.range` only if tests still need compatibility; combat should stop reading them.

Modify `src/entities/Enemy.js`:

- Store `this.normalAttack`, `this.lifeValue`, `this.skills`, `this.attackModules`, `this.defenseModules`.
- Set `this.attackTimer = this.normalAttack.interval`.
- Reset modules on phase advance unless a module has `preserveAcrossPhase === true`.
- Apply phase overrides for `normalAttack`, `skills`, `lifeValue`, and `blockBypass`.

- [ ] **Step 4: Update `CombatSystem` to use `DamageSystem`**

Modify `src/systems/CombatSystem.js`:

- Replace `calculateDamage()` and `calculateEnemyDamage()` internals with `applyDamageComponents()`.
- Target range should read `unit.normalAttack.range`.
- Attack interval should read `getEffectiveAttackInterval(unit)` for operators and `enemy.normalAttack.interval` for enemies.
- Healing should use `effects: [{ type: 'heal', value }]`.
- Enemy active `attackModules` should act as additional attack definitions.

Required helper signatures:

```js
function attackDefinitionsForEnemy(enemy) {
  return [enemy.normalAttack, ...(enemy.attackModules ?? []).map((module) => module.normalAttack)].filter((attack) => {
    return attack && (attack.components?.length > 0 || attack.effects?.length > 0);
  });
}
```

- [ ] **Step 5: Run green combat tests**

Run:

```bash
npm test -- tests/combat-flow.test.js tests/damage-system.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/entities/Operator.js src/entities/Enemy.js src/systems/CombatSystem.js src/systems/BlockingSystem.js tests/combat-flow.test.js
git commit -m "feat: switch combat to damage components"
```

## Task 3: Unified Skill System And Enemy HP Threshold Skills

**Files:**
- Modify: `src/systems/SkillSystem.js`
- Modify: `src/core/Game.js`
- Modify: `src/ui/OperatorViewModels.js`
- Modify: `src/ui/UIController.js`
- Test: `tests/game.test.js`
- Test: `tests/browser-adapters.test.js`

- [ ] **Step 1: Write failing skill tests**

Add to `tests/game.test.js`:

Update imports at the top of `tests/game.test.js`:

```js
import { buildOperatorSpBarModel } from '../src/ui/UIController.js';
```

```js
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

test('active duration skill drains displayed sp ratio from full to empty', () => {
  const game = new Game({
    map: simpleOnePathMap(),
    operatorCatalog: {
      test_guard: {
        ...DEFAULT_OPERATORS.guard,
        id: 'test_guard',
        normalAttack: { interval: 1, range: { type: 'melee', radius: 0 }, targeting: 'blocked-first', components: [] },
        skills: [{
          id: 'duration_skill',
          name: '持续技能',
          description: '测试持续时间。',
          triggerMode: 'manual',
          spCost: 1,
          duration: 4,
          components: [],
          effects: [{ type: 'attack_multiplier', value: 2 }]
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
      normalAttack: { interval: 10, range: { type: 'melee', radius: 0 }, targeting: 'blocked-first', components: [] },
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
```

- [ ] **Step 2: Run red skill tests**

Run:

```bash
npm test -- tests/game.test.js tests/browser-adapters.test.js
```

Expected: FAIL because active SP ratio and enemy HP-threshold skills are not implemented.

- [ ] **Step 3: Implement unified skill activation**

Modify `src/systems/SkillSystem.js`:

- `tickOperatorSkills()` should not charge a skill while `activeRemaining > 0`.
- Active skill display ratio comes from `activeRemaining / duration`.
- `activateOperatorSkill()` should apply `effects`, `components`, and duration.
- Add `tickEnemySkills(deltaSeconds, enemies, operators, context)`.
- HP-threshold skills should record `skill.triggered = true` after activation.

Required effect behavior:

```js
export function applySkillEffects(source, skill, context) {
  (skill.effects ?? []).forEach((effect) => {
    if (effect.type === 'cost') context.costSystem?.add(effect.value);
    if (effect.type === 'heal') healSkillTarget(source, skill, context.operators, effect.value);
    if (effect.type.endsWith('_multiplier')) source.activeEffects.push({ ...effect, remaining: skill.duration ?? 0 });
  });
}
```

- [ ] **Step 4: Wire enemy skills in `Game.tick()`**

Modify `src/core/Game.js`:

- Call `tickEnemySkills()` after movement/blocking and before combat, so threshold skills can hit current targets.
- Add combat/effect output for skill attacks.
- Ensure enemy skill activation does not block normal attack timers.

- [ ] **Step 5: Update SP view models**

Modify `src/ui/OperatorViewModels.js`:

- `buildOperatorSpBarModel(operator)` should return active duration ratio when any skill has `activeRemaining > 0` and `duration > 0`.
- Otherwise return highest visible charging ratio from the first skill with `spCost > 0`.

- [ ] **Step 6: Run green skill tests**

Run:

```bash
npm test -- tests/game.test.js tests/browser-adapters.test.js tests/combat-flow.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/systems/SkillSystem.js src/core/Game.js src/ui/OperatorViewModels.js src/ui/UIController.js tests/game.test.js tests/browser-adapters.test.js
git commit -m "feat: unify skills and enemy threshold triggers"
```

## Task 4: Map Tile Metadata, Entry Exit Blocking, Life Value, And Waypoint Actions

**Files:**
- Modify: `src/data/MapLoader.js`
- Modify: `src/systems/DeploymentSystem.js`
- Modify: `src/core/Game.js`
- Modify: `src/entities/Enemy.js`
- Test: `tests/map-loader.test.js`
- Test: `tests/deployment-cost.test.js`
- Test: `tests/game.test.js`

- [ ] **Step 1: Write failing map and deployment tests**

Add to `tests/map-loader.test.js`:

```js
test('normalizeMap preserves tileMeta and waypoint actions', () => {
  const map = normalizeMap({
    version: '2.0',
    id: 'waypoint-map',
    name: 'Waypoint Map',
    width: 4,
    height: 1,
    initialCost: 20,
    maxCost: 30,
    maxLives: 10,
    totalWaves: 1,
    grid: [['path', 'path', 'path', 'path']],
    tileMeta: { '1,0': { deployable: false } },
    paths: [{
      id: 'main',
      name: 'main',
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }],
      color: '#fff',
      waypointActions: [{
        id: 'hold',
        pointIndex: 1,
        oncePerEnemy: true,
        actions: [{ type: 'pause', duration: 2 }]
      }]
    }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1, pathId: 'main' }]
  });

  assert.equal(map.tileMeta['1,0'].deployable, false);
  assert.equal(map.paths[0].waypointActions[0].actions[0].duration, 2);
});
```

Add to `tests/deployment-cost.test.js`:

```js
test('deployment rejects path entry exit and forbidden path tiles', () => {
  const map = normalizeMap({
    version: '2.0',
    id: 'deploy-meta',
    name: 'Deploy Meta',
    width: 4,
    height: 1,
    initialCost: 30,
    maxCost: 30,
    maxLives: 10,
    totalWaves: 1,
    grid: [['path', 'path', 'path', 'path']],
    tileMeta: { '1,0': { deployable: false } },
    paths: [{ id: 'main', name: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], color: '#fff' }],
    timeline: []
  });
  const deployment = createDeploymentSystem({
    map,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });

  assert.equal(deployment.canDeploy('vanguard', { x: 0, y: 0 }).ok, false);
  assert.equal(deployment.canDeploy('vanguard', { x: 1, y: 0 }).ok, false);
  assert.equal(deployment.canDeploy('vanguard', { x: 3, y: 0 }).ok, false);
  assert.equal(deployment.canDeploy('vanguard', { x: 2, y: 0 }).ok, true);
});
```

- [ ] **Step 2: Run red tests**

Run:

```bash
npm test -- tests/map-loader.test.js tests/deployment-cost.test.js
```

Expected: FAIL because `tileMeta` and `waypointActions` are not normalized or enforced.

- [ ] **Step 3: Implement `MapLoader` normalization**

Modify `src/data/MapLoader.js`:

- Add `tileMeta: normalizeTileMeta(rawMap.tileMeta)`.
- Add `waypointActions` to each normalized path.
- Validate waypoint `pointIndex > 0 && pointIndex < path.points.length - 1`.
- Validate action types: `pause`, `add_attack_module`, `add_defense_module`.

Required helper:

```js
function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}
```

- [ ] **Step 4: Enforce deployment blocking**

Modify `src/systems/DeploymentSystem.js`:

- Add `isEntryOrExitCell(map, cell)`.
- Add `isTileDeployable(map, cell, deployType)`.
- `canDeploy()` should return false for path entry/exit and forbidden `tileMeta` path tiles.

- [ ] **Step 5: Write failing waypoint runtime tests**

Add to `tests/game.test.js`:

```js
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

test('waypoint defense module reduces incoming damage until expiry', () => {
  const game = new Game({
    map: waypointDefenseMap(),
    operatorCatalog: DEFAULT_OPERATORS,
    enemyCatalog: DEFAULT_ENEMIES
  });
  game.deployOperator('sniper', { x: 1, y: 0 });
  game.start();
  game.tick(1.1);
  const enemy = game.enemies[0];

  assert.ok(enemy.defenseModules.length > 0);
});
```

- [ ] **Step 6: Implement waypoint runtime**

Modify `src/core/Game.js`:

- When placing an enemy after movement, detect crossed path point indices.
- If the enemy reaches an action point and has not triggered it, apply actions.
- If `movementPauseRemaining > 0`, decrement pause and skip path movement.
- Tick attack/defense module durations each frame.

Modify `src/entities/Enemy.js`:

- Add `movementPauseRemaining`, `triggeredWaypointActionIds`, `attackModules`, `defenseModules`.

- [ ] **Step 7: Implement `lifeValue` leak logic**

Modify `src/core/Game.js`:

```js
this.lives = Math.max(0, this.lives - (enemy.lifeValue ?? 1));
```

Add/adjust test in `tests/game.test.js`:

```js
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
```

- [ ] **Step 8: Run green map/game tests**

Run:

```bash
npm test -- tests/map-loader.test.js tests/deployment-cost.test.js tests/game.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/data/MapLoader.js src/systems/DeploymentSystem.js src/core/Game.js src/entities/Enemy.js tests/map-loader.test.js tests/deployment-cost.test.js tests/game.test.js
git commit -m "feat: add tile metadata and waypoint actions"
```

## Task 5: Canvas And UI View Models

**Files:**
- Modify: `src/renderers/CanvasRenderer.js`
- Modify: `src/editor/EditorRenderer.js`
- Modify: `src/ui/UIController.js`
- Modify: `src/ui/OperatorViewModels.js`
- Test: `tests/browser-adapters.test.js`
- Test: `tests/editor-layout.test.js`

- [ ] **Step 1: Write failing UI adapter tests**

Add to `tests/browser-adapters.test.js`:

Update the UI imports in `tests/browser-adapters.test.js` to include:

```js
buildOperatorNeuralBarModel
```

```js
test('operator sp bar model shows active skill drain ratio', () => {
  const model = buildOperatorSpBarModel({
    skills: [{ sp: 0, spCost: 10, duration: 8, activeRemaining: 2 }]
  });

  assert.equal(model.visible, true);
  assert.equal(model.ratio, 0.25);
  assert.equal(model.mode, 'active');
});

test('operator neural bar model exposes neural ratio only when damaged', () => {
  assert.deepEqual(buildOperatorNeuralBarModel({ neuralDamage: 0, neuralThreshold: 100 }), { visible: false, ratio: 0 });
  assert.deepEqual(buildOperatorNeuralBarModel({ neuralDamage: 25, neuralThreshold: 100 }), { visible: true, ratio: 0.25 });
});

test('enemy intel model includes components life value and block bypass', () => {
  const model = buildEnemyIntelModel({
    id: 'test',
    name: 'Test',
    maxHp: 100,
    defense: 10,
    resistance: 20,
    speed: 1,
    lifeValue: 8,
    blockBypass: 3,
    normalAttack: {
      range: { type: 'diamond', radius: 2 },
      components: [{ type: 'arts', value: 30 }]
    }
  });

  assert.equal(model.lifeValue, 8);
  assert.equal(model.blockBypass, 3);
  assert.deepEqual(model.components, ['法术 30']);
});
```

- [ ] **Step 2: Run red UI tests**

Run:

```bash
npm test -- tests/browser-adapters.test.js
```

Expected: FAIL because neural view model and component summaries are missing.

- [ ] **Step 3: Implement UI view models**

Modify `src/ui/OperatorViewModels.js`:

- Export `buildOperatorNeuralBarModel(operator)`.
- Update `buildOperatorSpBarModel(operator)` with active mode.

Modify `src/ui/UIController.js`:

- Enemy intel should summarize `normalAttack.range`, `normalAttack.components`, `lifeValue`, `blockBypass`.
- Skill panel should summarize `components` and `effects`.

- [ ] **Step 4: Update Canvas tile and bar rendering**

Modify `src/renderers/CanvasRenderer.js`:

- Draw entry overlays using path first points.
- Draw exit overlays using path last points.
- Draw forbidden path tile hatch for `tileMeta[key].deployable === false`.
- Draw waypoint marker for `path.waypointActions`.
- Draw pause marker when `enemy.movementPauseRemaining > 0`.
- Draw neural bar above operator HP/SP when visible.

Modify `src/editor/EditorRenderer.js` with the same map tile overlays and waypoint markers.

- [ ] **Step 5: Run UI tests**

Run:

```bash
npm test -- tests/browser-adapters.test.js tests/editor-layout.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/renderers/CanvasRenderer.js src/editor/EditorRenderer.js src/ui/UIController.js src/ui/OperatorViewModels.js tests/browser-adapters.test.js tests/editor-layout.test.js
git commit -m "feat: render upgraded combat and map feedback"
```

## Task 6: Custom Editor Upgrade

**Files:**
- Modify: `src/custom-editor/CustomEditorModel.js`
- Modify: `src/custom-editor/CustomEditorController.js`
- Modify: `src/styles.css`
- Test: `tests/custom-editor-model.test.js`
- Test: `tests/browser-adapters.test.js`

- [ ] **Step 1: Write failing custom editor model tests**

Add to `tests/custom-editor-model.test.js`:

Update imports at the top of `tests/custom-editor-model.test.js`:

```js
import {
  addDamageComponentToSelectedNormalAttack,
  updateNormalAttackComponentForSelected
} from '../src/custom-editor/CustomEditorModel.js';
```

```js
test('custom editor edits normal attack damage components', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'operators');
  const selected = state.data.operators[state.selectedId];

  state = addDamageComponentToSelectedNormalAttack(state, 'arts');
  state = updateNormalAttackComponentForSelected(state, state.data.operators[state.selectedId].normalAttack.components[0].id, { value: 42 });

  const component = state.data.operators[state.selectedId].normalAttack.components[0];
  assert.equal(component.type, 'arts');
  assert.equal(component.value, 42);
});

test('custom editor edits enemy life value block bypass and hp threshold skill', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'enemies');
  state = updateSelectedTemplate(state, { lifeValue: 8, blockBypass: 3 });
  state = addSkillToSelected(state);
  const skill = state.data.enemies[state.selectedId].skills[0];
  state = updateSkillForSelected(state, skill.id, { triggerMode: 'hp_threshold', hpThresholdPercent: 50 });

  const enemy = state.data.enemies[state.selectedId];
  assert.equal(enemy.lifeValue, 8);
  assert.equal(enemy.blockBypass, 3);
  assert.equal(enemy.skills[0].triggerMode, 'hp_threshold');
});
```

- [ ] **Step 2: Run red custom editor tests**

Run:

```bash
npm test -- tests/custom-editor-model.test.js
```

Expected: FAIL because component editing helpers do not exist and enemy skills are not supported.

- [ ] **Step 3: Implement custom editor model helpers**

Modify `src/custom-editor/CustomEditorModel.js`:

- Add `addDamageComponentToSelectedNormalAttack()`.
- Add `updateNormalAttackComponentForSelected()`.
- Add `removeNormalAttackComponentForSelected()`.
- Generalize `ensureOperatorSelected()` so range editing supports enemy normal attack and enemy skills.
- Allow `addSkillToSelected()` for both operators and enemies, with enemy default trigger `hp_threshold`.

- [ ] **Step 4: Update custom editor controller**

Modify `src/custom-editor/CustomEditorController.js`:

- Add number fields for `lifeValue` and `blockBypass`.
- Change resistance labels to `法抗 0-100`.
- Render component editor rows for normal attacks and skills.
- Add range targets for enemy normal attack and enemy skill ranges.
- Add skill trigger option `hp_threshold`.
- Add `hpThresholdPercent` input.

- [ ] **Step 5: Run custom editor tests**

Run:

```bash
npm test -- tests/custom-editor-model.test.js tests/browser-adapters.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/custom-editor/CustomEditorModel.js src/custom-editor/CustomEditorController.js src/styles.css tests/custom-editor-model.test.js tests/browser-adapters.test.js
git commit -m "feat: edit component attacks and enemy skills"
```

## Task 7: Map Editor Upgrade

**Files:**
- Modify: `src/editor/EditorModel.js`
- Modify: `src/editor/EditorController.js`
- Modify: `src/editor/EditorRenderer.js`
- Modify: `editor.html`
- Modify: `src/styles.css`
- Test: `tests/editor-model.test.js`

- [ ] **Step 1: Write failing editor model tests**

Add to `tests/editor-model.test.js`:

```js
test('editor toggles deployability metadata for multiple path cells', () => {
  let state = createEditorState({ width: 3, height: 1 });
  state = paintCells(state, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 'path');
  state = setCellsDeployable(state, [{ x: 1, y: 0 }], false);

  assert.deepEqual(state.map.tileMeta, { '1,0': { deployable: false } });
});

test('editor exports waypoint actions only on intermediate path points', () => {
  let state = createEditorState({ width: 3, height: 1 });
  state = addPath(state, 'main');
  state = paintCells(state, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 'path', { appendPathPoints: true });
  state = addWaypointAction(state, state.selectedPathId, 1, { type: 'pause', duration: 2 });
  const map = toMapJson(state);

  assert.equal(map.paths[0].waypointActions[0].pointIndex, 1);
  assert.equal(map.paths[0].waypointActions[0].actions[0].duration, 2);
  assert.throws(() => addWaypointAction(state, state.selectedPathId, 0, { type: 'pause', duration: 1 }), /intermediate/);
});
```

- [ ] **Step 2: Run red editor model tests**

Run:

```bash
npm test -- tests/editor-model.test.js
```

Expected: FAIL because `setCellsDeployable()` and `addWaypointAction()` do not exist.

- [ ] **Step 3: Implement editor model**

Modify `src/editor/EditorModel.js`:

- Add `setCellsDeployable(state, cells, deployable)`.
- Add `addWaypointAction(state, pathId, pointIndex, action)`.
- Add `updateWaypointAction(state, pathId, actionId, patch)`.
- Add `removeWaypointAction(state, pathId, actionId)`.
- Include `tileMeta` and `waypointActions` in `toMapJson()`.
- Preserve both in `loadMapIntoEditor()`.

- [ ] **Step 4: Update editor controls**

Modify `editor.html` and `src/editor/EditorController.js`:

- Add deployability tool buttons.
- Add waypoint action panel under path management.
- Allow selecting an intermediate path point.
- Support adding pause, attack-module, and defense-module actions.

- [ ] **Step 5: Run editor tests**

Run:

```bash
npm test -- tests/editor-model.test.js tests/map-loader.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add editor.html src/editor/EditorModel.js src/editor/EditorController.js src/editor/EditorRenderer.js src/styles.css tests/editor-model.test.js tests/map-loader.test.js
git commit -m "feat: edit deployability and waypoint actions"
```

## Task 8: Experimental Maps And Final Verification

**Files:**
- Create: `maps/neural-damage-lab.json`
- Create: `maps/restricted-entry-test.json`
- Create: `maps/high-value-breakthrough.json`
- Modify: `src/main.js`
- Modify: `tests/default-maps.test.js`
- Test: full test suite

- [ ] **Step 1: Write failing experimental map tests**

Add to `tests/default-maps.test.js`:

```js
test('experimental maps normalize and showcase upgraded mechanics', () => {
  const neural = normalizeMap(readMap('../maps/neural-damage-lab.json'));
  const restricted = normalizeMap(readMap('../maps/restricted-entry-test.json'));
  const highValue = normalizeMap(readMap('../maps/high-value-breakthrough.json'));

  assert.ok(neural.timeline.some((event) => event.enemyType.includes('neural')));
  assert.ok(Object.values(restricted.tileMeta).some((meta) => meta.deployable === false));
  assert.ok(highValue.paths.some((path) => path.waypointActions?.length > 0));
});

function readMap(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}
```

- [ ] **Step 2: Run red default map tests**

Run:

```bash
npm test -- tests/default-maps.test.js
```

Expected: FAIL because the three maps do not exist.

- [ ] **Step 3: Add experimental maps**

Create:

- `maps/neural-damage-lab.json`
- `maps/restricted-entry-test.json`
- `maps/high-value-breakthrough.json`

Each map must include:

- `version: "2.0"`
- valid `grid`, `paths`, `timeline`
- enough `initialCost` to deploy at least two early operators
- custom enemy ids that exist in `DEFAULT_ENEMIES` after Task 1/3 updates

- [ ] **Step 4: Register maps in main entry**

Modify `src/main.js`:

- Import the three JSON maps.
- Append them after `trainingGround`, `crossroads`, `mazeFortress`.

- [ ] **Step 5: Run full automated verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all pass with 0 failures and build exit code 0.

- [ ] **Step 6: Browser verification**

Run local dev server:

```bash
npm run dev -- --port 5173
```

Verify in browser:

- `http://127.0.0.1:5173/` loads.
- Map list shows the original three maps, then the three experimental maps.
- `editor.html` loads and can display deployability/waypoint UI.
- `custom-editor.html` loads and component editor controls are visible.
- Browser console has no errors.

- [ ] **Step 7: Commit**

Run:

```bash
git add maps/neural-damage-lab.json maps/restricted-entry-test.json maps/high-value-breakthrough.json src/main.js tests/default-maps.test.js
git commit -m "feat: add experimental mechanics maps"
```

## Final Review Checklist

- [ ] `DamageSystem` owns all physical, arts, and neural damage math.
- [ ] Runtime combat uses `normalAttack` and component arrays, not legacy `attack + damageType`.
- [ ] Resistance is `0..100` at runtime.
- [ ] Operator neural bars render and burst behavior is tested.
- [ ] Enemy HP-threshold skills trigger once.
- [ ] Active duration skills drain SP display from full to empty.
- [ ] Entry and exit path tiles reject deployment.
- [ ] `tileMeta` forbidden path tiles reject deployment.
- [ ] Enemy leaks deduct `lifeValue`.
- [ ] `blockBypass` is editable and shown as “反阻挡数”.
- [ ] Waypoint pause, attack module, and defense module behavior is tested.
- [ ] Custom editor can edit normal attack components and skill components.
- [ ] Map editor can edit deployability and waypoint actions.
- [ ] Three experimental maps validate and appear after the default maps.
- [ ] `npm test`, `npm run build`, and `git diff --check` pass.
