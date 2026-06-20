import test from 'node:test';
import assert from 'node:assert/strict';
import { createCostSystem } from '../src/systems/CostSystem.js';
import { createDeploymentSystem } from '../src/systems/DeploymentSystem.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';
import { normalizeMap } from '../src/data/MapLoader.js';

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

test('default specialist can deploy on ground and high tiles', () => {
  const cost = createCostSystem({ initialCost: 30, maxCost: 30 });
  const deployment = createDeploymentSystem({ map, costSystem: cost, operatorCatalog: DEFAULT_OPERATORS });

  const ground = deployment.deploy('specialist', { x: 0, y: 0 });
  const high = deployment.deploy('specialist', { x: 1, y: 0 });
  const wall = deployment.canDeploy('specialist', { x: 0, y: 1 });

  assert.equal(ground.ok, true);
  assert.equal(high.ok, true);
  assert.equal(wall.ok, false);
  assert.match(wall.reason, /path|high/);
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

test('vanguard passive restores two cost every three seconds', () => {
  const cost = createCostSystem({ initialCost: 8, maxCost: 30 });
  const deployment = createDeploymentSystem({ map, costSystem: cost, operatorCatalog: DEFAULT_OPERATORS });
  deployment.deploy('vanguard', { x: 0, y: 0 });

  cost.tick(2.9, deployment.operators);
  assert.equal(cost.current, 2);
  cost.tick(0.2, deployment.operators);
  assert.equal(cost.current, 5);
});

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

test('clear removes deployed operators and redeploy cooldowns', () => {
  const cost = createCostSystem({ initialCost: 30, maxCost: 30 });
  const deployment = createDeploymentSystem({ map, costSystem: cost, operatorCatalog: DEFAULT_OPERATORS });
  const placed = deployment.deploy('vanguard', { x: 0, y: 0 });
  deployment.deploy('sniper', { x: 1, y: 0 });

  deployment.retreat(placed.operator.id);
  assert.equal(deployment.redeployCooldowns.vanguard > 0, true);

  deployment.clear();

  assert.equal(deployment.operators.length, 0);
  assert.deepEqual(deployment.redeployCooldowns, {});
});

test('deployment rejects path entry exit and forbidden path tiles', () => {
  const deployMap = normalizeMap({
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
    map: deployMap,
    costSystem: createCostSystem({ initialCost: 30, maxCost: 30 }),
    operatorCatalog: DEFAULT_OPERATORS
  });

  assert.equal(deployment.canDeploy('vanguard', { x: 0, y: 0 }).ok, false);
  assert.equal(deployment.canDeploy('vanguard', { x: 1, y: 0 }).ok, false);
  assert.equal(deployment.canDeploy('vanguard', { x: 3, y: 0 }).ok, false);
  assert.equal(deployment.canDeploy('vanguard', { x: 2, y: 0 }).ok, true);
});
