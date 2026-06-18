import { isCellInRange } from '../utils/RangeMath.js';

export function tickOperatorSkills(deltaSeconds, operators, context = {}) {
  operators.forEach((operator) => {
    if (operator.isDead) {
      return;
    }

    getOperatorSkills(operator).forEach((skill) => {
      if (skill.activeRemaining > 0) {
        skill.activeRemaining = Math.max(0, skill.activeRemaining - deltaSeconds);
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

export function activateOperatorSkill(operator, { costSystem = null, operators = [] } = {}, skillId = null) {
  const skill = selectSkill(operator, skillId);
  if (!skill) {
    return { ok: false, reason: '该干员没有可释放技能' };
  }

  if (skill.sp < skill.spCost) {
    return { ok: false, reason: '技能尚未就绪' };
  }

  if (skill.type === 'instant_cost') {
    if (!costSystem) {
      return { ok: false, reason: '费用系统不可用' };
    }
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
    const target = selectLowestHpGroundOperator(operator, operators, skill);
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
  getOperatorSkills(operator).forEach((skill) => {
    if (skill.activeRemaining > 0) {
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
    return skill.activeRemaining > 0 ? value * (skill.effect?.defenseMultiplier ?? 1) : value;
  }, 1);
  return Math.round(operator.defense * multiplier);
}

export function getEffectiveAttackInterval(operator) {
  return getOperatorSkills(operator).reduce((value, skill) => {
    return skill.activeRemaining > 0 ? value * (skill.effect?.attackIntervalMultiplier ?? 1) : value;
  }, operator.attackInterval);
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
    return skill.triggerMode !== 'auto' && skill.sp >= skill.spCost && skill.activeRemaining <= 0;
  });
}

function selectSkill(operator, skillId = null) {
  const skills = getOperatorSkills(operator);
  if (skillId) {
    return skills.find((skill) => skill.id === skillId) ?? null;
  }
  return skills[0] ?? null;
}

function selectLowestHpGroundOperator(source, operators, skill) {
  const range = skill.range ?? source.range;
  const candidates = operators.filter((operator) => {
    return operator.deployType === 'ground'
      && !operator.isDead
      && operator.hp < operator.maxHp
      && isCellInRange(source.cell, operator.cell, range, source.direction);
  });

  return candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] ?? null;
}
