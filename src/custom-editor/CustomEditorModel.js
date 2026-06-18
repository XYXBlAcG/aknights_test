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
  ensureOperatorSelected(state);
  return updateSelectedTemplate(state, {
    range: rangePreset(presetName)
  });
}

export function toggleRangeCellForSelected(state, cell) {
  ensureOperatorSelected(state);
  const selected = getSelectedTemplate(state);
  const range = normalizeRange(selected.range?.type === 'pattern' ? selected.range : { type: 'pattern', cells: [{ x: 0, y: 0 }] });
  const key = `${cell.x},${cell.y}`;
  const existing = new Set(range.cells.map((item) => `${item.x},${item.y}`));
  const cells = existing.has(key)
    ? range.cells.filter((item) => `${item.x},${item.y}` !== key)
    : [...range.cells, { x: cell.x, y: cell.y }];
  return updateSelectedTemplate(state, {
    range: normalizeRange({ type: 'pattern', cells: cells.length > 0 ? cells : [{ x: 0, y: 0 }] })
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

