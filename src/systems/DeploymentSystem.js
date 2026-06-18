import { CLASS_LIMITS, TOTAL_DEPLOY_LIMIT } from '../data/defaultOperators.js';
import { Operator } from '../entities/Operator.js';
import { getCellType, isCellInBounds, isSameCell } from '../utils/GridMath.js';

const TERRAIN_BY_DEPLOY_TYPE = {
  ground: 'path',
  high: 'high'
};

export function createDeploymentSystem({ map, costSystem, operatorCatalog }) {
  return new DeploymentSystem({ map, costSystem, operatorCatalog });
}

export class DeploymentSystem {
  constructor({ map, costSystem, operatorCatalog }) {
    this.map = map;
    this.costSystem = costSystem;
    this.operatorCatalog = operatorCatalog;
    this.operators = [];
    this.totalLimit = map.deployLimit ?? TOTAL_DEPLOY_LIMIT;
    this.classLimits = CLASS_LIMITS;
    this.redeployCooldowns = {};
    this.redeployCooldownSeconds = map.redeployCooldownSeconds ?? 10;
  }

  canDeploy(operatorType, cell) {
    const template = this.operatorCatalog[operatorType];
    if (!template) {
      return { ok: false, reason: `Unknown operator ${operatorType}` };
    }

    if (!isCellInBounds(cell, this.map.width, this.map.height)) {
      return { ok: false, reason: 'Cell is outside the map' };
    }

    const requiredTerrain = TERRAIN_BY_DEPLOY_TYPE[template.deployType];
    const terrain = getCellType(this.map, cell);
    if (terrain !== requiredTerrain) {
      return { ok: false, reason: `${template.name} requires ${requiredTerrain} terrain` };
    }

    if (this.getOperatorAt(cell)) {
      return { ok: false, reason: 'Cell is already occupied' };
    }

    if (this.operators.length >= this.totalLimit) {
      return { ok: false, reason: 'Total deploy limit reached' };
    }

    const classCount = this.operators.filter((operator) => operator.class === template.class).length;
    const classLimit = this.classLimits[template.class] ?? this.totalLimit;
    if (classCount >= classLimit) {
      return { ok: false, reason: `${template.className} deploy limit reached` };
    }

    const cooldown = this.redeployCooldowns[operatorType] ?? 0;
    if (cooldown > 0) {
      return { ok: false, reason: `Redeploy cooldown ${Math.ceil(cooldown)}s` };
    }

    if (!this.costSystem.canSpend(template.cost)) {
      return { ok: false, reason: 'Not enough cost' };
    }

    return { ok: true, template };
  }

  deploy(operatorType, cell, direction = 'right') {
    const check = this.canDeploy(operatorType, cell);
    if (!check.ok) {
      return check;
    }

    this.costSystem.spend(check.template.cost);
    const operator = new Operator(check.template, cell, direction);
    this.operators.push(operator);
    return { ok: true, operator };
  }

  retreat(operatorId) {
    const index = this.operators.findIndex((operator) => operator.id === operatorId);
    if (index === -1) {
      return { ok: false, reason: `Operator ${operatorId} is not deployed` };
    }

    const [operator] = this.operators.splice(index, 1);
    operator.blockedEnemies.forEach((enemy) => {
      if (enemy.blockedBy === operator.id) {
        enemy.blockedBy = null;
      }
    });
    operator.blockedEnemies = [];
    this.costSystem.refund(Math.floor(operator.cost * 0.5));
    this.redeployCooldowns[operator.templateId] = this.redeployCooldownSeconds;
    return { ok: true, operator };
  }

  tickCooldowns(deltaSeconds) {
    Object.entries(this.redeployCooldowns).forEach(([templateId, remaining]) => {
      const next = Math.max(0, remaining - deltaSeconds);
      if (next <= 0) {
        delete this.redeployCooldowns[templateId];
      } else {
        this.redeployCooldowns[templateId] = next;
      }
    });
  }

  getOperatorAt(cell) {
    return this.operators.find((operator) => isSameCell(operator.cell, cell)) ?? null;
  }

  clear() {
    this.operators = [];
  }
}
