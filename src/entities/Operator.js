import { normalizeDirection } from '../utils/RangeMath.js';

let operatorSequence = 0;

export class Operator {
  constructor(template, cell, direction = 'right') {
    operatorSequence += 1;
    this.id = `${template.id}-${operatorSequence}`;
    this.templateId = template.id;
    this.name = template.name;
    this.class = template.class;
    this.className = template.className;
    this.deployType = template.deployType;
    this.deployTypes = structuredClone(template.deployTypes ?? [template.deployType]);
    this.cost = template.cost;
    this.maxHp = template.maxHp;
    this.hp = template.maxHp;
    this.attack = template.attack;
    this.defense = template.defense;
    this.resistance = normalizeRuntimeResistance(template.resistance ?? 0);
    this.attackInterval = template.attackInterval;
    this.spOnAttack = Number(template.spOnAttack ?? 0);
    this.normalAttack = resolveNormalAttack(template, 'exit-first');
    this.attackTimer = this.normalAttack.interval;
    this.block = template.block;
    this.blockedEnemies = [];
    this.damageType = template.damageType;
    this.range = this.normalAttack.range;
    this.targeting = this.normalAttack.targeting;
    this.trait = template.trait;
    this.effects = structuredClone(template.effects ?? []);
    this.skills = (template.skills ?? [template.skill].filter(Boolean)).map(createSkillState);
    this.skill = this.skills[0] ?? null;
    this.color = template.color;
    this.cell = { x: cell.x, y: cell.y };
    this.direction = normalizeDirection(direction);
    this.traitTimer = 0;
    this.neuralDamage = 0;
    this.neuralThreshold = template.neuralThreshold ?? 100;
  }

  get isDead() {
    return this.hp <= 0;
  }

  get blockedCount() {
    return this.blockedEnemies.length;
  }

  canBlockMore() {
    return this.blockedCount < this.block;
  }
}

function createSkillState(skill) {
  return {
    ...skill,
    effect: skill.effect ? { ...skill.effect } : {},
    range: skill.range ? structuredClone(skill.range) : null,
    triggerMode: skill.triggerMode ?? 'manual',
    sp: Number(skill.sp ?? 0),
    activeRemaining: Number(skill.activeRemaining ?? 0),
    ammo: Number(skill.ammo ?? 0),
    ammoRemaining: Number(skill.ammoRemaining ?? 0),
    nextAttackMultiplier: null
  };
}

function resolveNormalAttack(template, defaultTargeting) {
  const legacy = legacyNormalAttack(template, defaultTargeting);
  if (!template.normalAttack || isLikelyInheritedNormalAttack(template.normalAttack, legacy)) {
    return legacy;
  }
  return {
    interval: Number(template.normalAttack.interval ?? template.attackInterval ?? 1.5),
    range: structuredClone(template.normalAttack.range ?? template.range),
    targeting: template.normalAttack.targeting ?? template.targeting ?? defaultTargeting,
    components: structuredClone(template.normalAttack.components ?? []),
    effects: structuredClone(template.normalAttack.effects ?? [])
  };
}

function legacyNormalAttack(template, defaultTargeting) {
  const damageType = template.damageType ?? 'physical';
  const components = damageType === 'physical' || damageType === 'arts'
    ? [{ type: damageType, value: Number(template.attack ?? 0) }]
    : [];
  const effects = damageType === 'heal'
    ? [{ type: 'heal', value: Number(template.attack ?? 0) }]
    : [];
  return {
    interval: Number(template.attackInterval ?? template.normalAttack?.interval ?? 1.5),
    range: structuredClone(template.range ?? template.normalAttack?.range),
    targeting: template.targeting ?? template.normalAttack?.targeting ?? defaultTargeting,
    components,
    effects
  };
}

function isLikelyInheritedNormalAttack(normalAttack, legacy) {
  const components = normalAttack.components ?? [];
  if (components.some((component) => component.id)) {
    return false;
  }
  const hasOnlyLegacyComponent = components.length <= 1 && components.every((component) => component.type === 'physical' || component.type === 'arts');
  const hasOnlyLegacyEffects = (normalAttack.effects ?? []).every((effect) => effect.type === 'heal');
  if (!hasOnlyLegacyComponent || !hasOnlyLegacyEffects) {
    return false;
  }
  return normalAttack.interval !== legacy.interval
    || JSON.stringify(normalAttack.range) !== JSON.stringify(legacy.range)
    || normalAttack.targeting !== legacy.targeting
    || JSON.stringify(components) !== JSON.stringify(legacy.components)
    || JSON.stringify(normalAttack.effects ?? []) !== JSON.stringify(legacy.effects);
}

function normalizeRuntimeResistance(value) {
  const number = Number(value ?? 0);
  return number > 0 && number <= 1 ? Math.round(number * 100) : number;
}

export function resetOperatorSequence() {
  operatorSequence = 0;
}
