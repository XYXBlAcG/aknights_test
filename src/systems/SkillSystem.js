import { isCellInDiamondRange } from '../utils/GridMath.js';

export function tickOperatorSkills(deltaSeconds, operators) {
  operators.forEach((operator) => {
    if (!operator.skill || operator.isDead) {
      return;
    }

    if (operator.skill.activeRemaining > 0) {
      operator.skill.activeRemaining = Math.max(0, operator.skill.activeRemaining - deltaSeconds);
      return;
    }

    operator.skill.sp = Math.min(operator.skill.spCost, operator.skill.sp + deltaSeconds);
  });
}

export function activateOperatorSkill(operator, { costSystem, operators }) {
  if (!operator?.skill) {
    return { ok: false, reason: '该干员没有可释放技能' };
  }

  if (operator.skill.sp < operator.skill.spCost) {
    return { ok: false, reason: '技能尚未就绪' };
  }

  const skill = operator.skill;

  if (skill.type === 'instant_cost') {
    skill.sp = 0;
    costSystem.add(skill.amount);
    return { ok: true, skill, message: `${operator.name}释放${skill.name}` };
  }

  if (skill.type === 'buff') {
    skill.sp = 0;
    skill.activeRemaining = skill.duration;
    if (skill.healPercent) {
      operator.hp = Math.min(operator.maxHp, operator.hp + Math.round(operator.maxHp * skill.healPercent));
    }
    return { ok: true, skill, message: `${operator.name}释放${skill.name}` };
  }

  if (skill.type === 'next_attack') {
    skill.sp = 0;
    skill.nextAttackMultiplier = skill.effect?.nextAttackMultiplier ?? 1;
    return { ok: true, skill, message: `${operator.name}释放${skill.name}` };
  }

  if (skill.type === 'instant_heal') {
    const target = selectLowestHpGroundOperator(operator, operators);
    if (!target) {
      return { ok: false, reason: '没有可治疗目标' };
    }
    skill.sp = 0;
    target.hp = Math.min(target.maxHp, target.hp + skill.amount);
    return { ok: true, skill, message: `${operator.name}释放${skill.name}` };
  }

  return { ok: false, reason: '未知技能类型' };
}

export function getEffectiveAttack(operator) {
  let multiplier = 1;
  if (operator.skill?.activeRemaining > 0) {
    multiplier *= operator.skill.effect?.attackMultiplier ?? 1;
  }
  if (operator.skill?.nextAttackMultiplier) {
    multiplier *= operator.skill.nextAttackMultiplier;
  }
  return Math.round(operator.attack * multiplier);
}

export function getEffectiveDefense(operator) {
  if (operator.skill?.activeRemaining > 0) {
    return Math.round(operator.defense * (operator.skill.effect?.defenseMultiplier ?? 1));
  }
  return operator.defense;
}

export function getEffectiveAttackInterval(operator) {
  if (operator.skill?.activeRemaining > 0) {
    return operator.attackInterval * (operator.skill.effect?.attackIntervalMultiplier ?? 1);
  }
  return operator.attackInterval;
}

export function consumeNextAttackSkill(operator) {
  if (operator.skill?.nextAttackMultiplier) {
    operator.skill.nextAttackMultiplier = null;
  }
}

function selectLowestHpGroundOperator(source, operators) {
  const candidates = operators.filter((operator) => {
    return operator.deployType === 'ground'
      && !operator.isDead
      && operator.hp < operator.maxHp
      && isCellInDiamondRange(source.cell, operator.cell, source.skill.rangeRadius ?? source.range?.radius ?? 2.5);
  });

  return candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] ?? null;
}
