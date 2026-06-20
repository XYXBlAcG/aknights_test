import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMap } from '../src/data/MapLoader.js';
import { DEFAULT_ENEMIES } from '../src/data/defaultEnemies.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';

const mapFiles = [
  ['training-ground', '../maps/training-ground.json', 3],
  ['crossroads', '../maps/crossroads.json', 4],
  ['maze-fortress', '../maps/maze-fortress.json', 5]
];

const experimentalMapFiles = [
  ['neural-damage-lab', '../maps/neural-damage-lab.json'],
  ['restricted-entry-test', '../maps/restricted-entry-test.json'],
  ['high-value-breakthrough', '../maps/high-value-breakthrough.json'],
  ['crisis-killzone', '../maps/crisis-killzone.json']
];

test('default maps normalize and preserve intended wave counts', () => {
  mapFiles.forEach(([expectedId, path, expectedWaves]) => {
    const raw = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
    const map = normalizeMap(raw);

    assert.equal(map.id, expectedId);
    assert.equal(map.totalWaves, expectedWaves);
    assert.equal(map.paths.length >= 1, true);
    assert.equal(map.timeline.length >= expectedWaves, true);
  });
});

test('default maps start with enough cost for two early deployments', () => {
  const vanguardSniperCost = DEFAULT_OPERATORS.vanguard.cost + DEFAULT_OPERATORS.sniper.cost;

  mapFiles.forEach(([, path]) => {
    const raw = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
    const map = normalizeMap(raw);

    assert.equal(map.initialCost >= vanguardSniperCost, true);
  });
});

test('experimental maps normalize and showcase upgraded mechanics', () => {
  const neural = normalizeMap(readMap('../maps/neural-damage-lab.json'));
  const restricted = normalizeMap(readMap('../maps/restricted-entry-test.json'));
  const highValue = normalizeMap(readMap('../maps/high-value-breakthrough.json'));
  const crisis = normalizeMap(readMap('../maps/crisis-killzone.json'));

  assert.ok(neural.timeline.some((event) => event.enemyType.includes('neural')));
  assert.ok(Object.values(restricted.tileMeta).some((meta) => meta.deployable === false));
  assert.ok(highValue.paths.some((path) => path.waypointActions?.length > 0));
  assert.ok(crisis.timeline.some((event) => event.enemyType === 'crisis-avenger'));
  assert.equal(crisis.totalWaves >= 5, true);

  experimentalMapFiles.forEach(([expectedId, path]) => {
    const map = normalizeMap(readMap(path));
    assert.equal(map.id, expectedId);
    map.timeline.forEach((event) => {
      assert.ok(DEFAULT_ENEMIES[event.enemyType], `missing default enemy ${event.enemyType}`);
    });
  });
});

function readMap(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}
