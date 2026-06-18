import { isCellInRange } from '../utils/RangeMath.js';
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

    enemies.filter((enemy) => !enemy.isDead && enemy.blockedBy && enemy.attack > 0).forEach((enemy) => {
      enemy.attackTimer += deltaSeconds;
      if (enemy.attackTimer < enemy.attackInterval) {
        return;
      }

      const target = operators.find((operator) => operator.id === enemy.blockedBy && !operator.isDead);
      if (!target) {
        enemy.blockedBy = null;
        return;
      }

      target.hp -= calculatePhysicalDamage(enemy.attack, getEffectiveDefense(target));
      enemy.attackTimer = 0;
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
      healedOperators
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

function selectAttackTarget(operator, enemies) {
  const liveEnemies = enemies.filter((enemy) => !enemy.isDead);
  if (operator.range?.type === 'melee') {
    return operator.blockedEnemies.find((enemy) => !enemy.isDead) ?? null;
  }

  const inRange = liveEnemies.filter((enemy) => {
    return isCellInRange(operator.cell, enemy.cell, operator.range);
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
      && isCellInRange(operator.cell, candidate.cell, operator.range);
  });

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
}
