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
    this.resistance = template.resistance ?? 0;
    this.speed = template.speed;
    this.attackInterval = template.attackInterval;
    this.attackTimer = template.attackInterval;
    this.canBeBlocked = template.canBeBlocked;
    this.isFlying = template.isFlying;
    this.rewardCost = template.rewardCost;
    this.color = template.color;
    this.damageType = template.damageType ?? 'physical';
    this.targeting = template.targeting ?? 'blocked-first';
    this.range = template.range ?? { type: 'melee', radius: 0 };
    this.blockBypass = template.blockBypass ?? 0;
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
    this.resistance = phase.resistance ?? base.resistance ?? 0;
    this.speed = phase.speed ?? base.speed;
    this.attackInterval = phase.attackInterval ?? base.attackInterval;
    this.attackTimer = resetAttackTimer
      ? this.attackInterval
      : Math.min(this.attackTimer ?? this.attackInterval, this.attackInterval);
    this.damageType = phase.damageType ?? base.damageType ?? 'physical';
    this.range = phase.range ?? base.range ?? { type: 'melee', radius: 0 };
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

export function resetEnemySequence() {
  enemySequence = 0;
}
