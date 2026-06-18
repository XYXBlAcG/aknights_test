# Battle Feedback And Enemy Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-pass battle animations, ranged/multi-phase enemy mechanics, SP bars, redeploy cooldowns, cancelable deployment selection, deploy-limit display, and first-seen enemy intel.

**Architecture:** Keep gameplay deterministic in systems and keep Canvas effects visual-only. Add small pure helpers and tests first, then wire them into `Game`, `UIController`, and `CanvasRenderer`. Preserve existing maps, enemy JSON, and custom localStorage compatibility by making all new enemy fields optional with defaults.

**Tech Stack:** Vite, browser Canvas 2D, native JavaScript ES modules, `node:test`.

---

## File Structure

- Create `src/systems/EffectSystem.js`: owns transient visual effects, expiry, and factory helpers.
- Modify `src/core/Game.js`: owns `effectSystem`, enemy intel queue, wave warning emission, cooldown ticking, and richer combat callbacks.
- Modify `src/systems/WaveSystem.js`: exposes upcoming timeline events for warning effects.
- Modify `src/systems/CombatSystem.js`: supports enemy ranged attacks, enemy damage types, multi-phase enemy damage resolution, and effect callbacks.
- Modify `src/systems/BlockingSystem.js`: applies `enemy.blockBypass > operator.block`.
- Modify `src/systems/DeploymentSystem.js`: supports map deploy limit and template redeploy cooldown checks.
- Modify `src/entities/Enemy.js`: stores range, targeting, block bypass, phases, active phase stats, and phase HP.
- Modify `src/data/CatalogValidators.js`: normalizes new enemy fields.
- Modify `src/data/defaultEnemies.js`: adds default range/damage metadata to every built-in enemy while keeping existing enemy roles.
- Modify `src/ui/UIController.js`: deck cancel behavior, cooldown display, deploy-limit display, enemy intel panel.
- Modify `src/renderers/CanvasRenderer.js`: draws effects, SP bars, multi-phase HP bars, and wave warnings.
- Modify `src/styles.css`: styles enemy intel panel, cooldown labels, deploy-limit status, and close button.
- Test files:
  - `tests/effect-system.test.js`
  - `tests/catalog-store.test.js`
  - `tests/combat-flow.test.js`
  - `tests/deployment-cost.test.js`
  - `tests/game.test.js`
  - `tests/browser-adapters.test.js`

## Task 1: Effect System

**Files:**
- Create: `src/systems/EffectSystem.js`
- Test: `tests/effect-system.test.js`
- Modify: `src/core/Game.js`
- Modify: `src/renderers/CanvasRenderer.js`

- [ ] **Step 1: Write failing tests for effect lifecycle**

Create `tests/effect-system.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEffectSystem,
  createEnemyDeathEffect,
  createOperatorAttackEffect,
  createWaveWarningEffect
} from '../src/systems/EffectSystem.js';

test('effect system creates effects and expires them by duration', () => {
  const effects = createEffectSystem();

  const attack = effects.add(createOperatorAttackEffect({
    source: { x: 1, y: 1 },
    target: { x: 3, y: 1 },
    color: '#f6c445'
  }));
  effects.add(createEnemyDeathEffect({
    cell: { x: 3, y: 1 },
    color: '#e15f5f'
  }));

  assert.equal(attack.type, 'operator_attack');
  assert.equal(effects.list().length, 2);

  effects.tick(0.1);
  assert.equal(effects.list()[0].elapsed, 0.1);

  effects.tick(2);
  assert.equal(effects.list().length, 0);
});

test('wave warning effect carries path and enemy payload', () => {
  const effect = createWaveWarningEffect({
    pathId: 'main',
    enemyType: 'infantry',
    wave: 2,
    count: 5,
    startTime: 12
  });

  assert.equal(effect.type, 'wave_warning');
  assert.equal(effect.duration, 2);
  assert.deepEqual(effect.payload, {
    pathId: 'main',
    enemyType: 'infantry',
    wave: 2,
    count: 5,
    startTime: 12
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node --test tests/effect-system.test.js
```

Expected: FAIL with module export error for `src/systems/EffectSystem.js`.

- [ ] **Step 3: Implement minimal `EffectSystem`**

Create `src/systems/EffectSystem.js`:

```js
let effectSequence = 0;

export function createEffectSystem() {
  return new EffectSystem();
}

export class EffectSystem {
  constructor() {
    this.effects = [];
  }

  add(effect) {
    effectSequence += 1;
    const created = {
      id: `effect-${effectSequence}`,
      elapsed: 0,
      ...effect
    };
    this.effects.push(created);
    return created;
  }

  tick(deltaSeconds) {
    this.effects.forEach((effect) => {
      effect.elapsed = Math.round((effect.elapsed + deltaSeconds) * 1000) / 1000;
    });
    this.effects = this.effects.filter((effect) => effect.elapsed < effect.duration);
  }

  list() {
    return this.effects.map((effect) => ({ ...effect, payload: structuredClone(effect.payload) }));
  }

  clear() {
    this.effects = [];
  }
}

export function createOperatorAttackEffect({ source, target, color = '#f6c445' }) {
  return {
    type: 'operator_attack',
    duration: 0.28,
    payload: { source, target, color }
  };
}

export function createEnemyAttackEffect({ source, target, color = '#ec5757' }) {
  return {
    type: 'enemy_attack',
    duration: 0.32,
    payload: { source, target, color }
  };
}

export function createEnemyDeathEffect({ cell, color = '#e15f5f', phaseBreak = false }) {
  return {
    type: 'enemy_death',
    duration: phaseBreak ? 0.45 : 0.62,
    payload: { cell, color, phaseBreak }
  };
}

export function createWaveWarningEffect({ pathId, enemyType, wave, count, startTime, duration = 2 }) {
  return {
    type: 'wave_warning',
    duration,
    payload: { pathId, enemyType, wave, count, startTime }
  };
}
```

- [ ] **Step 4: Run effect tests to verify GREEN**

Run:

```bash
node --test tests/effect-system.test.js
```

Expected: PASS.

- [ ] **Step 5: Wire effects into `Game` state without rendering yet**

Modify `src/core/Game.js` imports and reset/get/tick:

```js
import { createEffectSystem } from '../systems/EffectSystem.js';
```

In `resetState()` after combat system creation:

```js
this.effectSystem = createEffectSystem();
```

In `tick(deltaSeconds)` after `scaledDelta` is computed:

```js
this.effectSystem.tick(scaledDelta);
```

In `getState()`:

```js
effects: this.effectSystem.list(),
```

- [ ] **Step 6: Add renderer no-op tolerance for effects**

Modify `src/renderers/CanvasRenderer.js` in `render(state)` after drawing paths and before deployment preview:

```js
this.drawEffects(ctx, state);
```

Add a method that safely ignores unknown effects:

```js
drawEffects(ctx, state) {
  (state.effects ?? []).forEach((effect) => {
    if (!effect?.type) {
      return;
    }
  });
}
```

- [ ] **Step 7: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/systems/EffectSystem.js src/core/Game.js src/renderers/CanvasRenderer.js tests/effect-system.test.js
git commit -m "Add battle effect system"
```

## Task 2: Enemy Data Normalization And Runtime Phases

**Files:**
- Modify: `src/data/CatalogValidators.js`
- Modify: `src/entities/Enemy.js`
- Modify: `src/data/defaultEnemies.js`
- Test: `tests/catalog-store.test.js`
- Test: `tests/combat-flow.test.js`

- [ ] **Step 1: Write failing validation test**

Append to `tests/catalog-store.test.js`:

```js
test('enemy templates normalize range damage bypass and phases', () => {
  const enemy = normalizeEnemyTemplate({
    id: 'caster-boss',
    name: '术式队长',
    maxHp: '100',
    attack: '20',
    defense: '4',
    resistance: '0.2',
    speed: '0.8',
    attackInterval: '1.4',
    canBeBlocked: true,
    isFlying: false,
    rewardCost: '8',
    elite: true,
    boss: true,
    damageType: 'arts',
    targeting: 'nearest',
    blockBypass: '2',
    range: { type: 'diamond', radius: 2 },
    phases: [{
      name: '第二形态',
      maxHp: '150',
      attack: '28',
      defense: '8',
      resistance: '0.35',
      speed: '1.1',
      attackInterval: '1.1',
      color: '#b98cff',
      description: '破防后移动速度提升。'
    }],
    color: '#ffaa55'
  });

  assert.equal(enemy.damageType, 'arts');
  assert.equal(enemy.targeting, 'nearest');
  assert.equal(enemy.blockBypass, 2);
  assert.deepEqual(enemy.range, { type: 'diamond', radius: 2 });
  assert.equal(enemy.phases.length, 1);
  assert.equal(enemy.phases[0].maxHp, 150);
  assert.equal(enemy.phases[0].description, '破防后移动速度提升。');
});
```

- [ ] **Step 2: Write failing enemy runtime test**

Append to `tests/combat-flow.test.js`:

```js
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
  assert.equal(enemy.phases.length, 2);
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
node --test tests/catalog-store.test.js tests/combat-flow.test.js
```

Expected: FAIL because enemy normalization does not expose `range`, `damageType`, `targeting`, `blockBypass`, or `phases`.

- [ ] **Step 4: Implement enemy validation defaults**

Modify `src/data/CatalogValidators.js`:

```js
const ENEMY_DAMAGE_TYPES = new Set(['physical', 'arts']);
const ENEMY_TARGETING_TYPES = new Set(['blocked-first', 'nearest', 'lowest-hp-percent']);
```

In `normalizeEnemyTemplate(template)`, add:

```js
const damageType = oneOf(template?.damageType ?? 'physical', ENEMY_DAMAGE_TYPES, 'enemy damage type');
const targeting = oneOf(template?.targeting ?? 'blocked-first', ENEMY_TARGETING_TYPES, 'enemy targeting');
const range = normalizeRange(template?.range ?? { type: 'melee', radius: 0 });
const phases = normalizeEnemyPhases(template?.phases ?? []);
```

Return these fields:

```js
damageType,
targeting,
range,
blockBypass: integerInRange(template?.blockBypass ?? 0, 0, 99, 'block bypass'),
description: String(template?.description ?? ''),
phases,
```

Add helper:

```js
function normalizeEnemyPhases(phases) {
  if (!Array.isArray(phases)) {
    throw new Error('enemy phases must be an array');
  }
  return phases.map((phase, index) => ({
    name: nonEmptyString(phase?.name ?? `phase-${index + 1}`, 'enemy phase name'),
    maxHp: numberInRange(phase?.maxHp, 1, 999999, 'phase max hp'),
    attack: numberInRange(phase?.attack ?? 0, 0, 99999, 'phase attack'),
    defense: numberInRange(phase?.defense ?? 0, 0, 99999, 'phase defense'),
    resistance: numberInRange(phase?.resistance ?? 0, 0, 0.95, 'phase resistance'),
    speed: numberInRange(phase?.speed, 0.01, 20, 'phase speed'),
    attackInterval: numberInRange(phase?.attackInterval ?? 1.5, 0.1, 60, 'phase attack interval'),
    canBeBlocked: 'canBeBlocked' in phase ? Boolean(phase.canBeBlocked) : undefined,
    damageType: phase?.damageType
      ? oneOf(phase.damageType, ENEMY_DAMAGE_TYPES, 'phase damage type')
      : undefined,
    range: phase?.range ? normalizeRange(phase.range) : undefined,
    color: phase?.color ? nonEmptyString(phase.color, 'phase color') : undefined,
    description: String(phase?.description ?? '')
  }));
}
```

- [ ] **Step 5: Implement enemy runtime phases**

Modify `src/entities/Enemy.js` constructor:

```js
this.baseTemplate = structuredClone(template);
this.phases = template.phases?.length > 0
  ? structuredClone(template.phases)
  : [];
this.phaseIndex = 0;
```

Set default runtime fields before applying phase:

```js
this.damageType = template.damageType ?? 'physical';
this.targeting = template.targeting ?? 'blocked-first';
this.range = template.range ?? { type: 'melee', radius: 0 };
this.blockBypass = template.blockBypass ?? 0;
this.description = template.description ?? '';
```

At the end of constructor before path fields are used:

```js
if (this.phases.length > 0) {
  this.applyPhase(0);
}
```

Add method:

```js
applyPhase(index) {
  const phase = this.phases[index];
  if (!phase) {
    return;
  }
  this.phaseIndex = index;
  this.maxHp = phase.maxHp;
  this.hp = phase.maxHp;
  this.attack = phase.attack;
  this.defense = phase.defense;
  this.resistance = phase.resistance ?? 0;
  this.speed = phase.speed;
  this.attackInterval = phase.attackInterval;
  this.attackTimer = Math.min(this.attackTimer ?? this.attackInterval, this.attackInterval);
  this.damageType = phase.damageType ?? this.damageType;
  this.range = phase.range ?? this.range;
  this.color = phase.color ?? this.color;
  if (phase.canBeBlocked !== undefined) {
    this.canBeBlocked = phase.canBeBlocked;
  }
}

advancePhase() {
  if (this.phaseIndex + 1 >= this.phases.length) {
    return false;
  }
  this.applyPhase(this.phaseIndex + 1);
  if (this.canBeBlocked === false) {
    this.blockedBy = null;
  }
  return true;
}

get hasMorePhases() {
  return this.phaseIndex + 1 < this.phases.length;
}
```

- [ ] **Step 6: Update default enemy metadata**

Modify each enemy in `src/data/defaultEnemies.js` with explicit compatible fields:

```js
damageType: 'physical',
targeting: 'blocked-first',
range: { type: 'melee', radius: 0 },
blockBypass: 0,
description: '基础敌方单位。',
phases: [],
```

For `drone`, keep `attack: 0` and add:

```js
description: '飞行单位，不会被地面阻挡。',
```

- [ ] **Step 7: Run tests**

Run:

```bash
node --test tests/catalog-store.test.js tests/combat-flow.test.js
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/data/CatalogValidators.js src/entities/Enemy.js src/data/defaultEnemies.js tests/catalog-store.test.js tests/combat-flow.test.js
git commit -m "Extend enemy templates for ranged and phases"
```

## Task 3: Blocking Bypass And Ranged Enemy Combat

**Files:**
- Modify: `src/systems/BlockingSystem.js`
- Modify: `src/systems/CombatSystem.js`
- Test: `tests/combat-flow.test.js`

- [ ] **Step 1: Write failing block bypass test**

Append to `tests/combat-flow.test.js`:

```js
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
```

- [ ] **Step 2: Write failing ranged enemy attack tests**

Append to `tests/combat-flow.test.js`:

```js
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
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
node --test tests/combat-flow.test.js
```

Expected: FAIL because bypass and ranged enemy target selection are not implemented.

- [ ] **Step 4: Implement block bypass**

Modify `src/systems/BlockingSystem.js` blocker predicate:

```js
const blocker = activeOperators.find((operator) => {
  return operator.deployType === 'ground'
    && operator.canBlockMore()
    && (enemy.blockBypass ?? 0) <= operator.block
    && isSameCell(operator.cell, enemy.cell);
});
```

- [ ] **Step 5: Implement enemy damage helpers**

Modify imports in `src/systems/CombatSystem.js`:

```js
import { isSameCell, manhattanDistance } from '../utils/GridMath.js';
```

Add:

```js
export function calculateEnemyDamage(enemy, target) {
  if (enemy.damageType === 'arts') {
    return Math.max(1, Math.round(enemy.attack * (1 - (target.resistance ?? 0))));
  }
  return calculatePhysicalDamage(enemy.attack, getEffectiveDefense(target));
}
```

Add target selector:

```js
function selectEnemyTarget(enemy, operators) {
  const blocker = operators.find((operator) => operator.id === enemy.blockedBy && !operator.isDead);
  if (blocker) {
    return blocker;
  }

  if (!enemy.range || enemy.range.type === 'melee') {
    return null;
  }

  const inRange = operators.filter((operator) => {
    return !operator.isDead && isCellInRange(enemy.cell, operator.cell, enemy.range);
  });

  if (inRange.length === 0) {
    return null;
  }

  if (enemy.targeting === 'lowest-hp-percent') {
    return [...inRange].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
  }

  return [...inRange].sort((a, b) => {
    return manhattanDistance(enemy.cell, a.cell) - manhattanDistance(enemy.cell, b.cell);
  })[0];
}
```

- [ ] **Step 6: Replace enemy attack loop**

In `CombatSystem.tick`, initialize:

```js
const damagedOperators = [];
```

Replace the enemy attack loop with:

```js
enemies.filter((enemy) => !enemy.isDead && enemy.attack > 0).forEach((enemy) => {
  enemy.attackTimer += deltaSeconds;
  if (enemy.attackTimer < enemy.attackInterval) {
    return;
  }

  const target = selectEnemyTarget(enemy, operators);
  if (!target) {
    if (enemy.blockedBy) {
      enemy.blockedBy = null;
    }
    return;
  }

  target.hp -= calculateEnemyDamage(enemy, target);
  enemy.attackTimer = 0;
  damagedOperators.push(target);
  if (target.hp <= 0 && !killedOperators.includes(target)) {
    target.hp = 0;
    target.blockedEnemies.forEach((blockedEnemy) => {
      if (blockedEnemy.blockedBy === target.id) {
        blockedEnemy.blockedBy = null;
      }
    });
    target.blockedEnemies = [];
    killedOperators.push(target);
    onOperatorKilled?.(target, enemy);
  }
});
```

Return `damagedOperators` in the tick result.

- [ ] **Step 7: Run tests**

Run:

```bash
node --test tests/combat-flow.test.js
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/systems/BlockingSystem.js src/systems/CombatSystem.js tests/combat-flow.test.js
git commit -m "Add ranged enemy combat and block bypass"
```

## Task 4: Multi-Phase Damage Resolution And Kill Rewards

**Files:**
- Modify: `src/systems/CombatSystem.js`
- Modify: `src/core/Game.js`
- Test: `tests/combat-flow.test.js`
- Test: `tests/game.test.js`

- [ ] **Step 1: Write failing phase transition combat test**

Append to `tests/combat-flow.test.js`:

```js
test('operator damage advances enemy phase before final death', () => {
  const guard = new Operator({
    ...DEFAULT_OPERATORS.guard,
    id: 'phase-breaker',
    attack: 100,
    attackInterval: 1
  }, { x: 0, y: 0 });
  const enemy = new Enemy({
    ...DEFAULT_ENEMIES.heavy,
    id: 'two-bar',
    phases: [
      { name: 'bar1', maxHp: 30, attack: 0, defense: 0, resistance: 0, speed: 1, attackInterval: 1, color: '#85a6ff' },
      { name: 'bar2', maxHp: 40, attack: 0, defense: 0, resistance: 0, speed: 1, attackInterval: 1, color: '#ff8a4d' }
    ]
  }, { pathId: 'main' });
  enemy.cell = { x: 0, y: 0 };
  enemy.blockedBy = guard.id;
  guard.blockedEnemies = [enemy];
  guard.attackTimer = 1;

  const result = createCombatSystem().tick(1, { operators: [guard], enemies: [enemy] });

  assert.equal(enemy.isDead, false);
  assert.equal(enemy.phaseIndex, 1);
  assert.equal(enemy.hp, 40);
  assert.equal(enemy.color, '#ff8a4d');
  assert.equal(result.phaseChangedEnemies[0], enemy);
  assert.equal(result.killedEnemies.length, 0);
});
```

- [ ] **Step 2: Write failing reward-on-final-death test**

Append to `tests/game.test.js`:

```js
test('multi-phase enemy rewards cost only after final phase death', () => {
  const phaseMap = {
    ...map,
    initialCost: 30,
    maxCost: 50,
    timeline: []
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
  const game = new Game({ map: phaseMap, operatorCatalog: DEFAULT_OPERATORS, enemyCatalog: DEFAULT_ENEMIES });
  game.enemies.push(enemy);
  game.handleEnemyKilled(enemy);

  assert.equal(game.getState().kills, 1);
  assert.equal(game.getState().cost, 39);
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
node --test tests/combat-flow.test.js tests/game.test.js
```

Expected: FAIL because `phaseChangedEnemies` and phase damage resolution do not exist.

- [ ] **Step 4: Implement phase-aware enemy damage**

Add in `src/systems/CombatSystem.js`:

```js
function applyDamageToEnemy(enemy, damage) {
  enemy.hp -= damage;
  if (enemy.hp > 0) {
    return 'damaged';
  }
  if (enemy.hasMorePhases && enemy.advancePhase()) {
    return 'phase_changed';
  }
  enemy.hp = 0;
  enemy.blockedBy = null;
  return 'killed';
}
```

In operator attack handling, replace direct `target.hp -= calculateDamage(...)` and `if (target.hp <= 0)` with:

```js
const outcome = applyDamageToEnemy(target, calculateDamage(operator, target));
consumeNextAttackSkill(operator);
operator.attackTimer = 0;
if (outcome === 'phase_changed') {
  phaseChangedEnemies.push(target);
  return;
}
if (outcome === 'killed' && !killedEnemies.includes(target)) {
  killedEnemies.push(target);
  onEnemyKilled?.(target, operator);
}
```

Initialize and return:

```js
const phaseChangedEnemies = [];
```

and:

```js
phaseChangedEnemies,
```

- [ ] **Step 5: Keep reward logic final-death-only**

`Game.handleEnemyKilled(enemy)` already rewards only when called. Confirm phase changes do not call `onEnemyKilled`. No code change is needed if Step 4 is correct.

- [ ] **Step 6: Run tests**

Run:

```bash
node --test tests/combat-flow.test.js tests/game.test.js
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/systems/CombatSystem.js tests/combat-flow.test.js tests/game.test.js
git commit -m "Add multi-phase enemy damage"
```

## Task 5: Effects From Combat And Wave Warnings

**Files:**
- Modify: `src/systems/WaveSystem.js`
- Modify: `src/core/Game.js`
- Modify: `src/renderers/CanvasRenderer.js`
- Test: `tests/game.test.js`
- Test: `tests/browser-adapters.test.js`

- [ ] **Step 1: Write failing wave warning test**

Append to `tests/game.test.js`:

```js
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
```

- [ ] **Step 2: Write failing combat effect test**

Append to `tests/game.test.js`:

```js
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
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
node --test tests/game.test.js
```

Expected: FAIL because upcoming wave warnings and combat callbacks do not create effects.

- [ ] **Step 4: Expose upcoming warnings from `WaveSystem`**

Modify expanded schedule entries in `src/systems/WaveSystem.js` to include event-level warning id:

```js
eventId: `${event.wave}:${event.startTime}:${event.enemyType}:${event.pathId}`,
count: event.count,
eventStartTime: event.startTime
```

Add method:

```js
warningsDue(windowSeconds) {
  const minTime = this.elapsed;
  const maxTime = this.elapsed + windowSeconds;
  const seen = new Set();
  return this.schedule
    .filter((spawn) => spawn.eventStartTime > minTime && spawn.eventStartTime <= maxTime)
    .filter((spawn) => {
      if (seen.has(spawn.eventId)) {
        return false;
      }
      seen.add(spawn.eventId);
      return true;
    })
    .map((spawn) => ({
      id: spawn.eventId,
      wave: spawn.wave,
      enemyType: spawn.enemyType,
      pathId: spawn.pathId,
      count: spawn.count,
      startTime: spawn.eventStartTime
    }));
}
```

- [ ] **Step 5: Create warnings and combat effects in `Game`**

Import effect factories:

```js
import {
  createEnemyAttackEffect,
  createEnemyDeathEffect,
  createOperatorAttackEffect,
  createWaveWarningEffect
} from '../systems/EffectSystem.js';
```

In `resetState()`:

```js
this.warnedWaveEvents = new Set();
```

Before `waveSystem.tick(scaledDelta)` in `tick()`:

```js
this.waveSystem.warningsDue(this.map.waveWarningSeconds ?? 2).forEach((warning) => {
  if (this.warnedWaveEvents.has(warning.id)) {
    return;
  }
  this.warnedWaveEvents.add(warning.id);
  this.effectSystem.add(createWaveWarningEffect({
    ...warning,
    duration: this.map.waveWarningSeconds ?? 2
  }));
});
```

Use combat result:

```js
const combatResult = this.combatSystem.tick(scaledDelta, {
  operators: this.deploymentSystem.operators,
  enemies: this.enemies,
  onEnemyKilled: (enemy) => this.handleEnemyKilled(enemy)
});
this.addCombatEffects(combatResult);
```

Add method:

```js
addCombatEffects(result) {
  result.attacks?.forEach((attack) => {
    this.effectSystem.add(createOperatorAttackEffect({
      source: attack.source.cell,
      target: attack.target.cell,
      color: attack.source.color
    }));
  });
  result.enemyAttacks?.forEach((attack) => {
    this.effectSystem.add(createEnemyAttackEffect({
      source: attack.source.cell,
      target: attack.target.cell,
      color: attack.source.color
    }));
  });
  [...(result.killedEnemies ?? []), ...(result.phaseChangedEnemies ?? [])].forEach((enemy) => {
    this.effectSystem.add(createEnemyDeathEffect({
      cell: enemy.cell,
      color: enemy.color,
      phaseBreak: !enemy.isDead
    }));
  });
}
```

- [ ] **Step 6: Return attack metadata from `CombatSystem`**

In `src/systems/CombatSystem.js` initialize:

```js
const attacks = [];
const enemyAttacks = [];
```

Push operator attacks when damage or heal happens:

```js
attacks.push({ source: operator, target });
```

Push enemy attacks when an enemy damages an operator:

```js
enemyAttacks.push({ source: enemy, target });
```

Return both arrays.

- [ ] **Step 7: Draw first-pass effects**

Modify `CanvasRenderer.drawEffects(ctx, state)`:

```js
drawEffects(ctx, state) {
  (state.effects ?? []).forEach((effect) => {
    if (effect.type === 'wave_warning') {
      this.drawWaveWarningEffect(ctx, effect, state);
    }
    if (effect.type === 'operator_attack' || effect.type === 'enemy_attack') {
      this.drawAttackEffect(ctx, effect);
    }
    if (effect.type === 'enemy_death') {
      this.drawDeathEffect(ctx, effect);
    }
  });
}
```

Add helpers using `gridToCenter` and `effect.elapsed / effect.duration` to draw line alpha, warning path pulse, and death ring. Use no images and no external assets.

- [ ] **Step 8: Add adapter test for effect rendering model tolerance**

Append to `tests/browser-adapters.test.js`:

```js
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
```

- [ ] **Step 9: Run tests**

Run:

```bash
node --test tests/game.test.js tests/browser-adapters.test.js
npm test
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/systems/WaveSystem.js src/core/Game.js src/systems/CombatSystem.js src/renderers/CanvasRenderer.js tests/game.test.js tests/browser-adapters.test.js
git commit -m "Emit battle animation effects"
```

## Task 6: SP Bars, Deploy Limit, Cancel Selection, Redeploy Cooldown

**Files:**
- Modify: `src/systems/DeploymentSystem.js`
- Modify: `src/core/Game.js`
- Modify: `src/ui/UIController.js`
- Modify: `src/renderers/CanvasRenderer.js`
- Modify: `src/styles.css`
- Test: `tests/deployment-cost.test.js`
- Test: `tests/game.test.js`
- Test: `tests/browser-adapters.test.js`

- [ ] **Step 1: Write failing cooldown test**

Append to `tests/deployment-cost.test.js`:

```js
test('retreat starts template redeploy cooldown and blocks redeploy', () => {
  const cost = createCostSystem({ initialCost: 30, maxCost: 30 });
  const deployment = createDeploymentSystem({ map, costSystem: cost, operatorCatalog: DEFAULT_OPERATORS });
  const placed = deployment.deploy('vanguard', { x: 0, y: 0 });

  deployment.retreat(placed.operator.id);

  assert.equal(deployment.canDeploy('vanguard', { x: 0, y: 0 }).ok, false);
  assert.match(deployment.canDeploy('vanguard', { x: 0, y: 0 }).reason, /Redeploy cooldown/);

  deployment.tickCooldowns(10);

  assert.equal(deployment.canDeploy('vanguard', { x: 0, y: 0 }).ok, true);
});
```

- [ ] **Step 2: Write failing cancel selection and map deploy limit tests**

Append to `tests/game.test.js`:

```js
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
```

- [ ] **Step 3: Write failing deck model and SP bar model tests**

Append to `tests/browser-adapters.test.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify RED**

Run:

```bash
node --test tests/deployment-cost.test.js tests/game.test.js tests/browser-adapters.test.js
```

Expected: FAIL because cooldowns, toggle selection, deploy limit, and SP model are missing.

- [ ] **Step 5: Implement cooldowns and map deploy limit in deployment system**

Modify `DeploymentSystem` constructor:

```js
this.totalLimit = map.deployLimit ?? TOTAL_DEPLOY_LIMIT;
this.redeployCooldowns = {};
this.redeployCooldownSeconds = map.redeployCooldownSeconds ?? 10;
```

In `canDeploy` before cost check:

```js
const cooldown = this.redeployCooldowns[operatorType] ?? 0;
if (cooldown > 0) {
  return { ok: false, reason: `Redeploy cooldown ${Math.ceil(cooldown)}s` };
}
```

In `retreat` before returning:

```js
this.redeployCooldowns[operator.templateId] = this.redeployCooldownSeconds;
```

Add:

```js
tickCooldowns(deltaSeconds) {
  Object.entries(this.redeployCooldowns).forEach(([templateId, remaining]) => {
    const next = Math.max(0, remaining - deltaSeconds);
    if (next <= 0) {
      delete this.redeployCooldowns[templateId];
    } else {
      this.redeployCooldowns[templateId] = next;
    }
  });
}
```

- [ ] **Step 6: Wire cooldown and selection into `Game`**

In `Game.tick()` after cost tick:

```js
this.deploymentSystem.tickCooldowns(scaledDelta);
```

Add:

```js
toggleOperatorSelection(operatorType) {
  if (this.selectedOperatorType === operatorType) {
    this.clearSelection();
    return { ok: true, canceled: true };
  }
  return this.selectOperator(operatorType);
}
```

In `getState()`:

```js
redeployCooldowns: { ...this.deploymentSystem.redeployCooldowns },
deployLimit: this.deploymentSystem.totalLimit,
```

- [ ] **Step 7: Update deck and status models**

Modify `buildOperatorDeckModel` signature usage to accept `redeployCooldowns` and `deployLimit`.

Use:

```js
const deployLimit = state.deployLimit ?? TOTAL_DEPLOY_LIMIT;
const totalFull = operators.length >= deployLimit;
const cooldownRemaining = Math.ceil(redeployCooldowns?.[id] ?? 0);
```

Reason priority should be cost, cooldown, total, class:

```js
if (cooldownRemaining > 0) {
  disabledReason = `再部署 ${cooldownRemaining}s`;
} else if (unaffordable) {
  disabledReason = '费用不足';
}
```

Return `cooldownRemaining`.

Export:

```js
export function buildOperatorSpBarModel(operator) {
  const skills = operator?.skills ?? [operator?.skill].filter(Boolean);
  const skill = skills.find((item) => (item.triggerMode ?? 'manual') !== 'auto') ?? skills[0];
  if (!skill) {
    return { visible: false, ratio: 0, ready: false };
  }
  return {
    visible: true,
    ratio: Math.max(0, Math.min(1, skill.sp / skill.spCost)),
    ready: skill.sp >= skill.spCost
  };
}
```

- [ ] **Step 8: Update UI interactions and top status**

In `UIController` deck click handler, replace `selectOperator` call with:

```js
const result = this.game.toggleOperatorSelection(button.dataset.operatorId);
this.pendingDeployment = null;
this.message = result.canceled ? '已取消部署选择' : `${button.dataset.operatorName} 待部署`;
```

In `renderTopStatus(state)` add:

```html
<div class="status-item">DEPLOY <strong>${state.operators.length}/${state.deployLimit}</strong></div>
```

In deck card HTML, show cooldown reason in existing `.operator-reason`.

- [ ] **Step 9: Draw SP bars**

Import in `CanvasRenderer.js`:

```js
import { buildOperatorSpBarModel } from '../ui/UIController.js';
```

After HP bar in `drawOperators`:

```js
const spBar = buildOperatorSpBarModel(operator);
if (spBar.visible) {
  this.drawRatioBar(ctx, x - radius, y + radius + 11, radius * 2, 4, spBar.ratio, spBar.ready ? '#f6c445' : '#5fc9ff');
}
```

Replace `drawHpBar` internals with `drawRatioBar` helper:

```js
drawRatioBar(ctx, x, y, width, height, ratio, color) {
  ctx.fillStyle = '#111821';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), height);
}
```

- [ ] **Step 10: Run tests**

Run:

```bash
node --test tests/deployment-cost.test.js tests/game.test.js tests/browser-adapters.test.js
npm test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/systems/DeploymentSystem.js src/core/Game.js src/ui/UIController.js src/renderers/CanvasRenderer.js src/styles.css tests/deployment-cost.test.js tests/game.test.js tests/browser-adapters.test.js
git commit -m "Add redeploy cooldown and battlefield sp bars"
```

## Task 7: Enemy Intel Panel

**Files:**
- Modify: `src/core/Game.js`
- Modify: `src/ui/UIController.js`
- Modify: `src/styles.css`
- Test: `tests/game.test.js`
- Test: `tests/browser-adapters.test.js`

- [ ] **Step 1: Write failing first-seen intel test**

Append to `tests/game.test.js`:

```js
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
```

- [ ] **Step 2: Write failing intel model test**

Append to `tests/browser-adapters.test.js`:

```js
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
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
node --test tests/game.test.js tests/browser-adapters.test.js
```

Expected: FAIL because intel queue and model are missing.

- [ ] **Step 4: Track first-seen enemies in `Game`**

In `resetState()`:

```js
this.seenEnemyTypes = new Set();
this.enemyIntelQueue = [];
```

In spawned enemy loop:

```js
this.queueEnemyIntel(enemy.templateId);
```

Add:

```js
queueEnemyIntel(templateId) {
  if (this.seenEnemyTypes.has(templateId)) {
    return;
  }
  const template = this.enemyCatalog[templateId];
  if (!template) {
    return;
  }
  this.seenEnemyTypes.add(templateId);
  this.enemyIntelQueue.push(template);
}

dismissEnemyIntel(templateId) {
  this.enemyIntelQueue = this.enemyIntelQueue.filter((enemy) => enemy.id !== templateId);
}
```

In `getState()`:

```js
enemyIntelQueue: this.enemyIntelQueue.map((enemy) => structuredClone(enemy)),
```

- [ ] **Step 5: Build and render intel model**

In `src/ui/UIController.js`, export:

```js
export function buildEnemyIntelModel(enemy) {
  if (!enemy) {
    return null;
  }
  const rangeSummary = summarizeRange(enemy.range);
  const traits = [];
  if (enemy.damageType === 'arts') traits.push('法术');
  if (enemy.range && enemy.range.type !== 'melee') traits.push('远程');
  if (enemy.isFlying) traits.push('飞行');
  if (enemy.canBeBlocked === false) traits.push('不可阻挡');
  if ((enemy.blockBypass ?? 0) > 0) traits.push(`防阻挡${enemy.blockBypass}`);
  if (enemy.elite) traits.push('精英');
  if (enemy.boss) traits.push('Boss');
  return {
    id: enemy.id,
    name: enemy.name,
    maxHp: enemy.maxHp,
    attack: enemy.attack,
    defense: enemy.defense,
    resistance: enemy.resistance,
    speed: enemy.speed,
    rangeSummary,
    traits,
    description: enemy.description ?? '',
    phaseCount: enemy.phases?.length ?? 0
  };
}
```

Add `this.enemyIntelPanel = this.root.querySelector('#enemy-intel-panel');` after adding the element in HTML or create it dynamically in `cacheElements()`:

```js
this.enemyIntelPanel = this.root.querySelector('#enemy-intel-panel');
```

Render in `sync()` with render key:

```js
this.renderEnemyIntel(state);
```

Add:

```js
renderEnemyIntel(state) {
  const model = buildEnemyIntelModel(state.enemyIntelQueue?.[0]);
  if (!this.enemyIntelPanel) {
    this.enemyIntelPanel = document.createElement('aside');
    this.enemyIntelPanel.id = 'enemy-intel-panel';
    this.enemyIntelPanel.className = 'enemy-intel-panel hidden';
    this.root.appendChild(this.enemyIntelPanel);
  }
  if (!model) {
    this.enemyIntelPanel.classList.add('hidden');
    this.enemyIntelPanel.innerHTML = '';
    return;
  }
  this.enemyIntelPanel.classList.remove('hidden');
  this.enemyIntelPanel.innerHTML = `
    <button class="enemy-intel-close" data-enemy-intel-close="${model.id}">×</button>
    <h2>${model.name}</h2>
    <dl>
      <div><dt>生命</dt><dd>${model.maxHp}${model.phaseCount > 0 ? ` / ${model.phaseCount}阶段` : ''}</dd></div>
      <div><dt>攻击</dt><dd>${model.attack}</dd></div>
      <div><dt>防御</dt><dd>${model.defense}</dd></div>
      <div><dt>法抗</dt><dd>${Math.round(model.resistance * 100)}%</dd></div>
      <div><dt>速度</dt><dd>${model.speed}</dd></div>
      <div><dt>范围</dt><dd>${model.rangeSummary}</dd></div>
    </dl>
    <p>${model.description}</p>
    <div class="enemy-intel-tags">${model.traits.map((trait) => `<span>${trait}</span>`).join('')}</div>
  `;
}
```

In `bindEvents()`, add:

```js
this.root.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('[data-enemy-intel-close]');
  if (!button) {
    return;
  }
  this.game.dismissEnemyIntel(button.dataset.enemyIntelClose);
  this.sync();
});
```

- [ ] **Step 6: Add CSS**

Append to `src/styles.css`:

```css
.enemy-intel-panel {
  position: fixed;
  right: 16px;
  bottom: 148px;
  width: 280px;
  z-index: 20;
  padding: 14px;
  border: 1px solid #5fc9ff;
  background: rgba(11, 15, 21, 0.94);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
}

.enemy-intel-panel.hidden {
  display: none;
}

.enemy-intel-panel h2 {
  margin: 0 28px 10px 0;
  font-size: 16px;
}

.enemy-intel-panel dl {
  display: grid;
  gap: 6px;
  margin: 0 0 10px;
}

.enemy-intel-panel dl div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.enemy-intel-panel dt {
  color: #7f90a5;
}

.enemy-intel-panel dd {
  margin: 0;
  font-weight: 800;
}

.enemy-intel-panel p {
  margin: 0 0 10px;
  color: #9fb0c4;
  font-size: 12px;
}

.enemy-intel-close {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 26px;
  height: 26px;
}

.enemy-intel-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.enemy-intel-tags span {
  padding: 2px 6px;
  border: 1px solid #344454;
  color: #f6c445;
  font-size: 11px;
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
node --test tests/game.test.js tests/browser-adapters.test.js
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/Game.js src/ui/UIController.js src/styles.css tests/game.test.js tests/browser-adapters.test.js
git commit -m "Add first seen enemy intel panel"
```

## Task 8: Final Browser Verification And Polish

**Files:**
- Modify only files required by browser findings.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run build
```

Expected: both commands complete successfully.

- [ ] **Step 2: Start dev server**

Run:

```bash
npm run dev -- --port 5177
```

Expected: Vite reports a local URL. Use the actual reported port if `5177` is occupied.

- [ ] **Step 3: Browser check battle page**

Open the local URL and verify:

- Battle page loads with no console errors.
- Selecting a deck card twice cancels selection.
- Deploying and retreating an operator shows redeploy cooldown.
- Operator tokens show HP and SP bars.
- A first-seen enemy intel panel appears after battle starts.
- Attack/death effects are visible in a short combat.
- Wave route warning appears before a scheduled wave.

- [ ] **Step 4: Fix browser-only issues with tests first when feasible**

If a browser issue is found, add a focused test to the closest test file before changing production code:

- UI model issue: `tests/browser-adapters.test.js`
- Combat/game state issue: `tests/game.test.js` or `tests/combat-flow.test.js`
- Deployment issue: `tests/deployment-cost.test.js`

Run the focused test, implement the fix, and rerun `npm test`.

- [ ] **Step 5: Commit final polish**

```bash
git add src tests
git commit -m "Polish battle feedback mechanics"
```

Only create this commit if Step 4 produced changes.

## Self-Review

Spec coverage:

- Enemy death animation: Task 1 creates effects, Task 5 emits and renders death effects.
- Operator attack animation: Task 1 creates effects, Task 5 emits and renders attack effects.
- Wave route warning: Task 5 adds warning detection, effect creation, and rendering.
- Enemy range and ranged attacks: Task 2 normalizes range, Task 3 implements ranged enemy attacks.
- Block bypass: Task 3 implements `blockBypass > operator.block`.
- Multi-phase enemies: Task 2 adds runtime phases, Task 4 adds phase transitions and final rewards.
- Operator SP bars: Task 6 adds SP bar model and Canvas drawing.
- Cancel selected deployment: Task 6 adds `toggleOperatorSelection`.
- Deploy limit display: Task 6 adds map `deployLimit` to system and status UI.
- Retreat cooldown: Task 6 adds template cooldown tracking and deck display.
- First-seen enemy intel: Task 7 adds queue, model, UI, and close action.

Placeholder scan:

- No incomplete markers or unspecified implementation steps are present.
- Deferred map library/editor leave-warning items remain explicitly out of scope in the approved spec.

Type consistency:

- `blockBypass`, `damageType`, `targeting`, `range`, and `phases` are normalized on enemy templates and copied to runtime `Enemy`.
- `EffectSystem` exposes `add`, `tick`, `list`, and `clear`, and `Game.getState()` exposes `effects`.
- `buildOperatorSpBarModel` is exported from `UIController` and imported by `CanvasRenderer`.
