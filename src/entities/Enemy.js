let enemySequence = 0;

export class Enemy {
  constructor(template, { pathId, wave = 1, spawnTime = 0 } = {}) {
    enemySequence += 1;
    this.id = `${template.id}-${enemySequence}`;
    this.templateId = template.id;
    this.name = template.name;
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
}

export function resetEnemySequence() {
  enemySequence = 0;
}
