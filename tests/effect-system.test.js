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
