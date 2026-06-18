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

test('effect system owns record identity timing payload snapshots and clearing', () => {
  const effects = createEffectSystem();
  const source = { x: 1, y: 1 };
  const target = { x: 3, y: 1 };
  const payload = { source, target, color: '#f6c445' };

  const created = effects.add({
    id: 'caller-id',
    type: 'operator_attack',
    elapsed: 99,
    duration: 1,
    payload,
    ignored: true
  });
  payload.source.x = 9;
  created.payload.target.x = 8;

  assert.equal(created.id, 'effect-1');
  assert.equal(created.elapsed, 0);
  assert.deepEqual(Object.keys(created).sort(), ['duration', 'elapsed', 'id', 'payload', 'type']);
  assert.deepEqual(effects.list()[0], {
    id: 'effect-1',
    type: 'operator_attack',
    elapsed: 0,
    duration: 1,
    payload: {
      source: { x: 1, y: 1 },
      target: { x: 3, y: 1 },
      color: '#f6c445'
    }
  });

  const listed = effects.list();
  listed[0].elapsed = 0.5;
  listed[0].payload.source.x = 7;

  assert.deepEqual(effects.list()[0], {
    id: 'effect-1',
    type: 'operator_attack',
    elapsed: 0,
    duration: 1,
    payload: {
      source: { x: 1, y: 1 },
      target: { x: 3, y: 1 },
      color: '#f6c445'
    }
  });
  assert.deepEqual(created.payload, {
    source: { x: 1, y: 1 },
    target: { x: 8, y: 1 },
    color: '#f6c445'
  });

  const freshEffects = createEffectSystem();
  const fresh = freshEffects.add(createEnemyDeathEffect({ cell: { x: 0, y: 0 } }));
  assert.equal(fresh.id, 'effect-1');

  effects.clear();
  assert.deepEqual(effects.list(), []);
});
