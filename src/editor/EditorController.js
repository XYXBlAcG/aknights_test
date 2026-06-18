import {
  addPath,
  addTimelineEvent,
  cellsInRect,
  createEditorState,
  getValidation,
  loadMapIntoEditor,
  paintCells,
  removeLastPointFromSelectedPath,
  removePath,
  removeTimelineEvent,
  resizeMap,
  selectPath,
  toMapJson,
  updateMapMeta,
  updatePath,
  updateTimelineEvent
} from './EditorModel.js';
import { DEFAULT_ENEMIES } from '../data/defaultEnemies.js';

const TERRAIN_LABELS = {
  path: '路径',
  high: '高台',
  wall: '障碍'
};

export class EditorController {
  constructor({ root, canvas, renderer, enemyCatalog = DEFAULT_ENEMIES }) {
    this.root = root;
    this.canvas = canvas;
    this.renderer = renderer;
    this.enemyCatalog = enemyCatalog;
    this.state = createEditorState({ width: 10, height: 6, name: '新地图' });
    this.hoverCell = null;
    this.previewCells = [];
    this.isPainting = false;
    this.paintMode = 'paint';
    this.dragStartCell = null;
    this.paintedCellKeys = new Set();
    this.selectedTerrain = 'path';
    this.cacheElements();
    this.bindEvents();
    this.sync();
  }

  cacheElements() {
    this.terrainTools = this.root.querySelector('#terrain-tools');
    this.mapNameInput = this.root.querySelector('#map-name-input');
    this.mapIdInput = this.root.querySelector('#map-id-input');
    this.mapWidthInput = this.root.querySelector('#map-width-input');
    this.mapHeightInput = this.root.querySelector('#map-height-input');
    this.initialCostInput = this.root.querySelector('#initial-cost-input');
    this.maxCostInput = this.root.querySelector('#max-cost-input');
    this.maxLivesInput = this.root.querySelector('#max-lives-input');
    this.totalWavesInput = this.root.querySelector('#total-waves-input');
    this.pathList = this.root.querySelector('#path-list');
    this.timelineList = this.root.querySelector('#timeline-list');
    this.jsonTextarea = this.root.querySelector('#json-textarea');
    this.validationPanel = this.root.querySelector('#validation-panel');
    this.message = this.root.querySelector('#editor-message');
    this.addPathButton = this.root.querySelector('#add-path-button');
    this.removePathPointButton = this.root.querySelector('#remove-path-point-button');
    this.addEventButton = this.root.querySelector('#add-event-button');
    this.exportButton = this.root.querySelector('#editor-export-button');
    this.importButton = this.root.querySelector('#editor-import-button');
    this.downloadButton = this.root.querySelector('#editor-download-button');
  }

  bindEvents() {
    this.terrainTools.addEventListener('click', (event) => {
      const button = event.target.closest('[data-terrain]');
      if (!button) {
        return;
      }
      this.selectedTerrain = button.dataset.terrain;
      this.sync();
    });

    [
      [this.mapNameInput, 'name', 'string'],
      [this.mapIdInput, 'id', 'string'],
      [this.initialCostInput, 'initialCost', 'number'],
      [this.maxCostInput, 'maxCost', 'number'],
      [this.maxLivesInput, 'maxLives', 'number'],
      [this.totalWavesInput, 'totalWaves', 'number']
    ].forEach(([input, key, type]) => {
      input.addEventListener('change', () => {
        const value = type === 'number' ? Number(input.value) : input.value;
        this.state = updateMapMeta(this.state, { [key]: value });
        this.sync();
      });
    });

    [this.mapWidthInput, this.mapHeightInput].forEach((input) => {
      const handleResize = () => {
        this.runMutation(() => resizeMap(
          this.state,
          Number(this.mapWidthInput.value),
          Number(this.mapHeightInput.value)
        ), '地图尺寸已更新');
      };
      input.addEventListener('input', handleResize);
      input.addEventListener('change', handleResize);
    });

    this.addPathButton.addEventListener('click', () => {
      this.state = addPath(this.state, `路径 ${this.state.map.paths.length + 1}`);
      this.sync('已新增路径。点击路径格添加路径点。');
    });

    this.removePathPointButton.addEventListener('click', () => {
      this.runMutation(() => removeLastPointFromSelectedPath(this.state), '已删除末点');
    });

    this.pathList.addEventListener('click', (event) => {
      const selectButton = event.target.closest('[data-select-path]');
      const removeButton = event.target.closest('[data-remove-path]');
      if (selectButton) {
        this.state = selectPath(this.state, selectButton.dataset.selectPath);
        this.sync('已选择路径');
      }
      if (removeButton) {
        this.state = removePath(this.state, removeButton.dataset.removePath);
        this.sync('已删除路径');
      }
    });

    this.pathList.addEventListener('change', (event) => {
      const input = event.target.closest('[data-path-field]');
      if (!input) {
        return;
      }
      this.state = updatePath(this.state, input.dataset.pathId, {
        [input.dataset.pathField]: input.value
      });
      this.sync();
    });

    this.addEventButton.addEventListener('click', () => {
      this.state = addTimelineEvent(this.state);
      this.sync('已新增出怪事件');
    });

    this.timelineList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-event]');
      if (!button) {
        return;
      }
      this.state = removeTimelineEvent(this.state, button.dataset.removeEvent);
      this.sync('已删除出怪事件');
    });

    this.timelineList.addEventListener('change', (event) => {
      const input = event.target.closest('[data-event-field]');
      if (!input) {
        return;
      }
      this.state = updateTimelineEvent(this.state, input.dataset.eventId, {
        [input.dataset.eventField]: input.value
      });
      this.sync();
    });

    this.exportButton.addEventListener('click', () => {
      this.runMutation(() => {
        const map = toMapJson(this.state);
        this.jsonTextarea.value = `${JSON.stringify(map, null, 2)}\n`;
        return this.state;
      }, 'JSON 已导出');
    });

    this.importButton.addEventListener('click', () => {
      this.runMutation(() => loadMapIntoEditor(JSON.parse(this.jsonTextarea.value)), 'JSON 已导入');
    });

    this.downloadButton.addEventListener('click', () => {
      this.runMutation(() => {
        const map = toMapJson(this.state);
        const blob = new Blob([`${JSON.stringify(map, null, 2)}\n`], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${map.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
        return this.state;
      }, '已生成下载');
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const cell = this.renderer.cellFromEvent(event, this.state.map);
      this.isPainting = true;
      this.paintMode = event.shiftKey ? 'box' : 'paint';
      this.dragStartCell = cell;
      this.hoverCell = cell;
      this.paintedCellKeys = new Set();
      this.canvas.setPointerCapture?.(event.pointerId);
      if (this.paintMode === 'box') {
        this.previewCells = cellsInRect(cell, cell);
        this.renderer.render(this.state, this.hoverCell, this.previewCells);
        return;
      }
      this.paintCellOnce(cell);
    });

    this.canvas.addEventListener('pointermove', (event) => {
      const cell = this.renderer.cellFromEvent(event, this.state.map);
      this.hoverCell = cell;
      if (!this.isPainting) {
        this.renderer.render(this.state, this.hoverCell, this.previewCells);
        return;
      }
      if (this.paintMode === 'box') {
        this.previewCells = cellsInRect(this.dragStartCell, cell);
        this.renderer.render(this.state, this.hoverCell, this.previewCells);
        return;
      }
      this.paintCellOnce(cell);
    });

    window.addEventListener('pointerup', () => {
      if (!this.isPainting) {
        return;
      }
      if (this.paintMode === 'box') {
        const cells = this.previewCells;
        this.previewCells = [];
        this.isPainting = false;
        this.runMutation(() => paintCells(this.state, cells, this.selectedTerrain, { appendPathPoints: true }), `${TERRAIN_LABELS[this.selectedTerrain]} ${cells.length} 格`);
        return;
      }
      this.isPainting = false;
      this.previewCells = [];
      this.renderer.render(this.state, this.hoverCell, this.previewCells);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverCell = null;
      if (!this.isPainting) {
        this.renderer.render(this.state, this.hoverCell, this.previewCells);
      }
    });
  }

  paintCellOnce(cell) {
    const key = `${cell.x},${cell.y}`;
    if (this.paintedCellKeys.has(key)) {
      return;
    }
    this.paintedCellKeys.add(key);
    this.runMutation(() => paintCells(this.state, [cell], this.selectedTerrain, { appendPathPoints: true }), `${TERRAIN_LABELS[this.selectedTerrain]} ${cell.x},${cell.y}`);
  }

  runMutation(mutator, successMessage) {
    try {
      this.state = mutator();
      this.sync(successMessage);
    } catch (error) {
      this.sync(error.message);
    }
  }

  sync(message = this.state.message) {
    this.syncMetaInputs();
    this.renderTerrainTools();
    this.renderPathList();
    this.renderTimelineList();
    this.renderValidation(message);
    this.renderer.render(this.state, this.hoverCell, this.previewCells);
  }

  syncMetaInputs() {
    this.mapNameInput.value = this.state.map.name;
    this.mapIdInput.value = this.state.map.id;
    this.mapWidthInput.value = this.state.map.width;
    this.mapHeightInput.value = this.state.map.height;
    this.initialCostInput.value = this.state.map.initialCost;
    this.maxCostInput.value = this.state.map.maxCost;
    this.maxLivesInput.value = this.state.map.maxLives;
    this.totalWavesInput.value = this.state.map.totalWaves;
  }

  renderTerrainTools() {
    this.terrainTools.querySelectorAll('[data-terrain]').forEach((button) => {
      button.classList.toggle('selected', button.dataset.terrain === this.selectedTerrain);
    });
  }

  renderPathList() {
    if (this.state.map.paths.length === 0) {
      this.pathList.innerHTML = '<p class="muted">先新增路径，再点击路径格添加路径点。</p>';
      return;
    }

    this.pathList.innerHTML = this.state.map.paths.map((path) => `
      <article class="path-row ${path.id === this.state.selectedPathId ? 'selected' : ''}">
        <button data-select-path="${path.id}" style="border-color:${path.color}">${path.name}</button>
        <input data-path-id="${path.id}" data-path-field="name" value="${escapeHtml(path.name)}" />
        <input data-path-id="${path.id}" data-path-field="color" value="${escapeHtml(path.color)}" />
        <span>${path.points.length} 点</span>
        <button data-remove-path="${path.id}">删除</button>
      </article>
    `).join('');
  }

  renderTimelineList() {
    if (this.state.timelineEvents.length === 0) {
      this.timelineList.innerHTML = '<p class="muted">暂无出怪事件。</p>';
      return;
    }

    const pathOptions = this.state.map.paths.map((path) => `<option value="${path.id}">${path.name}</option>`).join('');
    this.timelineList.innerHTML = this.state.timelineEvents.map((event) => {
      const enemyOptions = buildEnemyOptionsModel({
        enemyCatalog: this.enemyCatalog,
        selectedEnemyType: event.enemyType
      }).map((option) => enemyOption(option.id, event.enemyType, option.label, option.missing)).join('');
      return `
      <article class="timeline-row">
        <label>波次 <input data-event-id="${event.id}" data-event-field="wave" type="number" value="${event.wave}" /></label>
        <label>时间 <input data-event-id="${event.id}" data-event-field="startTime" type="number" value="${event.startTime}" /></label>
        <label>敌人
          <select data-event-id="${event.id}" data-event-field="enemyType">
            ${enemyOptions}
          </select>
        </label>
        <label>数量 <input data-event-id="${event.id}" data-event-field="count" type="number" value="${event.count}" /></label>
        <label>间隔 <input data-event-id="${event.id}" data-event-field="interval" type="number" step="0.1" value="${event.interval}" /></label>
        <label>路径
          <select data-event-id="${event.id}" data-event-field="pathId">
            ${pathOptions}
          </select>
        </label>
        <button data-remove-event="${event.id}">删除</button>
      </article>
    `;
    }).join('');

    this.state.timelineEvents.forEach((event) => {
      const select = this.timelineList.querySelector(`[data-event-id="${event.id}"][data-event-field="pathId"]`);
      if (select) {
        select.value = event.pathId;
      }
    });
  }

  renderValidation(message) {
    const validation = getValidation(this.state);
    this.validationPanel.classList.toggle('valid', validation.ok);
    this.validationPanel.textContent = validation.message;
    this.message.textContent = message ?? '';
  }
}

export function buildEnemyOptionsModel({ enemyCatalog, selectedEnemyType = null }) {
  const options = Object.values(enemyCatalog)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((enemy) => ({
      id: enemy.id,
      label: enemy.name,
      selected: enemy.id === selectedEnemyType,
      missing: false
    }));

  if (selectedEnemyType && !options.some((option) => option.id === selectedEnemyType)) {
    options.push({
      id: selectedEnemyType,
      label: `${selectedEnemyType}（缺失）`,
      selected: true,
      missing: true
    });
  }

  return options;
}

function enemyOption(value, selected, label, missing = false) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}${missing ? '' : ''}</option>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
