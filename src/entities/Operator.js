let operatorSequence = 0;

export class Operator {
  constructor(template, cell) {
    operatorSequence += 1;
    this.id = `${template.id}-${operatorSequence}`;
    this.templateId = template.id;
    this.name = template.name;
    this.class = template.class;
    this.className = template.className;
    this.deployType = template.deployType;
    this.cost = template.cost;
    this.maxHp = template.maxHp;
    this.hp = template.maxHp;
    this.attack = template.attack;
    this.defense = template.defense;
    this.resistance = template.resistance ?? 0;
    this.attackInterval = template.attackInterval;
    this.attackTimer = template.attackInterval;
    this.block = template.block;
    this.blockedEnemies = [];
    this.damageType = template.damageType;
    this.range = template.range;
    this.targeting = template.targeting;
    this.trait = template.trait;
    this.color = template.color;
    this.cell = { x: cell.x, y: cell.y };
    this.traitTimer = 0;
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

export function resetOperatorSequence() {
  operatorSequence = 0;
}
