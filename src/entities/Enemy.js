let enemySequence = 0;

export class Enemy {
  constructor(template, { pathId, wave = 1, spawnTime = 0 } = {}) {
    enemySequence += 1;
    this.id = `${template.id}-${enemySequence}`;
    this.templateId = template.id;
    this.name = template.name;
    this.baseTemplate = structuredClone(template);
    this.phases = template.phases?.length > 0
      ? structuredClone(template.phases)
      : [];
    this.phaseIndex = 0;
    this.maxHp = template.maxHp;
    this.hp = template.maxHp;
    this.attack = template.attack;
    this.defense = template.defense;
    this.resistance = normalizeRuntimeResistance(template.resistance ?? 0);
    this.speed = template.speed;
    this.attackInterval = template.attackInterval;
    this.normalAttack = resolveNormalAttack(template, 'blocked-first');
    this.attackTimer = this.normalAttack.interval;
    this.canBeBlocked = template.canBeBlocked;
    this.isFlying = template.isFlying;
    this.rewardCost = template.rewardCost;
    this.lifeValue = template.lifeValue ?? 1;
    this.elite = Boolean(template.elite);
    this.boss = Boolean(template.boss);
    this.color = template.color;
    this.damageType = template.damageType ?? 'physical';
    this.targeting = this.normalAttack.targeting;
    this.range = this.normalAttack.range ?? { type: 'melee', radius: 0 };
    this.blockBypass = template.blockBypass ?? 0;
    this.skills = structuredClone(template.skills ?? []);
    this.attackModules = [];
    this.defenseModules = [];
    this.movementPauseRemaining = 0;
    this.triggeredWaypointActionIds = new Set();
    this.description = template.description ?? '';
    if (this.phases.length > 0) {
      this.applyPhase(0, { resetAttackTimer: true });
    }
    this.pathId = pathId;
    this.wave = wave;
    this.spawnTime = spawnTime;
    this.pathDistance = 0;
    this.cell = { x: 0, y: 0 };
    this.x = 0;
    this.y = 0;
    this.blockedBy = null;
    this.reachedExit = false;
  }

  get isDead() {
    return this.hp <= 0;
  }

  applyPhase(index, { resetAttackTimer = false } = {}) {
    const phase = this.phases[index];
    if (!phase) {
      return;
    }
    const base = this.baseTemplate;
    this.phaseIndex = index;
    this.maxHp = phase.maxHp ?? base.maxHp;
    this.hp = this.maxHp;
    this.attack = phase.attack ?? base.attack;
    this.defense = phase.defense ?? base.defense;
    this.resistance = normalizeRuntimeResistance(phase.resistance ?? base.resistance ?? 0);
    this.speed = phase.speed ?? base.speed;
    this.attackInterval = phase.attackInterval ?? base.attackInterval;
    this.normalAttack = phase.normalAttack
      ? structuredClone(phase.normalAttack)
      : resolveNormalAttack({ ...base, ...phase }, 'blocked-first');
    this.attackTimer = resetAttackTimer
      ? this.normalAttack.interval
      : Math.min(this.attackTimer ?? this.normalAttack.interval, this.normalAttack.interval);
    this.damageType = phase.damageType ?? base.damageType ?? 'physical';
    this.range = this.normalAttack.range ?? phase.range ?? base.range ?? { type: 'melee', radius: 0 };
    this.targeting = this.normalAttack.targeting ?? phase.targeting ?? base.targeting ?? 'blocked-first';
    this.lifeValue = phase.lifeValue ?? base.lifeValue ?? 1;
    this.elite = phase.elite ?? base.elite ?? false;
    this.boss = phase.boss ?? base.boss ?? false;
    this.blockBypass = phase.blockBypass ?? base.blockBypass ?? 0;
    this.skills = structuredClone(phase.skills ?? base.skills ?? []);
    this.attackModules = (this.attackModules ?? []).filter((module) => module.preserveAcrossPhase);
    this.defenseModules = (this.defenseModules ?? []).filter((module) => module.preserveAcrossPhase);
    this.color = phase.color ?? base.color;
    this.canBeBlocked = phase.canBeBlocked ?? base.canBeBlocked;
    this.description = phase.description ?? base.description ?? '';
  }

  advancePhase() {
    if (this.phaseIndex + 1 >= this.phases.length) {
      return false;
    }
    this.applyPhase(this.phaseIndex + 1);
    if (this.canBeBlocked === false) {
      this.blockedBy = null;
    }
    return true;
  }

  get hasMorePhases() {
    return this.phaseIndex + 1 < this.phases.length;
  }
}

function resolveNormalAttack(template, defaultTargeting) {
  const legacy = legacyNormalAttack(template, defaultTargeting);
  if (!template.normalAttack || isLikelyInheritedNormalAttack(template.normalAttack, legacy)) {
    return legacy;
  }
  return {
    interval: Number(template.normalAttack.interval ?? template.attackInterval ?? 1.5),
    range: structuredClone(template.normalAttack.range ?? template.range ?? { type: 'melee', radius: 0 }),
    targeting: template.normalAttack.targeting ?? template.targeting ?? defaultTargeting,
    components: structuredClone(template.normalAttack.components ?? []),
    effects: structuredClone(template.normalAttack.effects ?? [])
  };
}

function legacyNormalAttack(template, defaultTargeting) {
  const damageType = template.damageType ?? 'physical';
  return {
    interval: Number(template.attackInterval ?? template.normalAttack?.interval ?? 1.5),
    range: structuredClone(template.range ?? template.normalAttack?.range ?? { type: 'melee', radius: 0 }),
    targeting: template.targeting ?? template.normalAttack?.targeting ?? defaultTargeting,
    components: damageType === 'physical' || damageType === 'arts'
      ? [{ type: damageType, value: Number(template.attack ?? 0) }]
      : [],
    effects: []
  };
}

function isLikelyInheritedNormalAttack(normalAttack, legacy) {
  const components = normalAttack.components ?? [];
  if (components.some((component) => component.id)) {
    return false;
  }
  const hasOnlyLegacyComponent = components.length <= 1 && components.every((component) => component.type === 'physical' || component.type === 'arts');
  const hasOnlyLegacyEffects = (normalAttack.effects ?? []).length === 0;
  if (!hasOnlyLegacyComponent || !hasOnlyLegacyEffects) {
    return false;
  }
  return normalAttack.interval !== legacy.interval
    || JSON.stringify(normalAttack.range) !== JSON.stringify(legacy.range)
    || normalAttack.targeting !== legacy.targeting
    || JSON.stringify(components) !== JSON.stringify(legacy.components);
}

function normalizeRuntimeResistance(value) {
  const number = Number(value ?? 0);
  return number > 0 && number <= 1 ? Math.round(number * 100) : number;
}

export function resetEnemySequence() {
  enemySequence = 0;
}
