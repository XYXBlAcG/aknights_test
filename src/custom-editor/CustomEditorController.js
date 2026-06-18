import { saveCustomCatalogs } from '../data/CatalogStore.js';
import {
  addSkillToSelected,
  applyRangePresetToSelected,
  applySkillRangePresetToSelected,
  createTemplate,
  deleteSelectedTemplate,
  duplicateTemplate,
  loadCustomCatalogJson,
  removeSkillFromSelected,
  selectTemplate,
  toCustomCatalogJson,
  toggleRangeCellForSelected,
  toggleSkillRangeCellForSelected,
  updateSkillForSelected,
  updateSelectedTemplate
} from './CustomEditorModel.js';

const NUMBER_FIELDS = new Set([
  'cost',
  'maxHp',
  'attack',
  'defense',
  'resistance',
  'attackInterval',
  'block',
  'speed',
  'rewardCost'
]);

const SKILL_NUMBER_FIELDS = new Set([
  'spCost',
  'duration',
  'amount',
  'healPercent',
  'effect.attackMultiplier',
  'effect.defenseMultiplier',
  'effect.attackIntervalMultiplier',
  'effect.nextAttackMultiplier'
]);

const CHECKBOX_FIELDS = new Set(['canBeBlocked', 'isFlying', 'elite', 'boss']);

export function fieldEditRenderMode({ eventType, tagName }) {
  return eventType === 'input' && tagName !== 'SELECT' ? 'partial' : 'full';
}

export class CustomEditorController {
  constructor({ root, initialState }) {
    this.root = root;
    this.state = initialState;
    this.rangeTarget = { type: 'operator', skillId: null };
    this.cacheElements();
    this.bindEvents();
    this.sync();
  }

  cacheElements() {
    this.kindTabs = this.root.querySelector('#custom-kind-tabs');
    this.templateList = this.root.querySelector('#custom-template-list');
    this.createButton = this.root.querySelector('#custom-create-button');
    this.duplicateButton = this.root.querySelector('#custom-duplicate-button');
    this.deleteButton = this.root.querySelector('#custom-delete-button');
    this.form = this.root.querySelector('#custom-template-form');
    this.rangePanel = this.root.querySelector('#custom-range-panel');
    this.jsonTextarea = this.root.querySelector('#custom-json-textarea');
    this.validationPanel = this.root.querySelector('#custom-validation-panel');
    this.message = this.root.querySelector('#custom-message');
    this.saveButton = this.root.querySelector('#custom-save-button');
    this.exportButton = this.root.querySelector('#custom-export-button');
    this.importButton = this.root.querySelector('#custom-import-button');
  }

  bindEvents() {
    this.kindTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-kind]');
      if (!button) {
        return;
      }
      this.state = {
        ...this.state,
        selectedKind: button.dataset.kind,
        selectedId: Object.keys(this.state.data[button.dataset.kind])[0] ?? null
      };
      this.rangeTarget = { type: 'operator', skillId: null };
      this.sync();
    });

    this.templateList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-template-id]');
      if (!button) {
        return;
      }
      this.rangeTarget = { type: 'operator', skillId: null };
      this.runMutation(() => selectTemplate(this.state, this.state.selectedKind, button.dataset.templateId));
    });

    this.createButton.addEventListener('click', () => {
      this.runMutation(() => createTemplate(this.state, this.state.selectedKind));
    });

    this.duplicateButton.addEventListener('click', () => {
      this.runMutation(() => duplicateTemplate(this.state));
    });

    this.deleteButton.addEventListener('click', () => {
      this.runMutation(() => deleteSelectedTemplate(this.state));
    });

    this.form.addEventListener('input', (event) => {
      const input = event.target.closest('[data-field], [data-skill-field]');
      if (!input || input.tagName === 'SELECT') {
        return;
      }
      this.updateInput(input, fieldEditRenderMode({ eventType: 'input', tagName: input.tagName }));
    });

    this.form.addEventListener('change', (event) => {
      const input = event.target.closest('[data-field], [data-skill-field]');
      if (!input) {
        return;
      }
      this.updateInput(input, fieldEditRenderMode({ eventType: 'change', tagName: input.tagName }));
    });

    this.form.addEventListener('click', (event) => {
      const addButton = event.target.closest('[data-add-skill]');
      const removeButton = event.target.closest('[data-remove-skill]');
      if (addButton) {
        event.preventDefault();
        this.runMutation(() => addSkillToSelected(this.state));
      }
      if (removeButton) {
        event.preventDefault();
        if (this.rangeTarget.skillId === removeButton.dataset.removeSkill) {
          this.rangeTarget = { type: 'operator', skillId: null };
        }
        this.runMutation(() => removeSkillFromSelected(this.state, removeButton.dataset.removeSkill));
      }
    });

    this.rangePanel.addEventListener('click', (event) => {
      const targetButton = event.target.closest('[data-range-target]');
      const skillTargetButton = event.target.closest('[data-range-target-skill]');
      const presetButton = event.target.closest('[data-range-preset]');
      const cellButton = event.target.closest('[data-range-cell]');
      if (targetButton) {
        this.rangeTarget = { type: 'operator', skillId: null };
        this.renderRangePanel();
        return;
      }
      if (skillTargetButton) {
        this.rangeTarget = { type: 'skill', skillId: skillTargetButton.dataset.rangeTargetSkill };
        this.renderRangePanel();
        return;
      }
      if (presetButton) {
        this.runMutation(() => this.rangeTarget.type === 'skill'
          ? applySkillRangePresetToSelected(this.state, this.rangeTarget.skillId, presetButton.dataset.rangePreset)
          : applyRangePresetToSelected(this.state, presetButton.dataset.rangePreset));
      }
      if (cellButton) {
        const cell = {
          x: Number(cellButton.dataset.x),
          y: Number(cellButton.dataset.y)
        };
        this.runMutation(() => this.rangeTarget.type === 'skill'
          ? toggleSkillRangeCellForSelected(this.state, this.rangeTarget.skillId, cell)
          : toggleRangeCellForSelected(this.state, cell));
      }
    });

    this.exportButton.addEventListener('click', () => {
      this.runAction(() => {
        this.jsonTextarea.value = toCustomCatalogJson(this.state);
        return 'JSON 已导出';
      });
    });

    this.importButton.addEventListener('click', () => {
      this.runMutation(() => loadCustomCatalogJson(this.jsonTextarea.value), 'JSON 已导入');
    });

    this.saveButton.addEventListener('click', () => {
      this.runAction(() => {
        const result = saveCustomCatalogs(this.state.data);
        if (!result.ok) {
          throw new Error(result.errors.join('\n'));
        }
        return '已保存到 localStorage';
      });
    });
  }

  updateInput(input, renderMode = 'full') {
    if (input.dataset.skillField) {
      this.updateSkillField(input, renderMode);
      return;
    }
    this.updateField(input, renderMode);
  }

  updateField(input, renderMode = 'full') {
    const field = input.dataset.field;
    const value = fieldValue(input);
    this.runMutation(() => updateSelectedTemplate(this.state, { [field]: value }), null, renderMode);
  }

  updateSkillField(input, renderMode = 'full') {
    const patch = skillPatchFromInput(input);
    this.runMutation(() => updateSkillForSelected(this.state, input.dataset.skillId, patch), null, renderMode);
  }

  runMutation(mutator, successMessage = null, renderMode = 'full') {
    try {
      this.state = mutator();
      if (successMessage) {
        this.state.message = successMessage;
      }
      this.syncByMode(renderMode);
    } catch (error) {
      this.state = {
        ...this.state,
        message: error.message
      };
      this.syncByMode(renderMode);
    }
  }

  runAction(action) {
    try {
      this.state = {
        ...this.state,
        message: action()
      };
      this.sync();
    } catch (error) {
      this.state = {
        ...this.state,
        message: error.message
      };
      this.sync();
    }
  }

  sync() {
    this.renderTabs();
    this.renderTemplateList();
    this.renderForm();
    this.renderRangePanel();
    this.renderValidation();
    this.duplicateButton.disabled = !this.state.selectedId;
    this.deleteButton.disabled = !this.state.selectedId;
    this.message.textContent = this.state.message ?? '';
  }

  syncByMode(renderMode) {
    if (renderMode === 'partial') {
      this.renderValidation();
      this.message.textContent = this.state.message ?? '';
      return;
    }
    this.sync();
  }

  renderTabs() {
    this.kindTabs.querySelectorAll('[data-kind]').forEach((button) => {
      button.classList.toggle('selected', button.dataset.kind === this.state.selectedKind);
    });
  }

  renderTemplateList() {
    const templates = Object.values(this.state.data[this.state.selectedKind]);
    if (templates.length === 0) {
      this.templateList.innerHTML = '<p class="muted">暂无模板。</p>';
      return;
    }

    this.templateList.innerHTML = templates.map((template) => `
      <button class="template-list-item ${template.id === this.state.selectedId ? 'selected' : ''}" data-template-id="${escapeHtml(template.id)}">
        <span>${escapeHtml(template.name)}</span>
        <small>${escapeHtml(template.id)}</small>
      </button>
    `).join('');
  }

  renderForm() {
    const selected = this.selectedTemplate();
    if (!selected) {
      this.form.innerHTML = '<p class="muted">新建或选择一个模板。</p>';
      return;
    }

    this.form.innerHTML = this.state.selectedKind === 'operators'
      ? operatorFields(selected)
      : enemyFields(selected);
  }

  renderRangePanel() {
    const selected = this.selectedTemplate();
    if (!selected || this.state.selectedKind !== 'operators') {
      this.rangePanel.innerHTML = '<h2>范围</h2><p class="muted">敌人不配置攻击范围。</p>';
      return;
    }

    const skills = operatorSkills(selected);
    const skillStillExists = skills.some((skill) => skill.id === this.rangeTarget.skillId);
    if (this.rangeTarget.type === 'skill' && !skillStillExists) {
      this.rangeTarget = { type: 'operator', skillId: null };
    }
    const selectedSkill = this.rangeTarget.type === 'skill'
      ? skills.find((skill) => skill.id === this.rangeTarget.skillId)
      : null;
    const range = selectedSkill?.range ?? selected.range;
    const active = new Set((range?.cells ?? [{ x: 0, y: 0 }]).map((cell) => `${cell.x},${cell.y}`));
    const cells = [];
    for (let y = -5; y <= 5; y += 1) {
      for (let x = -5; x <= 5; x += 1) {
        const key = `${x},${y}`;
        cells.push(`
          <button class="range-cell ${active.has(key) ? 'active' : ''} ${x === 0 && y === 0 ? 'origin' : ''}" data-range-cell="1" data-x="${x}" data-y="${y}" title="${x},${y}"></button>
        `);
      }
    }

    this.rangePanel.innerHTML = `
      <h2>范围</h2>
      <div class="range-targets">
        <button class="${this.rangeTarget.type === 'operator' ? 'selected' : ''}" data-range-target="operator">攻击范围</button>
        ${skills.map((skill) => `
          <button class="${this.rangeTarget.skillId === skill.id ? 'selected' : ''}" data-range-target-skill="${escapeHtml(skill.id)}">${escapeHtml(skill.name)}</button>
        `).join('')}
      </div>
      <div class="range-presets">
        ${presetButton('melee', '近战')}
        ${presetButton('diamond-2', '菱形2')}
        ${presetButton('diamond-3', '菱形3')}
        ${presetButton('front-line-3', '直线')}
        ${presetButton('front-box-3x3', '前方')}
        ${presetButton('cross', '十字')}
        ${presetButton('wide-medic', '广域')}
      </div>
      <div class="range-grid">${cells.join('')}</div>
    `;
  }

  renderValidation() {
    try {
      toCustomCatalogJson(this.state);
      this.validationPanel.classList.add('valid');
      this.validationPanel.textContent = '自定义数据有效';
    } catch (error) {
      this.validationPanel.classList.remove('valid');
      this.validationPanel.textContent = error.message;
    }
  }

  selectedTemplate() {
    if (!this.state.selectedId) {
      return null;
    }
    return this.state.data[this.state.selectedKind][this.state.selectedId] ?? null;
  }
}

function operatorFields(template) {
  const skills = operatorSkills(template);
  return [
    textInput('id', 'ID', template.id),
    textInput('name', '名称', template.name),
    selectInput('class', '职业', template.class, [
      ['vanguard', '先锋'],
      ['guard', '近卫'],
      ['defender', '重装'],
      ['sniper', '狙击'],
      ['caster', '术士'],
      ['medic', '医疗'],
      ['custom', '自定义']
    ]),
    textInput('className', '职业显示', template.className),
    selectInput('deployType', '部署地形', template.deployType, [['ground', '地面'], ['high', '高台']]),
    numberInput('cost', '费用', template.cost),
    numberInput('maxHp', '生命', template.maxHp),
    numberInput('attack', '攻击/治疗', template.attack),
    numberInput('defense', '防御', template.defense),
    numberInput('resistance', '法抗', template.resistance, '0.01'),
    numberInput('attackInterval', '攻击间隔', template.attackInterval, '0.1'),
    numberInput('block', '阻挡', template.block),
    selectInput('damageType', '攻击类型', template.damageType, [['physical', '物理'], ['arts', '法术'], ['heal', '治疗']]),
    selectInput('targeting', '目标策略', template.targeting, [
      ['blocked-first', '阻挡优先'],
      ['exit-first', '出口优先'],
      ['flying-first', '飞行优先'],
      ['high-defense', '高防优先'],
      ['lowest-hp-percent', '低生命优先']
    ]),
    colorInput('color', '颜色', template.color),
    skillFields(skills)
  ].join('');
}

function enemyFields(template) {
  return [
    textInput('id', 'ID', template.id),
    textInput('name', '名称', template.name),
    numberInput('maxHp', '生命', template.maxHp),
    numberInput('attack', '攻击', template.attack),
    numberInput('defense', '防御', template.defense),
    numberInput('resistance', '法抗', template.resistance, '0.01'),
    numberInput('speed', '速度', template.speed, '0.1'),
    numberInput('attackInterval', '攻击间隔', template.attackInterval, '0.1'),
    numberInput('rewardCost', '击败费用', template.rewardCost),
    checkboxInput('canBeBlocked', '可阻挡', template.canBeBlocked),
    checkboxInput('isFlying', '飞行', template.isFlying),
    checkboxInput('elite', '精英', template.elite),
    checkboxInput('boss', 'Boss', template.boss),
    colorInput('color', '颜色', template.color)
  ].join('');
}

function textInput(field, label, value) {
  return `<label>${label}<input data-field="${field}" value="${escapeHtml(value)}" /></label>`;
}

function numberInput(field, label, value, step = '1') {
  return `<label>${label}<input data-field="${field}" type="number" step="${step}" value="${escapeHtml(value)}" /></label>`;
}

function colorInput(field, label, value) {
  return `<label>${label}<input data-field="${field}" type="color" value="${escapeHtml(value)}" /></label>`;
}

function selectInput(field, label, value, options) {
  return `
    <label>${label}
      <select data-field="${field}">
        ${options.map(([id, text]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${text}</option>`).join('')}
      </select>
    </label>
  `;
}

function checkboxInput(field, label, checked) {
  return `<label class="checkbox-row"><input data-field="${field}" type="checkbox" ${checked ? 'checked' : ''} />${label}</label>`;
}

function skillFields(skills) {
  return `
    <section class="skill-editor-list">
      <header>
        <h3>技能</h3>
        <button type="button" data-add-skill ${skills.length >= 3 ? 'disabled' : ''}>新增技能</button>
      </header>
      ${skills.length === 0 ? '<p class="muted">暂无技能。</p>' : skills.map(skillCard).join('')}
    </section>
  `;
}

function skillCard(skill) {
  return `
    <article class="skill-editor-card">
      <div class="skill-editor-title">
        <strong>${escapeHtml(skill.name)}</strong>
        <button type="button" data-remove-skill="${escapeHtml(skill.id)}">删除</button>
      </div>
      ${textSkillInput(skill.id, 'id', '技能ID', skill.id)}
      ${textSkillInput(skill.id, 'name', '名称', skill.name)}
      ${textSkillInput(skill.id, 'description', '简介', skill.description)}
      ${selectSkillInput(skill.id, 'triggerMode', '触发', skill.triggerMode ?? 'manual', [['manual', '手动'], ['auto', '自动']])}
      ${selectSkillInput(skill.id, 'type', '类型', skill.type, [
        ['instant_cost', '回费'],
        ['buff', '强化'],
        ['next_attack', '下次攻击'],
        ['instant_heal', '瞬时治疗']
      ])}
      ${numberSkillInput(skill.id, 'spCost', 'SP', skill.spCost)}
      ${numberSkillInput(skill.id, 'duration', '持续', skill.duration ?? 0, '0.1')}
      ${numberSkillInput(skill.id, 'amount', '数值', skill.amount ?? 0)}
      ${numberSkillInput(skill.id, 'healPercent', '自疗比例', skill.healPercent ?? 0, '0.01')}
      ${numberSkillInput(skill.id, 'effect.attackMultiplier', '攻击倍率', skill.effect?.attackMultiplier ?? 1, '0.05')}
      ${numberSkillInput(skill.id, 'effect.defenseMultiplier', '防御倍率', skill.effect?.defenseMultiplier ?? 1, '0.05')}
      ${numberSkillInput(skill.id, 'effect.attackIntervalMultiplier', '间隔倍率', skill.effect?.attackIntervalMultiplier ?? 1, '0.05')}
      ${numberSkillInput(skill.id, 'effect.nextAttackMultiplier', '下次倍率', skill.effect?.nextAttackMultiplier ?? 1, '0.05')}
    </article>
  `;
}

function presetButton(id, label) {
  return `<button data-range-preset="${id}">${label}</button>`;
}

function fieldValue(input) {
  if (CHECKBOX_FIELDS.has(input.dataset.field)) {
    return input.checked;
  }
  if (NUMBER_FIELDS.has(input.dataset.field)) {
    return Number(input.value);
  }
  return input.value;
}

function skillPatchFromInput(input) {
  const field = input.dataset.skillField;
  const value = SKILL_NUMBER_FIELDS.has(field) ? Number(input.value) : input.value;
  if (field.startsWith('effect.')) {
    return {
      effect: {
        [field.split('.')[1]]: value
      }
    };
  }
  return { [field]: value };
}

function textSkillInput(skillId, field, label, value) {
  return `<label>${label}<input data-skill-id="${escapeHtml(skillId)}" data-skill-field="${field}" value="${escapeHtml(value)}" /></label>`;
}

function numberSkillInput(skillId, field, label, value, step = '1') {
  return `<label>${label}<input data-skill-id="${escapeHtml(skillId)}" data-skill-field="${field}" type="number" step="${step}" value="${escapeHtml(value)}" /></label>`;
}

function selectSkillInput(skillId, field, label, value, options) {
  return `
    <label>${label}
      <select data-skill-id="${escapeHtml(skillId)}" data-skill-field="${field}">
        ${options.map(([id, text]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${text}</option>`).join('')}
      </select>
    </label>
  `;
}

function operatorSkills(template) {
  return template.skills ?? [template.skill].filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
