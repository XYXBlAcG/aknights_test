import { isCellInRange } from '../utils/RangeMath.js';
import { isSameCell, manhattanDistance } from '../utils/GridMath.js';
import {
  consumeNextAttackSkill,
  getEffectiveAttack,
  getEffectiveAttackInterval,
  getEffectiveDefense
} from './SkillSystem.js';

export function createCombatSystem(options = {}) {
  return new CombatSystem(options);
}

export class CombatSystem {
  constructor({ onEnemyKilled = null, onOperatorKilled = null } = {}) {
    this.onEnemyKilled = onEnemyKilled;
    this.onOperatorKilled = onOperatorKilled;
  }

  tick(deltaSeconds, { operators, enemies, onEnemyKilled = this.onEnemyKilled, onOperatorKilled = this.onOperatorKilled }) {
    const killedEnemies = [];
    const killedOperators = [];
    const healedOperators = [];
    const damagedOperators = [];

    operators.filter((operator) => !operator.isDead).forEach((operator) => {
      operator.attackTimer += deltaSeconds;
      if (operator.attackTimer < getEffectiveAttackInterval(operator)) {
        return;
      }

      if (operator.damageType === 'heal') {
        const target = selectHealTarget(operator, operators);
        if (!target) {
          return;
        }
        target.hp = Math.min(target.maxHp, target.hp + getEffectiveAttack(operator));
        operator.attackTimer = 0;
        healedOperators.push(target);
        return;
      }

      const target = selectAttackTarget(operator, enemies);
      if (!target) {
        return;
      }

      target.hp -= calculateDamage(operator, target);
      consumeNextAttackSkill(operator);
      operator.attackTimer = 0;
      if (target.hp <= 0 && !killedEnemies.includes(target)) {
        target.hp = 0;
        target.blockedBy = null;
        killedEnemies.push(target);
        onEnemyKilled?.(target, operator);
      }
    });

    enemies.filter((enemy) => !enemy.isDead && enemy.attack > 0).forEach((enemy) => {
      enemy.attackTimer += deltaSeconds;
      if (enemy.attackTimer < enemy.attackInterval) {
        return;
      }

      const target = selectEnemyTarget(enemy, operators);
      if (!target) {
        if (enemy.blockedBy) {
          enemy.blockedBy = null;
        }
        return;
      }

      target.hp -= calculateEnemyDamage(enemy, target);
      enemy.attackTimer = 0;
      damagedOperators.push(target);
      if (target.hp <= 0 && !killedOperators.includes(target)) {
        target.hp = 0;
        target.blockedEnemies.forEach((blockedEnemy) => {
          if (blockedEnemy.blockedBy === target.id) {
            blockedEnemy.blockedBy = null;
          }
        });
        target.blockedEnemies = [];
        killedOperators.push(target);
        onOperatorKilled?.(target, enemy);
      }
    });

    return {
      killedEnemies,
      killedOperators,
      healedOperators,
      damagedOperators
    };
  }
}

export function calculateDamage(attacker, target) {
  if (attacker.damageType === 'arts') {
    return Math.max(1, Math.round(getEffectiveAttack(attacker) * (1 - (target.resistance ?? 0))));
  }
  return calculatePhysicalDamage(getEffectiveAttack(attacker), target.defense ?? 0);
}

export function calculatePhysicalDamage(attack, defense) {
  return Math.max(Math.ceil(attack * 0.05), attack - defense);
}

export function calculateEnemyDamage(enemy, target) {
  if (enemy.damageType === 'arts') {
    return Math.max(1, Math.round(enemy.attack * (1 - (target.resistance ?? 0))));
  }
  return calculatePhysicalDamage(enemy.attack, getEffectiveDefense(target));
}

function selectAttackTarget(operator, enemies) {
  const liveEnemies = enemies.filter((enemy) => !enemy.isDead);
  if (operator.range?.type === 'melee') {
    return operator.blockedEnemies.find((enemy) => !enemy.isDead) ?? null;
  }

  const inRange = liveEnemies.filter((enemy) => {
    return isCellInRange(operator.cell, enemy.cell, operator.range, operator.direction);
  });

  if (inRange.length === 0) {
    return null;
  }

  if (operator.targeting === 'flying-first') {
    return [...inRange].sort((a, b) => Number(b.isFlying) - Number(a.isFlying) || b.pathDistance - a.pathDistance)[0];
  }

  if (operator.targeting === 'high-defense') {
    return [...inRange].sort((a, b) => b.defense - a.defense || b.hp - a.hp)[0];
  }

  return [...inRange].sort((a, b) => b.pathDistance - a.pathDistance)[0];
}

function selectHealTarget(operator, operators) {
  const candidates = operators.filter((candidate) => {
    return candidate.deployType === 'ground'
      && !candidate.isDead
      && candidate.hp < candidate.maxHp
      && isCellInRange(operator.cell, candidate.cell, operator.range, operator.direction);
  });

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
}

function selectEnemyTarget(enemy, operators) {
  const blocker = operators.find((operator) => operator.id === enemy.blockedBy && !operator.isDead);
  if (blocker) {
    return blocker;
  }

  if (!enemy.range || enemy.range.type === 'melee') {
    return null;
  }

  const inRange = operators.filter((operator) => {
    return !operator.isDead && isCellInRange(enemy.cell, operator.cell, enemy.range);
  });

  if (inRange.length === 0) {
    return null;
  }

  if (enemy.targeting === 'lowest-hp-percent') {
    return [...inRange].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
  }

  return [...inRange].sort((a, b) => {
    return manhattanDistance(enemy.cell, a.cell) - manhattanDistance(enemy.cell, b.cell);
  })[0];
}
