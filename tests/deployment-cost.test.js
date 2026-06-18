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
