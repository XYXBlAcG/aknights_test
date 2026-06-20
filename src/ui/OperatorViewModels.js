export function buildSkillPanelModel(operator) {
  const skills = operator?.skills ?? [operator?.skill].filter(Boolean);
  return skills.map((skill) => {
    const ammo = Number(skill.ammo ?? 0);
    const ammoRemaining = Number(skill.ammoRemaining ?? 0);
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      sp: Math.floor(skill.sp ?? 0),
      spCost: skill.spCost,
      ready: (skill.sp ?? 0) >= skill.spCost,
      activeRemaining: Math.ceil(skill.activeRemaining ?? 0),
      triggerMode: skill.triggerMode ?? 'manual',
      manual: (skill.triggerMode ?? 'manual') !== 'auto',
      rangeSummary: summarizeRange(skill.range),
      ...(ammo > 0 ? { ammo, ammoRemaining } : {})
    };
  });
}

export function buildOperatorDisplayStats(operator) {
  const normalComponents = operator?.normalAttack?.components ?? [];
  const activeSkillComponents = (operator?.skills ?? [])
    .filter((skill) => skill.activeRemaining > 0)
    .flatMap((skill) => skill.components ?? []);
  const components = [...normalComponents, ...activeSkillComponents];
  const totals = components.reduce((sum, component) => {
    if (component.type === 'physical' || component.type === 'arts' || component.type === 'heal') {
      const value = componentDisplayAttackValue(component);
      sum.total += value;
      sum.byType[component.type] = (sum.byType[component.type] ?? 0) + value;
    }
    return sum;
  }, { total: 0, byType: {} });
  const labels = { physical: '物理', arts: '法术', heal: '治疗' };
  const attackSummary = Object.entries(totals.byType)
    .map(([type, value]) => `${labels[type] ?? type}${value}`)
    .join(' / ') || '0';
  return {
    hp: Math.ceil(operator?.hp ?? 0),
    maxHp: Math.ceil(operator?.maxHp ?? 0),
    attack: Math.round(totals.total),
    attackSummary,
    defense: Math.round(operator?.defense ?? 0),
    resistance: Math.round(operator?.resistance ?? 0),
    attackInterval: operator?.attackInterval ?? 0,
    block: operator?.block ?? 0,
    blockedCount: operator?.blockedCount ?? 0
  };
}

export function buildOperatorSpBarModel(operator) {
  const skills = operator?.skills ?? [operator?.skill].filter(Boolean);
  const ammoSkill = skills.find((item) => Number(item.ammoRemaining ?? 0) > 0 && Number(item.ammo ?? 0) > 0);
  if (ammoSkill) {
    return {
      visible: true,
      ratio: Math.max(0, Math.min(1, ammoSkill.ammoRemaining / ammoSkill.ammo)),
      ready: false,
      mode: 'ammo'
    };
  }

  const activeSkill = skills.find((item) => item.activeRemaining > 0 && Number(item.duration) > 0);
  if (activeSkill) {
    return {
      visible: true,
      ratio: Math.max(0, Math.min(1, activeSkill.activeRemaining / activeSkill.duration)),
      ready: false,
      mode: 'active'
    };
  }

  const skill = skills.find((item) => (item.triggerMode ?? 'manual') !== 'auto') ?? skills[0];
  if (!skill) {
    return { visible: false, ratio: 0, ready: false };
  }

  const spCost = Number(skill.spCost);
  if (!Number.isFinite(spCost) || spCost <= 0) {
    return { visible: false, ratio: 0, ready: false };
  }

  const sp = Number(skill.sp ?? 0);
  const currentSp = Number.isFinite(sp) ? sp : 0;
  return {
    visible: true,
    ratio: Math.max(0, Math.min(1, currentSp / spCost)),
    ready: currentSp >= spCost
  };
}

export function buildOperatorNeuralBarModel(operator) {
  const threshold = Number(operator?.neuralThreshold ?? 0);
  const value = Number(operator?.neuralDamage ?? 0);
  if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isFinite(value) || value <= 0) {
    return { visible: false, ratio: 0 };
  }
  return {
    visible: true,
    ratio: Math.max(0, Math.min(1, value / threshold))
  };
}

function summarizeRange(range) {
  if (!range) {
    return '默认范围';
  }
  if (range.type === 'melee') {
    return '自身格';
  }
  if (range.type === 'diamond') {
    return `菱形${range.radius}`;
  }
  if (range.type === 'pattern') {
    return `${range.cells?.length ?? 0}格`;
  }
  return '自定义';
}

function componentDisplayAttackValue(component) {
  const base = Number(component?.value ?? 0);
  const multiplier = Number(component?.attackMultiplier ?? 1);
  const flat = Number(component?.flatAttack ?? 0);
  return Math.max(0, base * multiplier + flat);
}
