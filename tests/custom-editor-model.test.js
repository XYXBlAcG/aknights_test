import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDamageComponentToSelectedNormalAttack,
  addDamageComponentToSelectedSkill,
  addSkillToSelected,
  applyRangePresetToSelected,
  applySkillRangePresetToSelected,
  createCustomEditorState,
  createTemplate,
  deleteSelectedTemplate,
  duplicateTemplate,
  loadCustomCatalogJson,
  removeSkillFromSelected,
  removeNormalAttackComponentForSelected,
  removeSkillComponentForSelected,
  selectTemplate,
  toCustomCatalogJson,
  toggleRangeCellForSelected,
  toggleSkillRangeCellForSelected,
  updateNormalAttackComponentForSelected,
  updateSkillComponentForSelected,
  updateSkillForSelected,
  updateSelectedTemplate
} from '../src/custom-editor/CustomEditorModel.js';
import { Operator } from '../src/entities/Operator.js';
import { buildOperatorDisplayStats } from '../src/ui/OperatorViewModels.js';

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

test('custom editor single deploy type updates clear stale dual deploy terrain', () => {
  let state = createCustomEditorState({
    operators: {
      flexible: {
        id: 'flexible',
        name: '灵活部署',
        class: 'custom',
        className: '自定',
        deployType: 'high',
        deployTypes: ['ground', 'high'],
        cost: 10,
        maxHp: 120,
        attack: 20,
        defense: 2,
        resistance: 0,
        attackInterval: 1,
        block: 0,
        damageType: 'physical',
        range: { type: 'pattern', cells: [{ x: 0, y: 0 }] },
        targeting: 'exit-first',
        color: '#ffffff'
      }
    },
    enemies: {}
  });

  state = updateSelectedTemplate(state, { deployType: 'ground' });
  const exported = JSON.parse(toCustomCatalogJson(state));

  assert.deepEqual(exported.operators.flexible.deployTypes, ['ground']);
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

test('custom editor model edits up to three operator skills with custom ranges', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'operators');
  const operatorId = state.selectedId;

  state = addSkillToSelected(state);
  const firstSkillId = state.data.operators[operatorId].skills[0].id;
  state = updateSkillForSelected(state, firstSkillId, {
    id: 'auto_strike',
    name: '自动强袭',
    description: '自动触发的攻击强化。',
    triggerMode: 'auto',
    type: 'buff',
    spCost: 8,
    duration: 6,
    effect: { attackMultiplier: 1.5 }
  });
  state = applySkillRangePresetToSelected(state, 'auto_strike', 'front-line-3');
  state = toggleSkillRangeCellForSelected(state, 'auto_strike', { x: 4, y: 0 });

  state = addSkillToSelected(state);
  state = addSkillToSelected(state);

  assert.equal(state.data.operators[operatorId].skills.length, 3);
  assert.equal(state.data.operators[operatorId].skills[0].triggerMode, 'auto');
  assert.deepEqual(state.data.operators[operatorId].skills[0].range.cells, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 4, y: 0 }
  ]);
  assert.throws(() => addSkillToSelected(state), /最多 3 个技能/);

  state = removeSkillFromSelected(state, 'auto_strike');
  assert.equal(state.data.operators[operatorId].skills.length, 2);
});

test('custom editor edits normal attack damage components', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'operators');

  state = updateSelectedTemplate(state, { attack: 0 });
  state = addDamageComponentToSelectedNormalAttack(state, 'heal');
  state = updateNormalAttackComponentForSelected(state, state.data.operators[state.selectedId].normalAttack.components[0].id, {
    value: 42,
    attackMultiplier: 1.4,
    flatAttack: 12,
    damageMultiplier: 1.2,
    penetrationPercent: 0.25,
    penetrationFlat: 8
  });

  const component = state.data.operators[state.selectedId].normalAttack.components[0];
  assert.equal(component.type, 'heal');
  assert.equal(component.value, 42);
  assert.equal(component.attackMultiplier, 1.4);
  assert.equal(component.flatAttack, 12);
  assert.equal(component.damageMultiplier, 1.2);
  assert.equal(component.penetrationPercent, 0.25);
  assert.equal(component.penetrationFlat, 8);

  state = removeNormalAttackComponentForSelected(state, component.id);
  assert.equal(state.data.operators[state.selectedId].normalAttack.components.some((item) => item.id === component.id), false);
});

test('custom editor export derives saved operator attack from normal attack components', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'operators');
  const operatorId = state.selectedId;
  const componentId = state.data.operators[operatorId].normalAttack.components[0].id ?? 'component-1';

  state = updateNormalAttackComponentForSelected(state, componentId, {
    type: 'physical',
    value: 50,
    attackMultiplier: 1.5,
    flatAttack: 10
  });

  const exported = JSON.parse(toCustomCatalogJson(state));
  const imported = loadCustomCatalogJson(exported);
  const savedOperator = exported.operators[operatorId];
  const importedOperator = imported.data.operators[operatorId];

  assert.equal(savedOperator.attack, 85);
  assert.equal(importedOperator.attack, 85);
});

test('saved custom operator runtime attack matches battle panel attack', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'operators');
  const operatorId = state.selectedId;
  const componentId = state.data.operators[operatorId].normalAttack.components[0].id ?? 'component-1';

  state = updateNormalAttackComponentForSelected(state, componentId, {
    type: 'arts',
    value: 70,
    attackMultiplier: 1.2,
    flatAttack: 6
  });

  const exported = JSON.parse(toCustomCatalogJson(state));
  const runtimeOperator = new Operator(exported.operators[operatorId], { x: 0, y: 0 });
  const stats = buildOperatorDisplayStats(runtimeOperator);

  assert.equal(runtimeOperator.attack, 90);
  assert.equal(stats.attack, 90);
  assert.equal(stats.attackSummary, '法术90');
});

test('custom editor edits skill effect components', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'operators');
  state = addSkillToSelected(state);
  const skillId = state.data.operators[state.selectedId].skills[0].id;

  state = addDamageComponentToSelectedSkill(state, skillId, 'heal');
  const componentId = state.data.operators[state.selectedId].skills[0].components[0].id;
  state = updateSkillComponentForSelected(state, skillId, componentId, {
    value: 35,
    damageMultiplier: 1.5,
    penetrationFlat: 6
  });

  assert.deepEqual(state.data.operators[state.selectedId].skills[0].components[0], {
    id: componentId,
    type: 'heal',
    value: 35,
    damageMultiplier: 1.5,
    penetrationFlat: 6
  });

  state = removeSkillComponentForSelected(state, skillId, componentId);
  assert.equal(state.data.operators[state.selectedId].skills[0].components.length, 0);
});

test('custom editor edits enemy life value block bypass and hp threshold skill', () => {
  let state = createCustomEditorState();
  state = createTemplate(state, 'enemies');
  state = updateSelectedTemplate(state, { lifeValue: 8, blockBypass: 3 });
  state = addSkillToSelected(state);
  const skill = state.data.enemies[state.selectedId].skills[0];
  state = updateSkillForSelected(state, skill.id, { triggerMode: 'hp_threshold', hpThresholdPercent: 50 });

  const enemy = state.data.enemies[state.selectedId];
  assert.equal(enemy.lifeValue, 8);
  assert.equal(enemy.blockBypass, 3);
  assert.equal(enemy.skills[0].triggerMode, 'hp_threshold');
});
