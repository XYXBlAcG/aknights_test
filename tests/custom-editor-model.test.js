import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRangePresetToSelected,
  createCustomEditorState,
  createTemplate,
  deleteSelectedTemplate,
  duplicateTemplate,
  loadCustomCatalogJson,
  selectTemplate,
  toCustomCatalogJson,
  toggleRangeCellForSelected,
  updateSelectedTemplate
} from '../src/custom-editor/CustomEditorModel.js';

test('custom editor model creates, updates, duplicates, and deletes operator templates', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'operators');
  const operatorId = state.selectedId;

  state = updateSelectedTemplate(state, {
    name: '手绘狙击',
    attack: 45,
    range: { type: 'pattern', cells: [{ x: 0, y: 0 }] }
  });
  state = applyRangePresetToSelected(state, 'front-line-3');
  state = toggleRangeCellForSelected(state, { x: 4, y: 0 });
  state = toggleRangeCellForSelected(state, { x: 4, y: 0 });

  const operator = state.data.operators[operatorId];
  assert.equal(operator.name, '手绘狙击');
  assert.equal(operator.attack, 45);
  assert.deepEqual(operator.range.cells, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);

  state = duplicateTemplate(state);
  assert.notEqual(state.selectedId, operatorId);
  assert.equal(Object.keys(state.data.operators).length, 2);

  state = deleteSelectedTemplate(state);
  assert.equal(Object.keys(state.data.operators).length, 1);
});

test('custom editor model creates and edits enemies', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'enemies');
  const enemyId = state.selectedId;

  state = updateSelectedTemplate(state, {
    name: '高速飞行兵',
    maxHp: 160,
    speed: 1.8,
    isFlying: true,
    canBeBlocked: false
  });

  assert.equal(state.data.enemies[enemyId].name, '高速飞行兵');
  assert.equal(state.data.enemies[enemyId].speed, 1.8);
  assert.equal(state.data.enemies[enemyId].isFlying, true);
});

test('custom editor model exports and imports valid catalog JSON', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'operators');
  state = updateSelectedTemplate(state, { id: 'pattern-caster', name: '手绘术士', damageType: 'arts' });
  state = createTemplate(state, 'enemies');
  state = updateSelectedTemplate(state, { id: 'elite-runner', name: '精英跑者', elite: true });

  const json = toCustomCatalogJson(state);
  const imported = loadCustomCatalogJson(json);
  const selected = selectTemplate(imported, 'operators', 'pattern-caster');

  assert.equal(imported.data.operators['pattern-caster'].name, '手绘术士');
  assert.equal(imported.data.enemies['elite-runner'].elite, true);
  assert.equal(selected.selectedId, 'pattern-caster');
});

