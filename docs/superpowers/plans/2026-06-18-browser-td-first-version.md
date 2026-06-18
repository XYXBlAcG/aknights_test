# Browser TD First Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable 2D Canvas browser tower-defense prototype described in `docs/superpowers/specs/2026-06-18-arknights-like-browser-td-design.md`.

**Architecture:** Use Vite with native ES modules. Keep game rules in pure JavaScript modules that can be tested with Node's built-in test runner; keep Canvas rendering and DOM UI as thin adapters over the same game state.

**Tech Stack:** HTML5, CSS3, JavaScript ES Modules, Vite, Node `node:test`.

---

## Scope

This plan implements first-version MVP only:

- 2D Canvas battle screen.
- Three default maps.
- JSON map loading with v1/v2 normalization.
- Six operator classes.
- Three enemy types.
- Deployment, selection, retreat, range preview.
- Path movement, blocking, attacks, healing, cost, waves, lives, victory/defeat, two/three-star result.
- Pause, restart, and speed cycling.

The plan does not implement Three.js mode, map editor, custom editor, gacha, progression, active skills, or story systems.

## File Structure

- `package.json`: Vite and test scripts.
- `index.html`: App shell.
- `src/main.js`: Browser entry point.
- `src/styles.css`: Tactical terminal-style layout.
- `src/core/Game.js`: Orchestrates state, systems, input commands, and ticking.
- `src/core/GameLoop.js`: Browser animation loop with pause-safe delta handling.
- `src/data/defaultOperators.js`: Six operator templates.
- `src/data/defaultEnemies.js`: Three enemy templates.
- `src/data/MapLoader.js`: Load, validate, and normalize maps.
- `src/entities/Operator.js`: Operator runtime model.
- `src/entities/Enemy.js`: Enemy runtime model.
- `src/systems/CostSystem.js`: Natural regen, rewards, vanguard passive, spend/refund.
- `src/systems/WaveSystem.js`: Timeline event scheduling and enemy spawning.
- `src/systems/DeploymentSystem.js`: Placement legality, deploy, retreat, limits.
- `src/systems/BlockingSystem.js`: Ground enemy blocking and release.
- `src/systems/CombatSystem.js`: Targeting, damage, healing, death handling.
- `src/systems/WinLoseSystem.js`: Victory, defeat, stars.
- `src/renderers/CanvasRenderer.js`: Grid, paths, units, enemies, previews, ranges.
- `src/ui/UIController.js`: DOM events, top bar, operator deck, info panel, controls, modal.
- `src/utils/GridMath.js`: Coordinate conversion and range helpers.
- `src/utils/PathMath.js`: Path interpolation helpers.
- `src/utils/Logger.js`: Toggleable logging.
- `maps/training-ground.json`: Beginner single-route map.
- `maps/crossroads.json`: Two-route pressure map.
- `maps/maze-fortress.json`: Long-route mixed threat map.
- `tests/*.test.js`: Node tests for pure systems.

## Task 1: Project Scaffold and Test Harness

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/styles.css`
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Write the failing smoke test**

Create `tests/smoke.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { manhattanDistance } from '../src/utils/GridMath.js';

test('manhattanDistance returns grid distance between two cells', () => {
  assert.equal(manhattanDistance({ x: 1, y: 2 }, { x: 4, y: 6 }), 7);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test`

Expected: failure because `package.json` and `src/utils/GridMath.js` do not exist yet.

- [ ] **Step 3: Add minimal scaffold and utility**

Create `package.json` with scripts:

```json
{
  "name": "aknights-test",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "node --test tests"
  },
  "devDependencies": {
    "vite": "^5.4.0"
  }
}
```

Create `src/utils/GridMath.js`:

```js
export function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
```

Create a minimal `index.html`, `src/main.js`, and `src/styles.css` so Vite can load a blank app shell.

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm test`

Expected: one passing test.

- [ ] **Step 5: Install dependencies and build baseline**

Run: `npm install`

Run: `npm run build`

Expected: Vite build succeeds and emits `dist/`.

## Task 2: Map Loading and Geometry

**Files:**
- Modify: `src/utils/GridMath.js`
- Create: `src/utils/PathMath.js`
- Create: `src/data/MapLoader.js`
- Create: `maps/training-ground.json`
- Create: `maps/crossroads.json`
- Create: `maps/maze-fortress.json`
- Create: `tests/map-loader.test.js`

- [ ] **Step 1: Write failing map tests**

Create `tests/map-loader.test.js` with cases for:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMap, validateMap } from '../src/data/MapLoader.js';
import { isCellInDiamondRange, pathPositionAtDistance } from '../src/utils/GridMath.js';

test('normalizeMap converts v1 path into v2 paths and timeline shape', () => {
  const map = normalizeMap({
    version: '1.0',
    id: 'legacy',
    name: 'Legacy',
    width: 2,
    height: 1,
    initialCost: 10,
    maxCost: 30,
    maxLives: 3,
    totalWaves: 1,
    grid: [['path', 'path']],
    path: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1 }]
  });

  assert.equal(map.version, '2.0');
  assert.equal(map.paths[0].id, 'main');
  assert.equal(map.timeline[0].pathId, 'main');
});

test('validateMap rejects path points outside the grid', () => {
  assert.throws(() => validateMap({
    version: '2.0',
    id: 'bad',
    name: 'Bad',
    width: 1,
    height: 1,
    initialCost: 10,
    maxCost: 30,
    maxLives: 3,
    totalWaves: 1,
    grid: [['path']],
    paths: [{ id: 'main', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1, pathId: 'main' }]
  }), /outside grid/);
});

test('diamond range uses Manhattan distance', () => {
  assert.equal(isCellInDiamondRange({ x: 0, y: 0 }, { x: 2, y: 1 }, 3), true);
  assert.equal(isCellInDiamondRange({ x: 0, y: 0 }, { x: 3, y: 1 }, 3), false);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: failures for missing exports.

- [ ] **Step 3: Implement map normalization, validation, and geometry**

Implement:

- `normalizeMap(rawMap)`.
- `validateMap(map)`.
- `loadMap(url, fetcher = fetch)`.
- `isCellInDiamondRange(origin, target, radius)`.
- `gridToPixel(cell, tileSize)`.
- `pixelToGrid(point, tileSize)`.
- `pathLength(points)`.
- `pathPositionAtDistance(points, distance)`.

- [ ] **Step 4: Add three default map JSON files**

Each map must pass `validateMap()` and include v2 fields: `version`, `id`, `name`, `width`, `height`, `initialCost`, `maxCost`, `maxLives`, `totalWaves`, `grid`, `paths`, and `timeline`.

- [ ] **Step 5: Run GREEN**

Run: `npm test`

Expected: all map and smoke tests pass.

## Task 3: Catalogs, Entities, Cost, and Deployment

**Files:**
- Create: `src/data/defaultOperators.js`
- Create: `src/data/defaultEnemies.js`
- Create: `src/entities/Operator.js`
- Create: `src/entities/Enemy.js`
- Create: `src/systems/CostSystem.js`
- Create: `src/systems/DeploymentSystem.js`
- Create: `tests/deployment-cost.test.js`

- [ ] **Step 1: Write failing system tests**

Create `tests/deployment-cost.test.js` with cases for:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCostSystem } from '../src/systems/CostSystem.js';
import { createDeploymentSystem } from '../src/systems/DeploymentSystem.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';

const map = {
  width: 2,
  height: 2,
  grid: [['path', 'high'], ['wall', 'path']],
  initialCost: 12,
  maxCost: 30
};

test('deployment spends cost and rejects wrong terrain', () => {
  const cost = createCostSystem({ initialCost: 12, maxCost: 30 });
  const deployment = createDeploymentSystem({ map, costSystem: cost, operatorCatalog: DEFAULT_OPERATORS });

  const result = deployment.deploy('sniper', { x: 0, y: 0 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /high/);

  const placed = deployment.deploy('vanguard', { x: 0, y: 0 });
  assert.equal(placed.ok, true);
  assert.equal(cost.current, 4);
});

test('retreat removes operator and refunds half cost', () => {
  const cost = createCostSystem({ initialCost: 12, maxCost: 30 });
  const deployment = createDeploymentSystem({ map, costSystem: cost, operatorCatalog: DEFAULT_OPERATORS });
  const placed = deployment.deploy('vanguard', { x: 0, y: 0 });

  const retreated = deployment.retreat(placed.operator.id);

  assert.equal(retreated.ok, true);
  assert.equal(deployment.operators.length, 0);
  assert.equal(cost.current, 8);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: failures for missing catalogs and systems.

- [ ] **Step 3: Implement catalogs and runtime models**

Define six default operators with IDs `vanguard`, `guard`, `defender`, `sniper`, `caster`, `medic`; define enemy templates `infantry`, `heavy`, `drone`.

Runtime `Operator` instances must track deployment cell, HP, attack timers, blocked enemies, class limits, and trait timers. Runtime `Enemy` instances must track path ID, path distance, HP, movement, blocked state, and attack timer.

- [ ] **Step 4: Implement cost and deployment systems**

`CostSystem` methods:

- `canSpend(amount)`.
- `spend(amount)`.
- `add(amount)`.
- `refund(amount)`.
- `tick(deltaSeconds, operators)`.

`DeploymentSystem` methods:

- `canDeploy(operatorType, cell)`.
- `deploy(operatorType, cell)`.
- `retreat(operatorId)`.
- `getOperatorAt(cell)`.
- `clear()`.

- [ ] **Step 5: Run GREEN**

Run: `npm test`

Expected: deployment and cost tests pass.

## Task 4: Waves, Blocking, Combat, and Win/Lose

**Files:**
- Create: `src/systems/WaveSystem.js`
- Create: `src/systems/BlockingSystem.js`
- Create: `src/systems/CombatSystem.js`
- Create: `src/systems/WinLoseSystem.js`
- Create: `tests/combat-flow.test.js`

- [ ] **Step 1: Write failing combat-flow tests**

Create `tests/combat-flow.test.js` with cases for:

```js
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
  const ground = { id: 'e1', cell: { x: 0, y: 0 }, isFlying: false, blockedBy: null };
  const flying = { id: 'e2', cell: { x: 0, y: 0 }, isFlying: true, blockedBy: null };

  blocking.update([placed], [ground, flying]);

  assert.equal(ground.blockedBy, placed.id);
  assert.equal(flying.blockedBy, null);
});

test('win lose evaluator distinguishes victory stars and defeat', () => {
  assert.equal(evaluateBattleResult({ lives: 0, leaks: 3, wavesComplete: false, enemiesRemaining: 2 }).state, 'defeat');
  assert.equal(evaluateBattleResult({ lives: 1, leaks: 0, wavesComplete: true, enemiesRemaining: 0 }).stars, 3);
  assert.equal(evaluateBattleResult({ lives: 1, leaks: 1, wavesComplete: true, enemiesRemaining: 0 }).stars, 2);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: failures for missing systems.

- [ ] **Step 3: Implement wave, blocking, combat, and result systems**

Implement:

- Timeline event scheduling with per-enemy interval.
- Ground enemy blocking by operator block capacity.
- Flying enemy bypass.
- Physical and arts damage with minimum damage.
- Medic healing lowest HP percent ground operator.
- Death removal and reward callback.
- Victory, defeat, and star evaluation.

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: all pure system tests pass.

## Task 5: Game Orchestrator

**Files:**
- Create: `src/core/Game.js`
- Create: `src/core/GameLoop.js`
- Create: `tests/game.test.js`

- [ ] **Step 1: Write failing game tests**

Create `tests/game.test.js` with cases for:

```js
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
```

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: failure for missing `Game`.

- [ ] **Step 3: Implement `Game` API**

`Game` public methods:

- `start()`.
- `pause()`.
- `resume()`.
- `restart()`.
- `setSpeed(multiplier)`.
- `cycleSpeed()`.
- `selectOperator(operatorType)`.
- `clearSelection()`.
- `deployOperator(operatorType, cell)`.
- `retreatOperator(operatorId)`.
- `selectPlacedOperator(operatorId)`.
- `tick(deltaSeconds)`.
- `getState()`.

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: all tests pass.

## Task 6: Canvas Renderer and UI Controller

**Files:**
- Create: `src/renderers/CanvasRenderer.js`
- Create: `src/ui/UIController.js`
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Modify: `index.html`

- [ ] **Step 1: Add browser shell markup**

`index.html` must expose:

- `#app`.
- `#battlefield`.
- `#top-status`.
- `#operator-deck`.
- `#info-panel`.
- `#control-panel`.
- `#result-modal`.

- [ ] **Step 2: Implement Canvas renderer**

Renderer responsibilities:

- Draw grid tiles by type.
- Draw path lines.
- Draw operators and enemies with class/type labels.
- Draw selected operator range.
- Draw deployment preview and invalid placement.
- Draw HP bars and blocked counts.

- [ ] **Step 3: Implement UI controller**

Controller responsibilities:

- Populate map selector and operator deck.
- Wire left click to select/deploy/select placed operator.
- Wire right click to retreat and prevent context menu.
- Wire pointer move to hover preview.
- Wire start/pause/restart/speed controls.
- Update top bar, deck disabled states, info panel, and result modal.

- [ ] **Step 4: Manual browser check**

Run: `npm run dev`

Expected:

- Browser loads battle screen.
- Selecting an operator highlights legal tiles.
- Deploying spends cost.
- Start begins spawning enemies.
- Pause and speed controls update state.

## Task 7: Maps, Visual Polish, and First-Version Balancing

**Files:**
- Modify: `maps/training-ground.json`
- Modify: `maps/crossroads.json`
- Modify: `maps/maze-fortress.json`
- Modify: `src/styles.css`
- Modify: `src/data/defaultOperators.js`
- Modify: `src/data/defaultEnemies.js`

- [ ] **Step 1: Tune maps against MVP goals**

Training Ground:

- Single route.
- 3 waves.
- Teaches ground blocker, sniper, caster/defender.

Crossroads:

- Two paths.
- 4 waves.
- Forces central ground defense and high-tile coverage.

Maze Fortress:

- Longer route.
- 5 waves.
- Mixes heavy and drone pressure.

- [ ] **Step 2: Apply tactical-terminal visual polish**

Use compact panels, dark neutral surfaces, cyan/yellow/red state colors, readable grid contrast, and no decorative landing page.

- [ ] **Step 3: Build and manually validate**

Run: `npm run build`

Run: `npm test`

Expected: build succeeds and all tests pass.

## Task 8: Final Verification and Commit

**Files:**
- Modify as needed based on verification defects.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run build
```

Expected:

- All tests pass.
- Vite build exits 0.

- [ ] **Step 2: Run local dev server for user testing**

Run: `npm run dev -- --host 127.0.0.1`

Expected: dev server prints a localhost URL.

- [ ] **Step 3: Report manual smoke-test results**

Check:

- New Training Ground can be started.
- At least one operator can be deployed.
- Enemies spawn and move.
- Blocking occurs for ground enemies.
- Flying enemies bypass blocking.
- Victory or defeat modal can appear.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add package.json package-lock.json index.html src maps tests docs/superpowers/plans/2026-06-18-browser-td-first-version.md
git commit -m "Implement first playable tower defense prototype"
```

Expected: commit succeeds on `codex/first-version`.

