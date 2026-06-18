import { saveCustomCatalogs } from '../data/CatalogStore.js';
import {
  applyRangePresetToSelected,
  createTemplate,
  deleteSelectedTemplate,
  duplicateTemplate,
  loadCustomCatalogJson,
  selectTemplate,
  toCustomCatalogJson,
  toggleRangeCellForSelected,
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

const CHECKBOX_FIELDS = new Set(['canBeBlocked', 'isFlying', 'elite', 'boss']);

export class CustomEditorController {
  constructor({ root, initialState }) {
    this.root = root;
    this.state = initialState;
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
      this.sync();
    });

    this.templateList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-template-id]');
      if (!button) {
        return;
      }
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
      const input = event.target.closest('[data-field]');
      if (!input || input.tagName === 'SELECT') {
        return;
      }
      this.updateField(input);
    });

    this.form.addEventListener('change', (event) => {
      const input = event.target.closest('[data-field]');
      if (!input) {
        return;
      }
      this.updateField(input);
    });

    this.rangePanel.addEventListener('click', (event) => {
      const presetButton = event.target.closest('[data-range-preset]');
      const cellButton = event.target.closest('[data-range-cell]');
      if (presetButton) {
        this.runMutation(() => applyRangePresetToSelected(this.state, presetButton.dataset.rangePreset));
      }
      if (cellButton) {
        this.runMutation(() => toggleRangeCellForSelected(this.state, {
          x: Number(cellButton.dataset.x),
          y: Number(cellButton.dataset.y)
        }));
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

  updateField(input) {
    const field = input.dataset.field;
    const value = fieldValue(input);
    this.runMutation(() => updateSelectedTemplate(this.state, { [field]: value }));
  }

  runMutation(mutator, successMessage = null) {
    try {
      this.state = mutator();
      if (successMessage) {
        this.state.message = successMessage;
      }
      this.sync();
    } catch (error) {
      this.state = {
        ...this.state,
        message: error.message
      };
      this.sync();
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

    const active = new Set((selected.range?.cells ?? [{ x: 0, y: 0 }]).map((cell) => `${cell.x},${cell.y}`));
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
    colorInput('color', '颜色', template.color)
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

