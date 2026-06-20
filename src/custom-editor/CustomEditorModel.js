import { emptyCustomCatalogs, normalizeCustomCatalogs } from '../data/CatalogStore.js';
import { normalizeEnemyTemplate, normalizeOperatorTemplate } from '../data/CatalogValidators.js';
import { normalizeRange, rangePreset } from '../utils/RangeMath.js';

export function createCustomEditorState(customData = emptyCustomCatalogs()) {
  const normalized = normalizeCustomCatalogs(customData);
  const data = normalized.data;
  const selectedKind = Object.keys(data.operators).length > 0 || Object.keys(data.enemies).length === 0
    ? 'operators'
    : 'enemies';
  return {
    data,
    selectedKind,
    selectedId: firstId(data[selectedKind]),
    message: normalized.errors.join('\n')
  };
}

export function selectTemplate(state, kind, id) {
  assertKind(kind);
  if (!state.data[kind][id]) {
    throw new Error(`${kind} template ${id} does not exist`);
  }
  return {
    ...cloneState(state),
    selectedKind: kind,
    selectedId: id
  };
}

export function createTemplate(state, kind) {
  assertKind(kind);
  const next = cloneState(state);
  const template = kind === 'operators'
    ? createDefaultOperator(next.data.operators)
    : createDefaultEnemy(next.data.enemies);
  next.data[kind][template.id] = template;
  next.selectedKind = kind;
  next.selectedId = template.id;
  next.message = `${template.name} 已创建`;
  return next;
}

export function duplicateTemplate(state) {
  const selected = getSelectedTemplate(state);
  const next = cloneState(state);
  const id = nextCopyId(state.selectedId, next.data[state.selectedKind]);
  const copy = {
    ...selected,
    id,
    name: `${selected.name} Copy`
  };
  next.data[state.selectedKind][id] = copy;
  next.selectedId = id;
  next.message = `${copy.name} 已复制`;
  return next;
}

export function deleteSelectedTemplate(state) {
  const next = cloneState(state);
  if (!next.selectedId) {
    return next;
  }
  delete next.data[next.selectedKind][next.selectedId];
  next.selectedId = firstId(next.data[next.selectedKind]);
  next.message = '已删除';
  return next;
}

export function updateSelectedTemplate(state, patch) {
  const selected = getSelectedTemplate(state);
  const next = cloneState(state);
  const current = next.data[next.selectedKind][selected.id];
  const updated = {
    ...current,
    ...patch
  };
  if (Object.hasOwn(patch, 'deployType') && !Object.hasOwn(patch, 'deployTypes')) {
    updated.deployTypes = [patch.deployType];
  }
  const nextId = patch.id && patch.id !== current.id ? String(patch.id).trim() : current.id;
  updated.id = nextId;

  if (nextId !== current.id) {
    delete next.data[next.selectedKind][current.id];
    next.selectedId = nextId;
  }
  next.data[next.selectedKind][nextId] = updated;
  next.message = '已更新';
  return next;
}

export function applyRangePresetToSelected(state, presetName) {
  const range = rangePreset(presetName);
  const selected = getSelectedTemplate(state);
  return updateSelectedTemplate(state, {
    range,
    normalAttack: {
      ...normalAttackWithComponentIds(selected.normalAttack, selected),
      range
    }
  });
}

export function toggleRangeCellForSelected(state, cell) {
  const selected = getSelectedTemplate(state);
  const currentRange = selected.normalAttack?.range ?? selected.range;
  const range = normalizeRange(currentRange?.type === 'pattern' ? currentRange : { type: 'pattern', cells: [{ x: 0, y: 0 }] });
  const key = `${cell.x},${cell.y}`;
  const existing = new Set(range.cells.map((item) => `${item.x},${item.y}`));
  const cells = existing.has(key)
    ? range.cells.filter((item) => `${item.x},${item.y}` !== key)
    : [...range.cells, { x: cell.x, y: cell.y }];
  const nextRange = normalizeRange({ type: 'pattern', cells: cells.length > 0 ? cells : [{ x: 0, y: 0 }] });
  return updateSelectedTemplate(state, {
    range: nextRange,
    normalAttack: {
      ...normalAttackWithComponentIds(selected.normalAttack, selected),
      range: nextRange
    }
  });
}

export function addSkillToSelected(state) {
  const selected = getSelectedTemplate(state);
  const skills = templateSkills(selected);
  if (state.selectedKind === 'operators' && skills.length >= 3) {
    throw new Error('一个干员最多 3 个技能');
  }

  const nextSkill = state.selectedKind === 'operators'
    ? createDefaultSkill(skills)
    : createDefaultEnemySkill(skills);
  return updateSelectedTemplate(state, withSkillList(selected, [...skills, nextSkill], `${nextSkill.name} 已添加`));
}

export function updateSkillForSelected(state, skillId, patch) {
  const selected = getSelectedTemplate(state);
  const skills = templateSkills(selected);
  const index = skills.findIndex((skill) => skill.id === skillId);
  if (index === -1) {
    throw new Error(`Skill ${skillId} does not exist`);
  }

  const updated = {
    ...skills[index],
    ...patch
  };
  if (patch.components) {
    updated.components = patch.components;
  }
  if (patch.effect) {
    updated.effect = {
      ...(skills[index].effect ?? {}),
      ...patch.effect
    };
  }
  if (patch.id) {
    updated.id = String(patch.id).trim();
  }
  const nextSkills = skills.map((skill, skillIndex) => skillIndex === index ? updated : skill);
  return updateSelectedTemplate(state, withSkillList(selected, nextSkills, '技能已更新'));
}

export function addDamageComponentToSelectedSkill(state, skillId, type = 'physical') {
  const selected = getSelectedTemplate(state);
  const skills = templateSkills(selected);
  const skill = skillWithComponentIds(skills.find((item) => item.id === skillId));
  if (!skill) {
    throw new Error(`Skill ${skillId} does not exist`);
  }
  const nextComponent = {
    id: nextSequentialId('component', Object.fromEntries(skill.components.map((component) => [component.id, component]))),
    type,
    value: 0
  };
  return updateSkillForSelected(state, skillId, {
    components: [nextComponent, ...skill.components]
  });
}

export function updateSkillComponentForSelected(state, skillId, componentId, patch) {
  const selected = getSelectedTemplate(state);
  const skills = templateSkills(selected);
  const skill = skillWithComponentIds(skills.find((item) => item.id === skillId));
  if (!skill) {
    throw new Error(`Skill ${skillId} does not exist`);
  }
  const components = skill.components.map((component) => {
    return component.id === componentId ? { ...component, ...patch } : component;
  });
  if (!components.some((component) => component.id === componentId)) {
    throw new Error(`Skill component ${componentId} does not exist`);
  }
  return updateSkillForSelected(state, skillId, { components });
}

export function removeSkillComponentForSelected(state, skillId, componentId) {
  const selected = getSelectedTemplate(state);
  const skills = templateSkills(selected);
  const skill = skillWithComponentIds(skills.find((item) => item.id === skillId));
  if (!skill) {
    throw new Error(`Skill ${skillId} does not exist`);
  }
  const components = skill.components.filter((component) => component.id !== componentId);
  if (components.length === skill.components.length) {
    throw new Error(`Skill component ${componentId} does not exist`);
  }
  return updateSkillForSelected(state, skillId, { components });
}

export function removeSkillFromSelected(state, skillId) {
  const selected = getSelectedTemplate(state);
  const skills = templateSkills(selected);
  const nextSkills = skills.filter((skill) => skill.id !== skillId);
  if (nextSkills.length === skills.length) {
    throw new Error(`Skill ${skillId} does not exist`);
  }
  return updateSelectedTemplate(state, withSkillList(selected, nextSkills, '技能已删除'));
}

export function applySkillRangePresetToSelected(state, skillId, presetName) {
  return updateSkillForSelected(state, skillId, {
    range: rangePreset(presetName)
  });
}

export function toggleSkillRangeCellForSelected(state, skillId, cell) {
  const selected = getSelectedTemplate(state);
  const skill = templateSkills(selected).find((item) => item.id === skillId);
  if (!skill) {
    throw new Error(`Skill ${skillId} does not exist`);
  }
  const range = normalizeRange(skill.range?.type === 'pattern' ? skill.range : { type: 'pattern', cells: [{ x: 0, y: 0 }] });
  const key = `${cell.x},${cell.y}`;
  const existing = new Set(range.cells.map((item) => `${item.x},${item.y}`));
  const cells = existing.has(key)
    ? range.cells.filter((item) => `${item.x},${item.y}` !== key)
    : [...range.cells, { x: cell.x, y: cell.y }];
  return updateSkillForSelected(state, skillId, {
    range: normalizeRange({ type: 'pattern', cells: cells.length > 0 ? cells : [{ x: 0, y: 0 }] })
  });
}

export function addDamageComponentToSelectedNormalAttack(state, type = 'physical') {
  const selected = getSelectedTemplate(state);
  const normalAttack = normalAttackWithComponentIds(selected.normalAttack, selected);
  const nextComponent = {
    id: nextSequentialId('component', Object.fromEntries(normalAttack.components.map((component) => [component.id, component]))),
    type,
    value: 0
  };
  return updateSelectedTemplate(state, {
    normalAttack: {
      ...normalAttack,
      components: [nextComponent, ...normalAttack.components]
    }
  });
}

export function updateNormalAttackComponentForSelected(state, componentId, patch) {
  const selected = getSelectedTemplate(state);
  const normalAttack = normalAttackWithComponentIds(selected.normalAttack, selected);
  const components = normalAttack.components.map((component) => {
    return component.id === componentId ? { ...component, ...patch } : component;
  });
  if (!components.some((component) => component.id === componentId)) {
    throw new Error(`Damage component ${componentId} does not exist`);
  }
  return updateSelectedTemplate(state, {
    normalAttack: {
      ...normalAttack,
      components
    }
  });
}

export function removeNormalAttackComponentForSelected(state, componentId) {
  const selected = getSelectedTemplate(state);
  const normalAttack = normalAttackWithComponentIds(selected.normalAttack, selected);
  const components = normalAttack.components.filter((component) => component.id !== componentId);
  if (components.length === normalAttack.components.length) {
    throw new Error(`Damage component ${componentId} does not exist`);
  }
  return updateSelectedTemplate(state, {
    normalAttack: {
      ...normalAttack,
      components
    }
  });
}

export function toCustomCatalogJson(state) {
  const normalized = normalizeCustomCatalogs(state.data);
  if (normalized.errors.length > 0) {
    throw new Error(normalized.errors.join('\n'));
  }
  return `${JSON.stringify(normalized.data, null, 2)}\n`;
}

export function loadCustomCatalogJson(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const normalized = normalizeCustomCatalogs(parsed);
  if (normalized.errors.length > 0) {
    throw new Error(normalized.errors.join('\n'));
  }
  return createCustomEditorState(normalized.data);
}

function createDefaultOperator(existing) {
  return normalizeOperatorTemplate({
    id: nextSequentialId('custom-operator', existing),
    name: '自定义干员',
    class: 'custom',
    className: '自定',
    deployType: 'high',
    cost: 10,
    maxHp: 160,
    attack: 30,
    defense: 4,
    resistance: 0,
    attackInterval: 1.2,
    block: 0,
    damageType: 'physical',
    targeting: 'exit-first',
    range: rangePreset('front-line-3'),
    trait: 'custom',
    skill: null,
    skills: [],
    color: '#5fc9ff'
  });
}

function createDefaultEnemy(existing) {
  return normalizeEnemyTemplate({
    id: nextSequentialId('custom-enemy', existing),
    name: '自定义敌人',
    maxHp: 120,
    attack: 10,
    defense: 0,
    resistance: 0,
    speed: 1,
    attackInterval: 1.5,
    canBeBlocked: true,
    isFlying: false,
    rewardCost: 3,
    elite: false,
    boss: false,
    color: '#e15f5f'
  });
}

function getSelectedTemplate(state) {
  if (!state.selectedId) {
    throw new Error('No template selected');
  }
  const selected = state.data[state.selectedKind][state.selectedId];
  if (!selected) {
    throw new Error(`Selected template ${state.selectedId} does not exist`);
  }
  return selected;
}

function ensureOperatorSelected(state) {
  if (state.selectedKind !== 'operators') {
    throw new Error('Range can only be edited for operators');
  }
}

function templateSkills(template) {
  return structuredClone(template.skills ?? [template.skill].filter(Boolean));
}

function withSkillList(selected, skills) {
  return {
    skills,
    skill: skills[0] ?? null
  };
}

function createDefaultSkill(existingSkills) {
  const id = nextSequentialId('skill', Object.fromEntries(existingSkills.map((skill) => [skill.id, skill])));
  return {
    id,
    name: `技能 ${existingSkills.length + 1}`,
    description: '自定义技能说明。',
    spCost: 10,
    triggerMode: 'manual',
    type: 'buff',
    duration: 8,
    effect: { attackMultiplier: 1.2 },
    components: []
  };
}

function createDefaultEnemySkill(existingSkills) {
  const id = nextSequentialId('enemy-skill', Object.fromEntries(existingSkills.map((skill) => [skill.id, skill])));
  return {
    id,
    name: `敌方技能 ${existingSkills.length + 1}`,
    description: '生命降低到阈值时释放。',
    triggerMode: 'hp_threshold',
    hpThresholdPercent: 50,
    range: rangePreset('front-line-3'),
    targeting: 'nearest',
    components: [{ id: 'component-1', type: 'physical', value: 10 }],
    effects: []
  };
}

function normalAttackWithComponentIds(normalAttack, template) {
  const attack = structuredClone(normalAttack ?? {
    interval: template.attackInterval ?? 1.5,
    range: template.range ?? rangePreset('front-line-3'),
    targeting: template.targeting ?? 'exit-first',
    components: template.damageType === 'physical' || template.damageType === 'arts' || template.damageType === 'heal'
      ? [{ type: template.damageType, value: template.attack ?? 0 }]
      : [],
    effects: []
  });
  return {
    ...attack,
    components: (attack.components ?? []).map((component, index) => ({
      id: component.id ?? `component-${index + 1}`,
      ...component
    })),
    effects: attack.effects ?? []
  };
}

function skillWithComponentIds(skill) {
  if (!skill) {
    return null;
  }
  return {
    ...structuredClone(skill),
    components: (skill.components ?? []).map((component, index) => ({
      id: component.id ?? `component-${index + 1}`,
      ...component
    }))
  };
}

function assertKind(kind) {
  if (kind !== 'operators' && kind !== 'enemies') {
    throw new Error(`Unknown template kind ${kind}`);
  }
}

function firstId(collection) {
  return Object.keys(collection)[0] ?? null;
}

function nextSequentialId(prefix, existing) {
  let index = 1;
  while (existing[`${prefix}-${index}`]) {
    index += 1;
  }
  return `${prefix}-${index}`;
}

function nextCopyId(id, existing) {
  let index = 1;
  while (existing[`${id}-copy-${index}`]) {
    index += 1;
  }
  return `${id}-copy-${index}`;
}

function cloneState(state) {
  return structuredClone(state);
}
