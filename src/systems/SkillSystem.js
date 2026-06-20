import { isCellInRange } from '../utils/RangeMath.js';
import { manhattanDistance } from '../utils/GridMath.js';
import { applyDamageComponents } from './DamageSystem.js';

export function tickOperatorSkills(deltaSeconds, operators, context = {}) {
  operators.forEach((operator) => {
    if (operator.isDead) {
      return;
    }

    getOperatorSkills(operator).forEach((skill) => {
      if (skill.activeRemaining > 0) {
        const previous = skill.activeRemaining;
        skill.activeRemaining = Math.max(0, skill.activeRemaining - deltaSeconds);
        if (previous > 0 && skill.activeRemaining === 0) {
          finishActiveSkill(operator, skill);
        }
        return;
      }

      if (skill.ammoRemaining > 0) {
        return;
      }

      if (skill.nextAttackMultiplier) {
        return;
      }

      skill.sp = Math.min(skill.spCost, skill.sp + deltaSeconds);
      if (skill.triggerMode === 'auto' && skill.sp >= skill.spCost) {
        activateOperatorSkill(operator, context, skill.id);
      }
    });
  });
}

export function activateOperatorSkill(operator, context = {}, skillId = null) {
  const { costSystem = null, operators = [] } = context;
  const skill = selectSkill(operator, skillId);
  if (!skill) {
    return { ok: false, reason: '该干员没有可释放技能' };
  }

  if (skill.sp < skill.spCost) {
    return { ok: false, reason: '技能尚未就绪' };
  }

  const componentPlan = planOperatorSkillComponents(operator, skill, context);
  if (!componentPlan.ok) {
    return { ok: false, reason: componentPlan.reason };
  }

  if (skill.type === 'instant_cost') {
    if (!costSystem) {
      return { ok: false, reason: '费用系统不可用' };
    }
    skill.sp = 0;
    costSystem.add(skill.amount);
    applyOperatorSkillComponents(operator, skill, context, componentPlan);
    return { ok: true, skill, message: `${operator.name}释放${skill.name}` };
  }

  if (skill.type === 'buff') {
    skill.sp = 0;
    skill.activeRemaining = Number(skill.duration ?? 0);
    skill.ammoRemaining = Number(skill.ammo ?? 0);
    applySkillEffects(operator, skill, { costSystem, operators });
    applySkillStatModifiers(operator, skill);
    if (skill.healPercent) {
      operator.hp = Math.min(operator.maxHp, operator.hp + Math.round(operator.maxHp * skill.healPercent));
    }
    if (!skillComponentsApplyOnAttacks(skill)) {
      applyOperatorSkillComponents(operator, skill, context, componentPlan);
    }
    return { ok: true, skill, message: `${operator.name}释放${skill.name}` };
  }

  if (skill.type === 'next_attack') {
    skill.sp = 0;
    skill.nextAttackMultiplier = skill.effect?.nextAttackMultiplier ?? 1;
    applyOperatorSkillComponents(operator, skill, context, componentPlan);
    return { ok: true, skill, message: `${operator.name}释放${skill.name}` };
  }

  if (skill.type === 'instant_heal') {
    const target = selectLowestHpGroundOperator(operator, operators, skill);
    if (!target) {
      return { ok: false, reason: '没有可治疗目标' };
    }
    skill.sp = 0;
    target.hp = Math.min(target.maxHp, target.hp + skill.amount);
    applyOperatorSkillComponents(operator, skill, context, componentPlan);
    return { ok: true, skill, message: `${operator.name}释放${skill.name}` };
  }

  return { ok: false, reason: '未知技能类型' };
}

export function tickEnemySkills(deltaSeconds, enemies, operators, context = {}) {
  enemies.forEach((enemy) => {
    if (enemy.isDead) {
      return;
    }
    (enemy.skills ?? []).forEach((skill) => {
      if ((skill.triggerMode ?? 'hp_threshold') !== 'hp_threshold' || skill.triggered) {
        return;
      }
      const threshold = Number(skill.hpThresholdPercent ?? 50);
      if ((enemy.hp / enemy.maxHp) * 100 > threshold) {
        return;
      }
      const target = selectEnemySkillTarget(enemy, skill, operators);
      if (!target) {
        return;
      }
      applyDamageComponents(skill.components ?? [], target);
      applyEnemySkillEffects(enemy, skill, target, context);
      skill.triggered = true;
      context.onEnemySkill?.({ source: enemy, target, skill, deltaSeconds });
    });
  });
}

export function applySkillEffects(source, skill, context) {
  (skill.effects ?? []).forEach((effect) => {
    if (effect.type === 'cost') context.costSystem?.add(effect.value);
    if (effect.type === 'heal') healSkillTarget(source, skill, context.operators ?? [], effect.value);
    if (effect.type.endsWith('_multiplier')) {
      source.activeEffects = source.activeEffects ?? [];
      source.activeEffects.push({ ...effect, remaining: skill.duration ?? 0 });
    }
  });
}

export function getEffectiveAttack(operator) {
  let multiplier = 1;
  getOperatorSkills(operator).forEach((skill) => {
    if (isActiveBuffSkill(skill)) {
      multiplier *= skill.effect?.attackMultiplier ?? 1;
    }
    if (skill.nextAttackMultiplier) {
      multiplier *= skill.nextAttackMultiplier;
    }
  });
  return Math.round(operator.attack * multiplier);
}

export function getEffectiveDefense(operator) {
  const multiplier = getOperatorSkills(operator).reduce((value, skill) => {
    return isActiveBuffSkill(skill) ? value * (skill.effect?.defenseMultiplier ?? 1) : value;
  }, 1);
  return Math.round(operator.defense * multiplier);
}

export function getEffectiveAttackInterval(operator) {
  return getOperatorSkills(operator).reduce((value, skill) => {
    return isActiveBuffSkill(skill) ? value * (skill.effect?.attackIntervalMultiplier ?? 1) : value;
  }, operator.normalAttack?.interval ?? operator.attackInterval);
}

export function consumeNextAttackSkill(operator) {
  getOperatorSkills(operator).forEach((skill) => {
    if (skill.nextAttackMultiplier) {
      skill.nextAttackMultiplier = null;
    }
  });
}

export function getOperatorSkills(operator) {
  if (!operator) {
    return [];
  }
  if (operator.skill && (!Array.isArray(operator.skills) || !operator.skills.includes(operator.skill))) {
    return [operator.skill];
  }
  return operator.skills ?? [operator.skill].filter(Boolean);
}

export function hasReadyManualSkill(operator) {
  return getOperatorSkills(operator).some((skill) => {
    return skill.triggerMode !== 'auto' && skill.sp >= skill.spCost && !isActiveBuffSkill(skill);
  });
}

export function consumeAmmoOnAttack(operator) {
  getOperatorSkills(operator).forEach((skill) => {
    if (skill.ammoRemaining > 0) {
      skill.ammoRemaining = Math.max(0, skill.ammoRemaining - 1);
      if (skill.ammoRemaining === 0) {
        finishActiveSkill(operator, skill);
      }
    }
  });
}

function selectSkill(operator, skillId = null) {
  const skills = getOperatorSkills(operator);
  if (skillId) {
    return skills.find((skill) => skill.id === skillId) ?? null;
  }
  return skills[0] ?? null;
}

function planOperatorSkillComponents(source, skill, { operators = [], enemies = [] } = {}) {
  const damageComponents = (skill.components ?? []).filter((component) => component.type !== 'heal');
  const healComponents = (skill.components ?? []).filter((component) => component.type === 'heal');
  if (skillComponentsApplyOnAttacks(skill)) {
    return { ok: true, damageComponents, healComponents, damageTarget: null, healTarget: null };
  }
  if (damageComponents.length === 0 && healComponents.length === 0) {
    return { ok: true, damageComponents, healComponents, damageTarget: null, healTarget: null };
  }

  const damageTarget = damageComponents.length > 0
    ? selectOperatorSkillEnemyTarget(source, skill, enemies)
    : null;
  const healTarget = healComponents.length > 0
    ? selectLowestHpGroundOperator(source, operators, skill)
    : null;

  if (!damageTarget && !healTarget) {
    if (damageComponents.length > 0 && healComponents.length === 0) {
      return { ok: false, reason: '没有攻击目标' };
    }
    if (healComponents.length > 0 && damageComponents.length === 0) {
      return { ok: false, reason: '没有可治疗目标' };
    }
    return { ok: false, reason: '没有可作用目标' };
  }

  return { ok: true, damageComponents, healComponents, damageTarget, healTarget };
}

function applyOperatorSkillComponents(source, skill, context, plan) {
  if (!plan || ((plan.damageComponents?.length ?? 0) === 0 && (plan.healComponents?.length ?? 0) === 0)) {
    return;
  }

  if (plan.damageTarget && plan.damageComponents.length > 0) {
    const result = applyDamageComponents(plan.damageComponents, plan.damageTarget);
    if (result.hpDamage > 0 || result.neuralDamage > 0 || result.neuralBurstDamage > 0) {
      context.onOperatorSkillEvent?.({ type: 'operator_attack', source, target: plan.damageTarget, skill, result });
    }
    resolveSkillEnemyDamage(plan.damageTarget, source, skill, context);
  }

  if (plan.healTarget && plan.healComponents.length > 0) {
    const result = applyDamageComponents(plan.healComponents, plan.healTarget);
    if (result.healing > 0) {
      context.onOperatorSkillEvent?.({ type: 'operator_heal', source, target: plan.healTarget, skill, result });
    }
  }
}

function skillComponentsApplyOnAttacks(skill) {
  return skill.type === 'buff'
    && (Number(skill.duration ?? 0) > 0 || Number(skill.ammo ?? 0) > 0)
    && (skill.components?.length ?? 0) > 0;
}

function applySkillStatModifiers(operator, skill) {
  const modifier = statModifierFromSkill(skill);
  if (!hasStatModifier(modifier) || skill.appliedStatModifier) {
    return;
  }
  skill.appliedStatModifier = modifier;
  operator.maxHp += modifier.maxHpDelta;
  operator.hp += Math.max(0, modifier.maxHpDelta);
  operator.defense += modifier.defenseDelta;
  operator.resistance += modifier.resistanceDelta;
  operator.block += modifier.blockDelta;
}

function removeSkillStatModifiers(operator, skill) {
  const modifier = skill.appliedStatModifier;
  if (!modifier) {
    return;
  }
  operator.maxHp = Math.max(1, operator.maxHp - modifier.maxHpDelta);
  operator.hp = Math.min(operator.maxHp, operator.hp - Math.max(0, modifier.maxHpDelta));
  operator.defense -= modifier.defenseDelta;
  operator.resistance -= modifier.resistanceDelta;
  operator.block -= modifier.blockDelta;
  skill.appliedStatModifier = null;
}

function finishActiveSkill(operator, skill) {
  skill.activeRemaining = 0;
  skill.ammoRemaining = 0;
  removeSkillStatModifiers(operator, skill);
}

function statModifierFromSkill(skill) {
  const effect = skill.effect ?? {};
  return {
    maxHpDelta: Number(effect.maxHpDelta ?? 0),
    defenseDelta: Number(effect.defenseDelta ?? 0),
    resistanceDelta: Number(effect.resistanceDelta ?? 0),
    blockDelta: Number(effect.blockDelta ?? 0)
  };
}

function hasStatModifier(modifier) {
  return Object.values(modifier).some((value) => Number.isFinite(value) && value !== 0);
}

function isActiveBuffSkill(skill) {
  return Number(skill?.activeRemaining ?? 0) > 0 || Number(skill?.ammoRemaining ?? 0) > 0;
}

function resolveSkillEnemyDamage(enemy, source, skill, context) {
  if (enemy.hp > 0) {
    return;
  }
  if (enemy.hasMorePhases) {
    const previousId = enemy.id;
    enemy.advancePhase();
    syncPreviousBlockerAfterPhaseChange(context.operators ?? [], previousId, enemy);
    context.onOperatorSkillEvent?.({ type: 'enemy_phase_break', source, target: enemy, skill });
    return;
  }
  context.onEnemyKilled?.(enemy);
  context.onOperatorSkillEvent?.({ type: 'enemy_death', source, target: enemy, skill });
}

function syncPreviousBlockerAfterPhaseChange(operators, operatorId, enemy) {
  operators.forEach((operator) => {
    operator.blockedEnemies = operator.blockedEnemies.filter((blockedEnemy) => blockedEnemy.id !== operatorId && !blockedEnemy.isDead);
    if (enemy.blockedBy === operator.id && enemy.canBeBlocked !== false) {
      operator.blockedEnemies.push(enemy);
    }
  });
}

function selectOperatorSkillEnemyTarget(source, skill, enemies) {
  const range = skill.range ?? source.normalAttack?.range ?? source.range;
  const candidates = enemies.filter((enemy) => {
    return !enemy.isDead
      && !enemy.reachedExit
      && isCellInRange(source.cell, enemy.cell, range, source.direction);
  });
  if (candidates.length === 0) {
    return null;
  }

  const targeting = skill.targeting ?? source.targeting;
  if (targeting === 'blocked-first') {
    const blocked = candidates.find((enemy) => enemy.blockedBy === source.id || source.blockedEnemies?.includes(enemy));
    if (blocked) {
      return blocked;
    }
  }
  if (targeting === 'flying-first') {
    const flying = candidates.find((enemy) => enemy.isFlying);
    if (flying) {
      return flying;
    }
  }
  if (targeting === 'high-defense') {
    return [...candidates].sort((a, b) => (b.defense ?? 0) - (a.defense ?? 0))[0];
  }
  if (targeting === 'lowest-hp-percent') {
    return [...candidates].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
  }
  return [...candidates].sort((a, b) => (b.pathDistance ?? 0) - (a.pathDistance ?? 0))[0];
}

function selectLowestHpGroundOperator(source, operators, skill) {
  const range = skill.range ?? source.range;
  const candidates = operators.filter((operator) => {
    return !operator.isDead
      && operator.hp < operator.maxHp
      && isCellInRange(source.cell, operator.cell, range, source.direction);
  });

  return candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] ?? null;
}

function healSkillTarget(source, skill, operators, value) {
  const target = selectLowestHpGroundOperator(source, operators, skill);
  if (target) {
    target.hp = Math.min(target.maxHp, target.hp + value);
  }
}

function selectEnemySkillTarget(enemy, skill, operators) {
  const range = skill.range ?? enemy.normalAttack?.range ?? enemy.range;
  const candidates = operators.filter((operator) => {
    return !operator.isDead && isCellInRange(enemy.cell, operator.cell, range);
  });
  if (candidates.length === 0) {
    return null;
  }
  if (skill.targeting === 'lowest-hp-percent') {
    return [...candidates].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
  }
  return [...candidates].sort((a, b) => {
    return manhattanDistance(enemy.cell, a.cell) - manhattanDistance(enemy.cell, b.cell);
  })[0];
}

function applyEnemySkillEffects(enemy, skill, target, context) {
  (skill.effects ?? []).forEach((effect) => {
    if (effect.type === 'heal') {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + effect.value);
    }
    if (effect.type === 'damage') {
      target.hp = Math.max(0, target.hp - effect.value);
    }
    context.onEnemySkillEffect?.({ enemy, target, skill, effect });
  });
}
