import { isSameCell } from '../utils/GridMath.js';

export function createBlockingSystem() {
  return new BlockingSystem();
}

export function isValidBlock(enemy, operator) {
  return !enemy.isDead
    && !enemy.isFlying
    && enemy.canBeBlocked !== false
    && !operator.isDead
    && operator.deployType === 'ground'
    && (enemy.blockBypass ?? 0) <= operator.block
    && isSameCell(operator.cell, enemy.cell);
}

export class BlockingSystem {
  clearInvalidBlocks(operators, enemies) {
    const operatorsById = new Map(operators.map((operator) => [operator.id, operator]));

    enemies.forEach((enemy) => {
      if (!enemy.blockedBy) {
        return;
      }

      const operator = operatorsById.get(enemy.blockedBy);
      if (!operator || !isValidBlock(enemy, operator)) {
        enemy.blockedBy = null;
      }
    });

    syncBlockedEnemies(operators, enemies);
  }

  update(operators, enemies) {
    this.clearInvalidBlocks(operators, enemies);
    const activeOperators = operators.filter((operator) => !operator.isDead);

    enemies.forEach((enemy) => {
      if (enemy.isDead || enemy.isFlying || enemy.canBeBlocked === false || enemy.blockedBy) {
        return;
      }

      const blocker = activeOperators.find((operator) => {
        return operator.canBlockMore() && isValidBlock(enemy, operator);
      });

      if (!blocker) {
        return;
      }

      enemy.blockedBy = blocker.id;
      blocker.blockedEnemies.push(enemy);
    });
  }
}

function syncBlockedEnemies(operators, enemies) {
  operators.forEach((operator) => {
    operator.blockedEnemies = enemies.filter((enemy) => {
      return enemy.blockedBy === operator.id && isValidBlock(enemy, operator);
    });
  });
}
