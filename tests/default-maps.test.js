import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMap } from '../src/data/MapLoader.js';
import { DEFAULT_OPERATORS } from '../src/data/defaultOperators.js';

const mapFiles = [
  ['training-ground', '../maps/training-ground.json', 3],
  ['crossroads', '../maps/crossroads.json', 4],
  ['maze-fortress', '../maps/maze-fortress.json', 5]
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
