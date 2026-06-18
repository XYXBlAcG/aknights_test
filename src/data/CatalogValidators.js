import { normalizeRange } from '../utils/RangeMath.js';

const ID_PATTERN = /^[a-z0-9_-]+$/;
const OPERATOR_CLASSES = new Set(['vanguard', 'guard', 'defender', 'sniper', 'caster', 'medic', 'custom']);
const DEPLOY_TYPES = new Set(['ground', 'high']);
const DAMAGE_TYPES = new Set(['physical', 'arts', 'heal']);
const TARGETING_TYPES = new Set(['blocked-first', 'exit-first', 'flying-first', 'high-defense', 'lowest-hp-percent']);
const ENEMY_DAMAGE_TYPES = new Set(['physical', 'arts']);
const ENEMY_TARGETING_TYPES = new Set(['blocked-first', 'nearest', 'lowest-hp-percent']);
const SKILL_TYPES = new Set(['instant_cost', 'buff', 'next_attack', 'instant_heal']);
const SKILL_TRIGGER_MODES = new Set(['manual', 'auto']);
const MAX_SKILLS_PER_OPERATOR = 3;

export function normalizeOperatorTemplate(template) {
  const id = normalizeId(template?.id, 'operator id');
  const operatorClass = oneOf(template?.class ?? 'custom', OPERATOR_CLASSES, 'operator class');
  const deployType = oneOf(template?.deployType, DEPLOY_TYPES, 'deploy type');
  const damageType = oneOf(template?.damageType, DAMAGE_TYPES, 'damage type');
  const targeting = oneOf(template?.targeting ?? defaultTargetingForDamage(damageType), TARGETING_TYPES, 'targeting');

  const skills = normalizeSkills(template);

  return {
    id,
    name: nonEmptyString(template?.name, 'operator name'),
    class: operatorClass,
    className: nonEmptyString(template?.className ?? operatorClass, 'class name'),
    deployType,
    cost: numberInRange(template?.cost, 0, 99, 'cost'),
    maxHp: numberInRange(template?.maxHp, 1, 99999, 'max hp'),
    attack: numberInRange(template?.attack, 0, 99999, 'attack'),
    defense: numberInRange(template?.defense ?? 0, 0, 99999, 'defense'),
    resistance: numberInRange(template?.resistance ?? 0, 0, 0.95, 'resistance'),
    attackInterval: numberInRange(template?.attackInterval, 0.1, 60, 'attack interval'),
    block: integerInRange(template?.block ?? 0, 0, 10, 'block'),
    damageType,
    range: normalizeRange(template?.range),
    targeting,
    trait: String(template?.trait ?? 'custom'),
    skill: skills[0] ?? null,
    skills,
    color: nonEmptyString(template?.color ?? '#5fc9ff', 'color')
  };
}

export function normalizeEnemyTemplate(template) {
  const damageType = oneOf(template?.damageType ?? 'physical', ENEMY_DAMAGE_TYPES, 'enemy damage type');
  const targeting = oneOf(template?.targeting ?? 'blocked-first', ENEMY_TARGETING_TYPES, 'enemy targeting');
  const range = normalizeRange(template?.range ?? { type: 'melee', radius: 0 });
  const phaseSource = Object.hasOwn(template ?? {}, 'phases') ? template.phases : [];
  const phases = normalizeEnemyPhases(phaseSource);

  return {
    id: normalizeId(template?.id, 'enemy id'),
    name: nonEmptyString(template?.name, 'enemy name'),
    maxHp: numberInRange(template?.maxHp, 1, 999999, 'max hp'),
    attack: numberInRange(template?.attack ?? 0, 0, 99999, 'attack'),
    defense: numberInRange(template?.defense ?? 0, 0, 99999, 'defense'),
    resistance: numberInRange(template?.resistance ?? 0, 0, 0.95, 'resistance'),
    speed: numberInRange(template?.speed, 0.01, 20, 'speed'),
    attackInterval: numberInRange(template?.attackInterval ?? 1.5, 0.1, 60, 'attack interval'),
    canBeBlocked: Boolean(template?.canBeBlocked),
    isFlying: Boolean(template?.isFlying),
    rewardCost: integerInRange(template?.rewardCost ?? 0, 0, 999, 'reward cost'),
    elite: Boolean(template?.elite),
    boss: Boolean(template?.boss),
    damageType,
    targeting,
    range,
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
    normalizeRange(template?.range);
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

function normalizeEnemyPhases(phases) {
  if (!Array.isArray(phases)) {
    throw new Error('enemy phases must be an array');
  }
  return phases.map((phase, index) => ({
    name: nonEmptyString(phase?.name ?? `phase-${index + 1}`, 'enemy phase name'),
    maxHp: numberInRange(phase?.maxHp, 1, 999999, 'phase max hp'),
    attack: numberInRange(phase?.attack ?? 0, 0, 99999, 'phase attack'),
    defense: numberInRange(phase?.defense ?? 0, 0, 99999, 'phase defense'),
    resistance: numberInRange(phase?.resistance ?? 0, 0, 0.95, 'phase resistance'),
    speed: numberInRange(phase?.speed, 0.01, 20, 'phase speed'),
    attackInterval: numberInRange(phase?.attackInterval ?? 1.5, 0.1, 60, 'phase attack interval'),
    canBeBlocked: Object.hasOwn(phase ?? {}, 'canBeBlocked') ? Boolean(phase.canBeBlocked) : undefined,
    damageType: phase?.damageType
      ? oneOf(phase.damageType, ENEMY_DAMAGE_TYPES, 'phase damage type')
      : undefined,
    range: phase?.range ? normalizeRange(phase.range) : undefined,
    color: phase?.color ? nonEmptyString(phase.color, 'phase color') : undefined,
    description: Object.hasOwn(phase ?? {}, 'description') ? String(phase.description ?? '') : undefined
  }));
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
    type
  };
  if (skill.range) {
    normalized.range = normalizeRange(skill.range);
  }
  if ('duration' in normalized) {
    normalized.duration = numberInRange(normalized.duration, 0, 999, 'skill duration');
  }
  if ('amount' in normalized) {
    normalized.amount = numberInRange(normalized.amount, 0, 99999, 'skill amount');
  }
  if ('healPercent' in normalized) {
    normalized.healPercent = numberInRange(normalized.healPercent, 0, 1, 'skill heal percent');
  }
  if (normalized.effect) {
    normalized.effect = { ...normalized.effect };
  }
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
