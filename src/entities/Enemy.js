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
      this.applyPhase(0);
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

  applyPhase(index) {
    const phase = this.phases[index];
    if (!phase) {
      return;
    }
    this.phaseIndex = index;
    this.maxHp = phase.maxHp;
    this.hp = phase.maxHp;
    this.attack = phase.attack;
    this.defense = phase.defense;
    this.resistance = phase.resistance ?? 0;
    this.speed = phase.speed;
    this.attackInterval = phase.attackInterval;
    this.attackTimer = Math.min(this.attackTimer ?? this.attackInterval, this.attackInterval);
    this.damageType = phase.damageType ?? this.damageType;
    this.range = phase.range ?? this.range;
    this.color = phase.color ?? this.color;
    if (phase.canBeBlocked !== undefined) {
      this.canBeBlocked = phase.canBeBlocked;
    }
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
