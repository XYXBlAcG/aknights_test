import { isCellInRange } from '../utils/RangeMath.js';
import { manhattanDistance } from '../utils/GridMath.js';
import { isValidBlock } from './BlockingSystem.js';
import {
  consumeNextAttackSkill,
  consumeAmmoOnAttack,
  getEffectiveAttack,
  getEffectiveAttackInterval,
  getEffectiveDefense,
  getOperatorSkills
} from './SkillSystem.js';
import { applyDamageComponents } from './DamageSystem.js';

const MEDIC_SELF_REGEN_RATIO_PER_SECOND = 0.01;

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
    const phaseChangedEnemies = [];
    const attacks = [];
    const enemyAttacks = [];
    const healingEvents = [];
    const damageEvents = [];
    const neuralEvents = [];

    operators.filter((operator) => !operator.isDead).forEach((operator) => {
      const healing = applyPassiveSelfRegen(operator, deltaSeconds);
      if (healing > 0) {
        healedOperators.push(operator);
        healingEvents.push({ source: operator, target: operator, amount: healing });
      }
    });

    operators.filter((operator) => !operator.isDead).forEach((operator) => {
      operator.attackTimer += deltaSeconds;
      if (operator.attackTimer < getEffectiveAttackInterval(operator)) {
        return;
      }

      const operatorAttack = attackWithActiveSkillComponents(operator, operator.normalAttack);
      if (isHealAttack(operatorAttack)) {
        const target = selectHealTarget(operator, operators);
        if (!target) {
          return;
        }
        const result = applyDamageComponents(scaledOperatorComponents(operator, healComponentsForAttack(operatorAttack)), target);
        operator.attackTimer = 0;
        if (result.healing > 0) {
          healedOperators.push(target);
          healingEvents.push({ source: operator, target, amount: result.healing });
        }
        consumeAmmoOnAttack(operator);
        recoverSpOnAttack(operator);
        return;
      }

      const target = selectAttackTarget(operator, enemies);
      if (!target) {
        return;
      }

      const outcome = applyAttackToEnemy(operator, target, operators, operatorAttack);
      consumeNextAttackSkill(operator);
      consumeAmmoOnAttack(operator);
      recoverSpOnAttack(operator);
      operator.attackTimer = 0;
      attacks.push({ source: operator, target });
      if (outcome.result.hpDamage > 0) {
        damageEvents.push({ source: operator, target, amount: outcome.result.hpDamage });
      }
      if (outcome.result.neuralDamage > 0) {
        neuralEvents.push({ source: operator, target, amount: outcome.result.neuralDamage });
      }
      if (outcome.outcome === 'phase_changed') {
        phaseChangedEnemies.push(target);
        return;
      }
      if (outcome.outcome === 'killed' && !killedEnemies.includes(target)) {
        killedEnemies.push(target);
        onEnemyKilled?.(target, operator);
      }
    });

    enemies.filter((enemy) => !enemy.isDead && attackDefinitionsForEnemy(enemy).length > 0).forEach((enemy) => {
      const attackDefinitions = attackDefinitionsForEnemy(enemy);
      const primaryAttack = attackDefinitions[0];
      enemy.attackTimer += deltaSeconds;
      getEnemyBlocker(enemy, operators);
      if (enemy.attackTimer < primaryAttack.interval) {
        return;
      }

      const target = selectEnemyTarget(enemy, operators, primaryAttack);
      if (!target) {
        if (enemy.blockedBy) {
          enemy.blockedBy = null;
        }
        return;
      }

      const result = applyDamageComponents(scaledEnemyComponents(primaryAttack), target);
      enemy.attackTimer = 0;
      damagedOperators.push(target);
      enemyAttacks.push({ source: enemy, target });
      if (result.hpDamage > 0) {
        damageEvents.push({ source: enemy, target, amount: result.hpDamage });
      }
      if (result.neuralDamage > 0) {
        neuralEvents.push({ source: enemy, target, amount: result.neuralDamage });
      }
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
      damagedOperators,
      phaseChangedEnemies,
      attacks,
      enemyAttacks,
      healingEvents,
      damageEvents,
      neuralEvents
    };
  }
}

function applyAttackToEnemy(operator, enemy, operators = [], attack = operator.normalAttack) {
  const result = applyDamageComponents(scaledOperatorComponents(operator, attack), enemy);
  if (enemy.hp > 0) {
    return { outcome: 'damaged', result };
  }
  const previousBlockedBy = enemy.blockedBy;
  if (enemy.hasMorePhases && enemy.advancePhase()) {
    syncPreviousBlockerAfterPhaseChange(operators, previousBlockedBy, enemy);
    return { outcome: 'phase_changed', result };
  }
  enemy.hp = 0;
  enemy.blockedBy = null;
  return { outcome: 'killed', result };
}

function syncPreviousBlockerAfterPhaseChange(operators, operatorId, enemy) {
  if (!operatorId) {
    return;
  }
  const operator = operators.find((item) => item.id === operatorId);
  if (!operator) {
    return;
  }
  if (enemy.blockedBy === operatorId && isValidBlock(enemy, operator)) {
    return;
  }
  if (enemy.blockedBy === operatorId) {
    enemy.blockedBy = null;
  }
  operator.blockedEnemies = operator.blockedEnemies.filter((blockedEnemy) => {
    return blockedEnemy !== enemy && blockedEnemy.id !== enemy.id;
  });
}

export function calculateDamage(attacker, target) {
  const clone = { ...target };
  return applyDamageComponents(scaledOperatorComponents(attacker, attackWithActiveSkillComponents(attacker, attacker.normalAttack)), clone).hpDamage;
}

export function calculatePhysicalDamage(attack, defense) {
  return Math.round(Math.max(attack * 0.05, attack - defense));
}

export function calculateEnemyDamage(enemy, target) {
  const clone = { ...target };
  return applyDamageComponents(scaledEnemyComponents(enemy.normalAttack), clone).hpDamage;
}

function selectAttackTarget(operator, enemies) {
  const liveEnemies = enemies.filter((enemy) => !enemy.isDead);
  const range = operator.normalAttack?.range ?? operator.range;
  if (range?.type === 'melee') {
    return operator.blockedEnemies.find((enemy) => !enemy.isDead) ?? null;
  }

  const inRange = liveEnemies.filter((enemy) => {
    return isCellInRange(operator.cell, enemy.cell, range, operator.direction);
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
  const range = operator.normalAttack?.range ?? operator.range;
  const candidates = operators.filter((candidate) => {
    return !candidate.isDead
      && candidate.hp < candidate.maxHp
      && isCellInRange(operator.cell, candidate.cell, range, operator.direction);
  });

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
}

function selectEnemyTarget(enemy, operators, attack = enemy.normalAttack) {
  const blocker = getEnemyBlocker(enemy, operators);
  if (blocker) {
    return blocker;
  }

  const range = attack?.range ?? enemy.range;
  if (!range || range.type === 'melee') {
    return null;
  }

  const inRange = operators.filter((operator) => {
    return !operator.isDead && isCellInRange(enemy.cell, operator.cell, range);
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

function getEnemyBlocker(enemy, operators) {
  if (!enemy.blockedBy) {
    return null;
  }

  const blocker = operators.find((operator) => operator.id === enemy.blockedBy && !operator.isDead);
  if (blocker && isEnemyBlockedByOperator(enemy, blocker)) {
    return blocker;
  }

  enemy.blockedBy = null;
  return null;
}

function isEnemyBlockedByOperator(enemy, operator) {
  return isValidBlock(enemy, operator)
    && operator.blockedEnemies.some((blockedEnemy) => blockedEnemy === enemy || blockedEnemy.id === enemy.id);
}

function isHealAttack(attack) {
  const components = attack?.components ?? [];
  const hasHeal = components.some((component) => component.type === 'heal')
    || (attack?.effects ?? []).some((effect) => effect.type === 'heal');
  const hasDamage = components.some((component) => component.type !== 'heal');
  return hasHeal && !hasDamage;
}

function healComponentsForAttack(attack) {
  const componentHeals = (attack?.components ?? []).filter((component) => component.type === 'heal');
  const effectHeals = (attack?.effects ?? [])
    .filter((effect) => effect.type === 'heal')
    .map((effect) => ({ type: 'heal', value: effect.value }));
  return {
    ...attack,
    components: [...componentHeals, ...effectHeals]
  };
}

function applyPassiveSelfRegen(operator, deltaSeconds) {
  if (!isMedicLike(operator) || operator.hp >= operator.maxHp) {
    return 0;
  }
  const previousHp = operator.hp;
  const amount = operator.maxHp * MEDIC_SELF_REGEN_RATIO_PER_SECOND * deltaSeconds;
  operator.hp = Math.min(operator.maxHp, operator.hp + amount);
  return operator.hp - previousHp;
}

function isMedicLike(operator) {
  return operator.class === 'medic' || operator.damageType === 'heal';
}

function scaledOperatorComponents(operator, attack) {
  const scale = attackScaleForOperator(operator);
  return (attack?.components ?? []).map((component) => ({
    ...component,
    value: Math.round(component.value * scale)
  }));
}

function attackWithActiveSkillComponents(operator, attack) {
  const activeComponents = getOperatorSkills(operator)
    .filter((skill) => skill.activeRemaining > 0 || skill.ammoRemaining > 0)
    .flatMap((skill) => skill.components ?? []);
  if (activeComponents.length === 0) {
    return attack;
  }
  return {
    ...attack,
    components: [...(attack?.components ?? []), ...activeComponents]
  };
}

function attackScaleForOperator(operator) {
  const base = Number(operator.attack ?? 0);
  return base > 0 ? getEffectiveAttack(operator) / base : 1;
}

function scaledEnemyComponents(attack) {
  return (attack?.components ?? []).map((component) => ({ ...component }));
}

function attackDefinitionsForEnemy(enemy) {
  return [enemy.normalAttack, ...(enemy.attackModules ?? []).map((module) => module.normalAttack)].filter((attack) => {
    return attack && ((attack.components?.length ?? 0) > 0 || (attack.effects?.length ?? 0) > 0);
  });
}

function recoverSpOnAttack(operator) {
  const amount = spOnAttackFor(operator);
  if (amount <= 0) {
    return;
  }
  getOperatorSkills(operator).forEach((skill) => {
    if (skillIsActive(skill) || skill.nextAttackMultiplier || !Number.isFinite(skill.spCost) || skill.spCost <= 0) {
      return;
    }
    skill.sp = Math.min(skill.spCost, Number(skill.sp ?? 0) + amount);
  });
}

function spOnAttackFor(operator) {
  const activeBonus = getOperatorSkills(operator).reduce((sum, skill) => {
    return skillIsActive(skill) ? sum + Number(skill.effect?.spOnAttack ?? 0) : sum;
  }, 0);
  return Math.max(0, Number(operator.spOnAttack ?? 0) + activeBonus);
}

function skillIsActive(skill) {
  return Number(skill?.activeRemaining ?? 0) > 0 || Number(skill?.ammoRemaining ?? 0) > 0;
}
