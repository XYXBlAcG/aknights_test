import { normalizeRange } from '../utils/RangeMath.js';

const ID_PATTERN = /^[a-z0-9_-]+$/;
const OPERATOR_CLASSES = new Set(['vanguard', 'guard', 'defender', 'sniper', 'caster', 'specialist', 'medic', 'custom']);
const DEPLOY_TYPES = new Set(['ground', 'high']);
const DAMAGE_TYPES = new Set(['physical', 'arts', 'heal']);
const DAMAGE_COMPONENT_TYPES = new Set(['physical', 'arts', 'neural', 'heal']);
const TARGETING_TYPES = new Set(['blocked-first', 'exit-first', 'flying-first', 'high-defense', 'lowest-hp-percent']);
const ENEMY_DAMAGE_TYPES = new Set(['physical', 'arts']);
const ENEMY_TARGETING_TYPES = new Set(['blocked-first', 'nearest', 'lowest-hp-percent']);
const SKILL_TYPES = new Set(['instant_cost', 'buff', 'next_attack', 'instant_heal']);
const SKILL_TRIGGER_MODES = new Set(['manual', 'auto', 'hp_threshold']);
const MAX_SKILLS_PER_OPERATOR = 3;

export function normalizeOperatorTemplate(template) {
  const id = normalizeId(template?.id, 'operator id');
  const operatorClass = oneOf(template?.class ?? 'custom', OPERATOR_CLASSES, 'operator class');
  const deployType = oneOf(template?.deployType ?? template?.deployTypes?.[0], DEPLOY_TYPES, 'deploy type');
  const deployTypes = normalizeDeployTypes(template?.deployTypes, deployType);
  const damageType = oneOf(template?.damageType ?? damageTypeFromComponents(template?.normalAttack?.components), DAMAGE_TYPES, 'damage type');
  const normalAttack = normalizeNormalAttack(template, {
    damageType,
    attackLabel: 'attack',
    intervalLabel: 'attack interval',
    targetingTypes: TARGETING_TYPES,
    targetingLabel: 'targeting',
    defaultTargeting: defaultTargetingForDamage(damageType)
  });
  const attack = attackValueFromComponents(normalAttack.components, template?.attack);
  const targeting = normalAttack.targeting;

  const skills = normalizeSkills(template);

  return {
    id,
    name: nonEmptyString(template?.name, 'operator name'),
    class: operatorClass,
    className: nonEmptyString(template?.className ?? operatorClass, 'class name'),
    deployType,
    deployTypes,
    cost: numberInRange(template?.cost, 0, 99, 'cost'),
    maxHp: numberInRange(template?.maxHp, 1, 99999, 'max hp'),
    attack,
    defense: numberInRange(template?.defense ?? 0, 0, 99999, 'defense'),
    resistance: normalizeResistance(template?.resistance),
    attackInterval: normalAttack.interval,
    spOnAttack: numberInRange(template?.spOnAttack ?? 0, 0, 999, 'sp on attack'),
    block: integerInRange(template?.block ?? 0, 0, 10, 'block'),
    damageType,
    range: normalAttack.range,
    targeting,
    normalAttack,
    effects: normalizeEffects(template?.effects),
    trait: String(template?.trait ?? 'custom'),
    skill: skills[0] ?? null,
    skills,
    color: nonEmptyString(template?.color ?? '#5fc9ff', 'color')
  };
}

export function normalizeEnemyTemplate(template) {
  const damageType = oneOf(template?.damageType ?? damageTypeFromComponents(template?.normalAttack?.components, { allowHeal: false }) ?? 'physical', ENEMY_DAMAGE_TYPES, 'enemy damage type');
  const normalAttack = normalizeNormalAttack(template, {
    damageType,
    attackLabel: 'attack',
    intervalLabel: 'attack interval',
    targetingTypes: ENEMY_TARGETING_TYPES,
    targetingLabel: 'enemy targeting',
    defaultTargeting: 'blocked-first',
    defaultRange: { type: 'melee', radius: 0 }
  });
  const targeting = normalAttack.targeting;
  const range = normalAttack.range;
  const phaseSource = Object.hasOwn(template ?? {}, 'phases') ? template.phases : [];
  const phases = normalizeEnemyPhases(phaseSource);
  const skills = normalizeEnemySkills(template?.skills);

  return {
    id: normalizeId(template?.id, 'enemy id'),
    name: nonEmptyString(template?.name, 'enemy name'),
    maxHp: numberInRange(template?.maxHp, 1, 999999, 'max hp'),
    attack: numberInRange(template?.attack ?? 0, 0, 99999, 'attack'),
    defense: numberInRange(template?.defense ?? 0, 0, 99999, 'defense'),
    resistance: normalizeResistance(template?.resistance),
    speed: numberInRange(template?.speed, 0.01, 20, 'speed'),
    attackInterval: normalAttack.interval,
    canBeBlocked: Boolean(template?.canBeBlocked),
    isFlying: Boolean(template?.isFlying),
    rewardCost: integerInRange(template?.rewardCost ?? 0, 0, 999, 'reward cost'),
    elite: Boolean(template?.elite),
    boss: Boolean(template?.boss),
    damageType,
    targeting,
    range,
    normalAttack,
    skills,
    lifeValue: integerInRange(template?.lifeValue ?? 1, 1, 99, 'life value'),
    blockBypass: integerInRange(template?.blockBypass ?? 0, 0, 99, 'block bypass'),
    description: String(template?.description ?? ''),
    phases,
    color: nonEmptyString(template?.color ?? '#e15f5f', 'color')
  };
}

export function validateOperatorTemplate(template) {
  const earlyErrors = [];
  try {
    normalizeId(template?.id, 'operator id');
  } catch (error) {
    earlyErrors.push(error.message);
  }
  try {
    normalizeRange(template?.range ?? template?.normalAttack?.range);
  } catch (error) {
    earlyErrors.push(error.message);
  }
  if (earlyErrors.length > 0) {
    return {
      ok: false,
      value: null,
      errors: earlyErrors
    };
  }
  return validateWith(() => normalizeOperatorTemplate(template));
}

export function validateEnemyTemplate(template) {
  return validateWith(() => normalizeEnemyTemplate(template));
}

export function validateCustomCatalogs(data) {
  const errors = [];
  Object.entries(data?.operators ?? {}).forEach(([id, template]) => {
    const result = validateOperatorTemplate({ ...template, id: template?.id ?? id });
    errors.push(...result.errors.map((error) => `operator ${id}: ${error}`));
  });
  Object.entries(data?.enemies ?? {}).forEach(([id, template]) => {
    const result = validateEnemyTemplate({ ...template, id: template?.id ?? id });
    errors.push(...result.errors.map((error) => `enemy ${id}: ${error}`));
  });
  return {
    ok: errors.length === 0,
    errors
  };
}

function validateWith(normalizer) {
  try {
    return {
      ok: true,
      value: normalizer(),
      errors: []
    };
  } catch (error) {
    return {
      ok: false,
      value: null,
      errors: splitErrorMessages(error)
    };
  }
}

function normalizeId(value, label) {
  const id = nonEmptyString(value, label);
  if (!ID_PATTERN.test(id)) {
    throw new Error(`${label} must contain only lowercase letters, numbers, dashes, and underscores`);
  }
  return id;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function numberInRange(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return number;
}

function integerInRange(value, min, max, label) {
  const number = numberInRange(value, min, max, label);
  if (!Number.isInteger(number)) {
    throw new Error(`${label} must be an integer`);
  }
  return number;
}

function oneOf(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new Error(`${label} must be one of ${[...allowed].join(', ')}`);
  }
  return value;
}

function normalizeDeployTypes(value, fallback) {
  const source = Array.isArray(value) && value.length > 0 ? value : [fallback];
  const normalized = [];
  source.forEach((item) => {
    const deployType = oneOf(item, DEPLOY_TYPES, 'deploy type');
    if (!normalized.includes(deployType)) {
      normalized.push(deployType);
    }
  });
  if (!normalized.includes(fallback)) {
    normalized.unshift(fallback);
  }
  return normalized;
}

function normalizeResistance(value) {
  const number = numberInRange(value ?? 0, 0, 100, 'resistance');
  return number > 0 && number <= 1 ? Math.round(number * 100) : number;
}

function normalizeDamageComponents(components, fallback = []) {
  const source = Array.isArray(components) ? components : fallback;
  return source.map((component) => {
    const normalized = {
      type: oneOf(component?.type, DAMAGE_COMPONENT_TYPES, 'damage component type'),
      value: numberInRange(component?.value, 0, 999999, 'damage component value')
    };
    [
      ['attackMultiplier', 0, 999, 'damage component attack multiplier'],
      ['flatAttack', -999999, 999999, 'damage component flat attack'],
      ['damageMultiplier', 0, 999, 'damage component damage multiplier'],
      ['penetrationPercent', 0, 1, 'damage component penetration percent'],
      ['penetrationFlat', 0, 999999, 'damage component penetration flat']
    ].forEach(([field, min, max, label]) => {
      if (Object.hasOwn(component ?? {}, field)) {
        normalized[field] = numberInRange(component[field], min, max, label);
      }
    });
    if (component?.id) {
      normalized.id = String(component.id);
    }
    return normalized;
  });
}

function normalizeEffects(effects) {
  if (!effects) {
    return [];
  }
  if (!Array.isArray(effects)) {
    throw new Error('effects must be an array');
  }
  return effects.map((effect) => {
    const normalized = {
      type: nonEmptyString(effect?.type, 'effect type')
    };
    if (Object.hasOwn(effect ?? {}, 'value')) {
      normalized.value = numberInRange(effect.value, -999999, 999999, 'effect value');
    }
    if (Object.hasOwn(effect ?? {}, 'duration')) {
      normalized.duration = numberInRange(effect.duration, 0, 999, 'effect duration');
    }
    return normalized;
  });
}

function normalizeNormalAttack(template, options) {
  const source = template?.normalAttack ?? {};
  const attack = numberInRange(template?.attack ?? firstComponentValue(source.components) ?? 0, 0, 99999, options.attackLabel);
  const interval = numberInRange(source.interval ?? template?.attackInterval ?? 1.5, 0.1, 60, options.intervalLabel);
  const damageType = options.damageType;
  const fallbackComponents = damageType === 'physical' || damageType === 'arts'
    ? [{ type: damageType, value: attack }]
    : [];
  const rangeSource = Object.hasOwn(source, 'range')
    ? source.range
    : (Object.hasOwn(template ?? {}, 'range') ? template.range : options.defaultRange);
  const range = normalizeRange(rangeSource);
  const targeting = oneOf(source.targeting ?? template?.targeting ?? options.defaultTargeting, options.targetingTypes, options.targetingLabel);
  const effects = damageType === 'heal' && !Array.isArray(source.effects)
    ? [{ type: 'heal', value: attack }]
    : normalizeEffects(source.effects);

  return {
    interval,
    range,
    targeting,
    components: normalizeDamageComponents(source.components, fallbackComponents),
    effects
  };
}

function firstComponentValue(components) {
  const component = Array.isArray(components) ? components[0] : null;
  return component ? Number(component.value) : null;
}

function damageTypeFromComponents(components, { allowHeal = true } = {}) {
  const component = Array.isArray(components)
    ? components.find((item) => item?.type !== 'neural' && (allowHeal || item?.type !== 'heal'))
    : null;
  return component?.type;
}

function attackValueFromComponents(components, fallback) {
  const attackComponents = (components ?? []).filter((component) => {
    return component.type === 'physical' || component.type === 'arts' || component.type === 'heal';
  });
  if (attackComponents.length === 0) {
    return numberInRange(fallback ?? 0, 0, 99999, 'attack');
  }
  const total = attackComponents.reduce((sum, component) => {
    const value = Number(component.value ?? 0);
    const multiplier = Number(component.attackMultiplier ?? 1);
    const flat = Number(component.flatAttack ?? 0);
    return sum + Math.max(0, value * multiplier + flat);
  }, 0);
  return numberInRange(Math.round(total), 0, 99999, 'attack');
}

function normalizeEnemyPhases(phases) {
  if (!Array.isArray(phases)) {
    throw new Error('enemy phases must be an array');
  }
  return phases.map((phase, index) => normalizeEnemyPhase(phase, index));
}

function normalizeEnemyPhase(phase, index) {
  const damageType = Object.hasOwn(phase ?? {}, 'damageType')
    ? oneOf(phase.damageType, ENEMY_DAMAGE_TYPES, 'phase damage type')
    : damageTypeFromComponents(phase?.normalAttack?.components, { allowHeal: false });
  const normalAttack = Object.hasOwn(phase ?? {}, 'normalAttack') || Object.hasOwn(phase ?? {}, 'attack') || Object.hasOwn(phase ?? {}, 'attackInterval') || Object.hasOwn(phase ?? {}, 'range') || damageType
    ? normalizeNormalAttack(phase, {
      damageType: damageType ?? 'physical',
      attackLabel: 'phase attack',
      intervalLabel: 'phase attack interval',
      targetingTypes: ENEMY_TARGETING_TYPES,
      targetingLabel: 'phase targeting',
      defaultTargeting: 'blocked-first',
      defaultRange: { type: 'melee', radius: 0 }
    })
    : undefined;
  return {
    name: nonEmptyString(phase?.name ?? `phase-${index + 1}`, 'enemy phase name'),
    maxHp: numberInRange(phase?.maxHp, 1, 999999, 'phase max hp'),
    attack: numberInRange(phase?.attack ?? firstComponentValue(phase?.normalAttack?.components) ?? 0, 0, 99999, 'phase attack'),
    defense: numberInRange(phase?.defense ?? 0, 0, 99999, 'phase defense'),
    resistance: normalizeResistance(phase?.resistance),
    speed: numberInRange(phase?.speed, 0.01, 20, 'phase speed'),
    attackInterval: normalAttack?.interval ?? numberInRange(phase?.attackInterval ?? 1.5, 0.1, 60, 'phase attack interval'),
    canBeBlocked: Object.hasOwn(phase ?? {}, 'canBeBlocked') ? Boolean(phase.canBeBlocked) : undefined,
    damageType,
    range: normalAttack?.range ?? (Object.hasOwn(phase ?? {}, 'range') ? normalizeRange(phase.range) : undefined),
    normalAttack,
    skills: Object.hasOwn(phase ?? {}, 'skills') ? normalizeEnemySkills(phase.skills) : undefined,
    lifeValue: Object.hasOwn(phase ?? {}, 'lifeValue') ? integerInRange(phase.lifeValue, 1, 99, 'phase life value') : undefined,
    blockBypass: Object.hasOwn(phase ?? {}, 'blockBypass') ? integerInRange(phase.blockBypass, 0, 99, 'phase block bypass') : undefined,
    color: Object.hasOwn(phase ?? {}, 'color') ? nonEmptyString(phase.color, 'phase color') : undefined,
    description: Object.hasOwn(phase ?? {}, 'description') ? String(phase.description ?? '') : undefined
  };
}

function normalizeSkills(template) {
  const sourceSkills = Array.isArray(template?.skills)
    ? template.skills
    : (template?.skill ? [template.skill] : []);

  if (sourceSkills.length > MAX_SKILLS_PER_OPERATOR) {
    throw new Error(`operator may define at most 3 skills`);
  }

  return sourceSkills
    .filter(Boolean)
    .map((skill) => normalizeSkill(skill));
}

function normalizeSkill(skill) {
  if (!skill) {
    return null;
  }
  const type = oneOf(skill.type, SKILL_TYPES, 'skill type');
  const normalized = {
    ...skill,
    id: normalizeId(skill.id ?? type, 'skill id'),
    name: nonEmptyString(skill.name ?? type, 'skill name'),
    description: nonEmptyString(skill.description ?? '', 'skill description'),
    spCost: numberInRange(skill.spCost ?? 1, 1, 999, 'skill sp cost'),
    triggerMode: oneOf(skill.triggerMode ?? 'manual', SKILL_TRIGGER_MODES, 'skill trigger mode'),
    type,
    components: normalizeDamageComponents(skill.components),
    effects: normalizeSkillEffects(skill, type)
  };
  if (skill.range) {
    normalized.range = normalizeRange(skill.range);
  }
  if ('duration' in normalized) {
    normalized.duration = numberInRange(normalized.duration, 0, 999, 'skill duration');
  }
  if ('ammo' in normalized) {
    normalized.ammo = integerInRange(normalized.ammo, 0, 999, 'skill ammo');
  }
  if ('amount' in normalized) {
    normalized.amount = numberInRange(normalized.amount, 0, 99999, 'skill amount');
  }
  if ('healPercent' in normalized) {
    normalized.healPercent = numberInRange(normalized.healPercent, 0, 1, 'skill heal percent');
  }
  if (normalized.effect) {
    normalized.effect = normalizeSkillEffectObject(normalized.effect);
  }
  return normalized;
}

function normalizeEnemySkills(skills) {
  if (!skills) {
    return [];
  }
  if (!Array.isArray(skills)) {
    throw new Error('enemy skills must be an array');
  }
  return skills.filter(Boolean).map((skill) => ({
    ...skill,
    id: normalizeId(skill.id ?? 'enemy_skill', 'enemy skill id'),
    name: nonEmptyString(skill.name ?? 'enemy skill', 'enemy skill name'),
    description: String(skill.description ?? ''),
    triggerMode: oneOf(skill.triggerMode ?? 'hp_threshold', SKILL_TRIGGER_MODES, 'enemy skill trigger mode'),
    hpThresholdPercent: numberInRange(skill.hpThresholdPercent ?? 50, 0, 100, 'enemy skill hp threshold percent'),
    range: skill.range ? normalizeRange(skill.range) : null,
    targeting: oneOf(skill.targeting ?? 'nearest', ENEMY_TARGETING_TYPES, 'enemy skill targeting'),
    components: normalizeDamageComponents(skill.components),
    effects: normalizeEffects(skill.effects)
  }));
}

function normalizeSkillEffects(skill, type) {
  if (Array.isArray(skill.effects)) {
    return normalizeEffects(skill.effects);
  }
  if (type === 'instant_cost') {
    return [{ type: 'cost', value: numberInRange(skill.amount ?? 0, 0, 99999, 'skill amount') }];
  }
  if (type === 'instant_heal') {
    return [{ type: 'heal', value: numberInRange(skill.amount ?? 0, 0, 99999, 'skill amount') }];
  }
  const effects = [];
  if ('healPercent' in skill) {
    effects.push({ type: 'heal_percent', value: numberInRange(skill.healPercent, 0, 1, 'skill heal percent') });
  }
  if (skill.effect?.attackMultiplier) {
    effects.push({ type: 'attack_multiplier', value: numberInRange(skill.effect.attackMultiplier, 0, 99, 'skill attack multiplier') });
  }
  if (skill.effect?.defenseMultiplier) {
    effects.push({ type: 'defense_multiplier', value: numberInRange(skill.effect.defenseMultiplier, 0, 99, 'skill defense multiplier') });
  }
  if (skill.effect?.attackIntervalMultiplier) {
    effects.push({ type: 'attack_interval_multiplier', value: numberInRange(skill.effect.attackIntervalMultiplier, 0, 99, 'skill attack interval multiplier') });
  }
  if (skill.effect?.nextAttackMultiplier) {
    effects.push({ type: 'next_attack_multiplier', value: numberInRange(skill.effect.nextAttackMultiplier, 0, 99, 'skill next attack multiplier') });
  }
  return effects;
}

function normalizeSkillEffectObject(effect) {
  const normalized = { ...effect };
  [
    ['attackMultiplier', 0, 99, 'skill attack multiplier'],
    ['defenseMultiplier', 0, 99, 'skill defense multiplier'],
    ['attackIntervalMultiplier', 0, 99, 'skill attack interval multiplier'],
    ['nextAttackMultiplier', 0, 99, 'skill next attack multiplier'],
    ['maxHpDelta', -99999, 99999, 'skill max hp delta'],
    ['defenseDelta', -99999, 99999, 'skill defense delta'],
    ['resistanceDelta', -100, 100, 'skill resistance delta'],
    ['blockDelta', -10, 10, 'skill block delta'],
    ['spOnAttack', 0, 999, 'skill sp on attack']
  ].forEach(([field, min, max, label]) => {
    if (Object.hasOwn(normalized, field)) {
      normalized[field] = numberInRange(normalized[field], min, max, label);
    }
  });
  return normalized;
}

function defaultTargetingForDamage(damageType) {
  return damageType === 'heal' ? 'lowest-hp-percent' : 'exit-first';
}

function splitErrorMessages(error) {
  return String(error?.message ?? error)
    .split('\n')
    .map((message) => message.trim())
    .filter(Boolean);
}
