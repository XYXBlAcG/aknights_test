import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDamageComponents,
  calculateComponentDamage,
  effectiveDefense,
  effectiveResistance,
  normalizeDamageComponent
} from '../src/systems/DamageSystem.js';

test('physical damage uses defense with five percent minimum damage', () => {
  assert.equal(calculateComponentDamage({ type: 'physical', value: 80 }, { defense: 25, resistance: 0 }), 55);
  assert.equal(calculateComponentDamage({ type: 'physical', value: 20 }, { defense: 25, resistance: 0 }), 1);
  assert.equal(calculateComponentDamage({ type: 'physical', value: 100 }, { defense: 200, resistance: 0 }), 5);
});

test('physical damage supports attack modifiers damage multiplier and penetration', () => {
  assert.equal(calculateComponentDamage({
    type: 'physical',
    value: 100,
    attackMultiplier: 1.5,
    flatAttack: 20,
    penetrationPercent: 0.5,
    penetrationFlat: 10,
    damageMultiplier: 2
  }, { defense: 80 }), 270);
});

test('arts damage uses resistance from 0 to 100 with five percent minimum damage', () => {
  assert.equal(calculateComponentDamage({ type: 'arts', value: 80 }, { defense: 0, resistance: 25 }), 60);
  assert.equal(calculateComponentDamage({ type: 'arts', value: 80 }, { defense: 0, resistance: 100 }), 4);
});

test('arts damage supports penetration and damage multiplier', () => {
  assert.equal(calculateComponentDamage({
    type: 'arts',
    value: 100,
    penetrationPercent: 0.5,
    penetrationFlat: 20,
    damageMultiplier: 1.5
  }, { resistance: 80 }), 105);
});

test('damage components never heal through negative modified attack', () => {
  const target = { hp: 100, maxHp: 100, defense: 0, resistance: 0 };
  const result = applyDamageComponents([{ type: 'physical', value: 20, flatAttack: -80 }], target);

  assert.equal(result.hpDamage, 0);
  assert.equal(target.hp, 100);
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

test('neural damage uses neural resistance before filling the bar', () => {
  const target = { hp: 200, maxHp: 200, defense: 0, resistance: 0, neuralResistance: 50, neuralDamage: 0, neuralThreshold: 100 };
  const result = applyDamageComponents([{ type: 'neural', value: 80 }], target);

  assert.equal(result.neuralDamage, 40);
  assert.equal(target.neuralDamage, 40);
  assert.equal(target.hp, 200);
});

test('heal components restore hp with healing multiplier without exceeding max hp', () => {
  const target = { hp: 50, maxHp: 120, defense: 0, resistance: 0 };
  const result = applyDamageComponents([{ type: 'heal', value: 30, damageMultiplier: 2 }], target);

  assert.equal(result.healing, 60);
  assert.equal(target.hp, 110);
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
  assert.deepEqual(normalizeDamageComponent({
    type: 'arts',
    value: '12',
    attackMultiplier: '1.5',
    flatAttack: '3',
    damageMultiplier: '2',
    penetrationPercent: '0.25',
    penetrationFlat: '4'
  }), {
    type: 'arts',
    value: 12,
    attackMultiplier: 1.5,
    flatAttack: 3,
    damageMultiplier: 2,
    penetrationPercent: 0.25,
    penetrationFlat: 4
  });
  assert.deepEqual(normalizeDamageComponent({ type: 'heal', value: '20' }), { type: 'heal', value: 20 });
  assert.throws(() => normalizeDamageComponent({ type: 'true-damage', value: 10 }), /damage component type/);
});
