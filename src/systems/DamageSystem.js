const DAMAGE_TYPES = new Set(['physical', 'arts', 'neural', 'heal']);
const NEURAL_BURST_HP_RATIO = 0.25;

export function normalizeDamageComponent(component) {
  if (!DAMAGE_TYPES.has(component?.type)) {
    throw new Error('damage component type must be physical, arts, neural, or heal');
  }
  const value = Number(component.value);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('damage component value must be a non-negative number');
  }
  const normalized = { type: component.type, value };
  [
    ['attackMultiplier', 0, Infinity],
    ['flatAttack', -Infinity, Infinity],
    ['damageMultiplier', 0, Infinity],
    ['penetrationPercent', 0, 1],
    ['penetrationFlat', 0, Infinity]
  ].forEach(([field, min, max]) => {
    if (!Object.hasOwn(component, field)) {
      return;
    }
    const number = Number(component[field]);
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new Error(`damage component ${field} must be a valid number`);
    }
    normalized[field] = number;
  });
  return normalized;
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
  const attack = basicDamage(normalized);
  const multiplier = damageMultiplier(normalized);
  if (normalized.type === 'physical') {
    const effectiveArmor = (1 - penetrationPercent(normalized)) * Math.max(0, effectiveDefense(target) - penetrationFlat(normalized));
    return Math.round(Math.max(attack * 0.05, attack - effectiveArmor) * multiplier);
  }
  if (normalized.type === 'arts') {
    const effectiveRes = (1 - penetrationPercent(normalized)) * Math.max(0, effectiveResistance(target) - penetrationFlat(normalized));
    return Math.round(Math.max(attack * 0.05, attack * 0.01 * Math.max(0, 100 - effectiveRes)) * multiplier);
  }
  if (normalized.type === 'neural') {
    const resistance = effectiveNeuralResistance(target);
    return Math.round(Math.max(attack * 0.05, attack * 0.01 * Math.max(0, 100 - resistance)) * multiplier);
  }
  return 0;
}

export function applyDamageComponents(components, target) {
  const result = { hpDamage: 0, neuralDamage: 0, neuralBurstDamage: 0, healing: 0 };
  components.map(normalizeDamageComponent).forEach((component) => {
    if (component.type === 'heal') {
      const previousHp = Number(target.hp ?? 0);
      target.hp = Math.min(Number(target.maxHp ?? previousHp), previousHp + Math.round(basicDamage(component) * damageMultiplier(component)));
      result.healing += Math.max(0, target.hp - previousHp);
      return;
    }
    if (component.type === 'neural') {
      const damage = calculateComponentDamage(component, target);
      result.neuralDamage += damage;
      applyNeuralDamage(target, damage, result);
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

function basicDamage(component) {
  return Math.max(0, Number(component.value ?? 0) * Number(component.attackMultiplier ?? 1) + Number(component.flatAttack ?? 0));
}

function damageMultiplier(component) {
  return Number(component.damageMultiplier ?? 1);
}

function penetrationPercent(component) {
  return Math.max(0, Math.min(1, Number(component.penetrationPercent ?? 0)));
}

function penetrationFlat(component) {
  return Math.max(0, Number(component.penetrationFlat ?? 0));
}

function effectiveNeuralResistance(target) {
  const base = Number(target?.neuralResistance ?? target?.elementalResistance ?? 0);
  const bonus = (target?.defenseModules ?? []).reduce((sum, module) => {
    return sum + Number(module.neuralResistanceDelta ?? module.elementalResistanceDelta ?? 0);
  }, 0);
  return Math.max(0, Math.min(100, base + bonus));
}
