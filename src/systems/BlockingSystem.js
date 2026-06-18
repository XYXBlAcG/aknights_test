import { isSameCell } from '../utils/GridMath.js';

export function createBlockingSystem() {
  return new BlockingSystem();
}

export class BlockingSystem {
  update(operators, enemies) {
    const activeOperators = operators.filter((operator) => !operator.isDead);
    const activeOperatorIds = new Set(activeOperators.map((operator) => operator.id));

    enemies.forEach((enemy) => {
      if (enemy.blockedBy && !activeOperatorIds.has(enemy.blockedBy)) {
        enemy.blockedBy = null;
      }
    });

    activeOperators.forEach((operator) => {
      operator.blockedEnemies = enemies.filter((enemy) => {
        return enemy.blockedBy === operator.id && !enemy.isDead && isSameCell(enemy.cell, operator.cell);
      });
    });

    enemies.forEach((enemy) => {
      if (enemy.isDead || enemy.isFlying || enemy.canBeBlocked === false || enemy.blockedBy) {
        return;
      }

      const blocker = activeOperators.find((operator) => {
        return operator.deployType === 'ground'
          && operator.canBlockMore()
          && (enemy.blockBypass ?? 0) <= operator.block
          && isSameCell(operator.cell, enemy.cell);
      });

      if (!blocker) {
        return;
      }

      enemy.blockedBy = blocker.id;
      blocker.blockedEnemies.push(enemy);
    });
  }
}
