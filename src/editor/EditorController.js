import {
  addPath,
  addTimelineEvent,
  addWaypointAction,
  buildTimelinePreviewModel,
  cellsInRect,
  createEditorState,
  getValidation,
  loadMapIntoEditor,
  paintCells,
  removeLastPointFromSelectedPath,
  removePath,
  removeTimelineEvent,
  removeWaypointAction,
  resizeMap,
  selectPath,
  setCellsDeployable,
  toMapJson,
  updateMapMeta,
  updatePath,
  updateTimelineEvent,
  updateWaypointAction
} from './EditorModel.js';
import { DEFAULT_ENEMIES } from '../data/defaultEnemies.js';
import { saveCustomMapToLibrary } from '../data/MapLibraryStore.js';

const TERRAIN_LABELS = {
  path: '路径',
  high: '高台',
  wall: '障碍'
};

const DEPLOYABILITY_LABELS = {
  true: '允许部署',
  false: '禁止部署'
};

const WAYPOINT_ACTION_LABELS = {
  pause: '停顿',
  add_attack_module: '攻击模块',
  add_defense_module: '防御模块'
};

export class EditorController {
  constructor({ root, canvas, renderer, enemyCatalog = DEFAULT_ENEMIES, initialState = null, storage = globalThis.localStorage }) {
    this.root = root;
    this.canvas = canvas;
    this.renderer = renderer;
    this.enemyCatalog = enemyCatalog;
    this.storage = storage;
    this.state = initialState ?? createEditorState({ width: 10, height: 6, name: '新地图' });
    this.isDirty = false;
    this.hoverCell = null;
    this.previewCells = [];
    this.isPainting = false;
    this.paintMode = 'paint';
    this.dragStartCell = null;
    this.paintedCellKeys = new Set();
    this.selectedTerrain = 'path';
    this.selectedDeployability = null;
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
    this.waypointActionPanel = this.root.querySelector('#waypoint-action-panel');
    this.timelinePreview = this.root.querySelector('#timeline-preview');
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
    this.saveLibraryButton = this.root.querySelector('#editor-save-library-button');
  }

  bindEvents() {
    this.terrainTools.addEventListener('click', (event) => {
      const terrainButton = event.target.closest('[data-terrain]');
      const deployabilityButton = event.target.closest('[data-deployability]');
      if (terrainButton) {
        this.selectedTerrain = terrainButton.dataset.terrain;
        this.selectedDeployability = null;
        this.sync();
        return;
      }
      if (deployabilityButton) {
        this.selectedDeployability = deployabilityButton.dataset.deployability === 'true';
        this.sync();
      }
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
        this.isDirty = true;
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
      this.isDirty = true;
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
        this.isDirty = true;
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
      this.isDirty = true;
      this.sync();
    });

    this.waypointActionPanel.addEventListener('click', (event) => {
      const addButton = event.target.closest('[data-add-waypoint-action]');
      const removeButton = event.target.closest('[data-remove-waypoint-action]');
      if (addButton) {
        const pathId = addButton.dataset.pathId;
        const path = this.state.map.paths.find((item) => item.id === pathId);
        const pointIndex = firstIntermediatePointIndex(path);
        this.runMutation(() => addWaypointAction(
          this.state,
          pathId,
          pointIndex,
          defaultWaypointAction(addButton.dataset.addWaypointAction)
        ), '已新增路径节点动作');
        return;
      }
      if (removeButton) {
        this.runMutation(() => removeWaypointAction(
          this.state,
          removeButton.dataset.pathId,
          removeButton.dataset.removeWaypointAction
        ), '已删除路径节点动作');
      }
    });

    this.waypointActionPanel.addEventListener('change', (event) => {
      const input = event.target.closest('[data-waypoint-field]');
      if (!input) {
        return;
      }
      const pathId = input.dataset.pathId;
      const actionId = input.dataset.actionId;
      const field = input.dataset.waypointField;
      this.runMutation(() => updateWaypointAction(
        this.state,
        pathId,
        actionId,
        buildWaypointActionPatch(this.state, pathId, actionId, field, input.value)
      ), '路径节点动作已更新');
    });

    this.addEventButton.addEventListener('click', () => {
      this.state = addTimelineEvent(this.state);
      this.isDirty = true;
      this.sync('已新增出怪事件');
    });

    this.timelineList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-event]');
      if (!button) {
        return;
      }
      this.state = removeTimelineEvent(this.state, button.dataset.removeEvent);
      this.isDirty = true;
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
      this.isDirty = true;
      this.sync();
    });

    this.exportButton.addEventListener('click', () => {
      this.runMutation(() => {
        const map = toMapJson(this.state);
        this.jsonTextarea.value = `${JSON.stringify(map, null, 2)}\n`;
        return this.state;
      }, 'JSON 已导出', { dirty: false });
    });

    this.importButton.addEventListener('click', () => {
      this.runMutation(() => loadMapIntoEditor(JSON.parse(this.jsonTextarea.value)), 'JSON 已导入', { dirty: false });
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
      }, '已生成下载', { dirty: false });
    });

    this.saveLibraryButton?.addEventListener('click', () => {
      this.runMutation(() => {
        const map = toMapJson(this.state);
        saveCustomMapToLibrary(map, this.storage);
        return this.state;
      }, '已保存到地图库', { dirty: false });
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
        this.runMutation(() => this.applySelectedBrush(cells), `${this.selectedBrushLabel()} ${cells.length} 格`);
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

    window.addEventListener('beforeunload', (event) => {
      const message = editorLeaveWarningMessage(this.isDirty);
      if (!message) {
        return undefined;
      }
      event.preventDefault();
      event.returnValue = message;
      return message;
    });
  }

  paintCellOnce(cell) {
    const key = `${cell.x},${cell.y}`;
    if (this.paintedCellKeys.has(key)) {
      return;
    }
    this.paintedCellKeys.add(key);
    this.runMutation(() => this.applySelectedBrush([cell]), `${this.selectedBrushLabel()} ${cell.x},${cell.y}`);
  }

  applySelectedBrush(cells) {
    if (this.selectedDeployability !== null) {
      return setCellsDeployable(this.state, cells, this.selectedDeployability);
    }
    return paintCells(this.state, cells, this.selectedTerrain, { appendPathPoints: true });
  }

  selectedBrushLabel() {
    if (this.selectedDeployability !== null) {
      return DEPLOYABILITY_LABELS[String(this.selectedDeployability)];
    }
    return TERRAIN_LABELS[this.selectedTerrain];
  }

  runMutation(mutator, successMessage, options = { dirty: true }) {
    try {
      this.state = mutator();
      this.isDirty = options.dirty !== false;
      this.sync(successMessage);
    } catch (error) {
      this.sync(error.message);
    }
  }

  sync(message = this.state.message) {
    this.syncMetaInputs();
    this.renderTerrainTools();
    this.renderPathList();
    this.renderWaypointActionPanel();
    this.renderTimelinePreview();
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
      button.classList.toggle('selected', this.selectedDeployability === null && button.dataset.terrain === this.selectedTerrain);
    });
    this.terrainTools.querySelectorAll('[data-deployability]').forEach((button) => {
      button.classList.toggle('selected', this.selectedDeployability === (button.dataset.deployability === 'true'));
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

  renderWaypointActionPanel() {
    if (!this.waypointActionPanel) {
      return;
    }
    const path = this.state.map.paths.find((item) => item.id === this.state.selectedPathId);
    if (!path) {
      this.waypointActionPanel.innerHTML = '<p class="muted">先选择一条路径。</p>';
      return;
    }
    const intermediatePoints = path.points.slice(1, -1);
    if (intermediatePoints.length === 0) {
      this.waypointActionPanel.innerHTML = '<p class="muted">路径至少需要 3 个点才能设置中间节点动作。</p>';
      return;
    }

    this.waypointActionPanel.innerHTML = `
      <div class="waypoint-actions-toolbar">
        <button data-path-id="${path.id}" data-add-waypoint-action="pause">添加停顿</button>
        <button data-path-id="${path.id}" data-add-waypoint-action="add_attack_module">添加攻击模块</button>
        <button data-path-id="${path.id}" data-add-waypoint-action="add_defense_module">添加防御模块</button>
      </div>
      <div class="waypoint-action-list">
        ${(path.waypointActions ?? []).length === 0 ? '<p class="muted">暂无节点动作。</p>' : ''}
        ${(path.waypointActions ?? []).map((waypoint) => renderWaypointActionRow(path, waypoint)).join('')}
      </div>
    `;
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

  renderTimelinePreview() {
    if (!this.timelinePreview) {
      return;
    }
    const preview = buildTimelinePreviewModel(this.state.timelineEvents, this.state.map.totalWaves);
    if (this.state.timelineEvents.length === 0) {
      this.timelinePreview.innerHTML = '<p class="muted">暂无时间轴预览。</p>';
      return;
    }

    this.timelinePreview.innerHTML = `
      <div class="timeline-scale">
        <span>0s</span>
        <span>${preview.duration}s</span>
      </div>
      <div class="timeline-preview-rows">
        ${preview.rows.map((row) => `
          <div class="timeline-preview-row">
            <strong>W${row.wave}</strong>
            <div class="timeline-preview-track">
              ${row.events.map((event) => `
                <span class="timeline-preview-event"
                  style="left:${event.leftPercent}%;width:${event.widthPercent}%;background:${pathColorForEvent(this.state, event)}"
                  title="${escapeHtml(event.label)} · ${event.startTime}s">
                  ${escapeHtml(shortEventLabel(event))}
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderValidation(message) {
    const validation = getValidation(this.state);
    this.validationPanel.classList.toggle('valid', validation.ok);
    this.validationPanel.textContent = validation.message;
    this.message.textContent = message ?? '';
  }
}

export function editorLeaveWarningMessage(isDirty) {
  return isDirty ? '地图有未保存修改' : '';
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

function pathColorForEvent(state, event) {
  return state.map.paths.find((path) => path.id === event.pathId)?.color ?? '#f6c445';
}

function shortEventLabel(event) {
  return `${event.enemyType.slice(0, 2)} x${event.count}`;
}

function firstIntermediatePointIndex(path) {
  if (!path || path.points.length < 3) {
    throw new Error('路径至少需要 3 个点才能设置中间节点动作');
  }
  return 1;
}

function defaultWaypointAction(type) {
  if (type === 'add_attack_module') {
    return {
      type,
      module: {
        id: 'route-overwatch',
        duration: 6,
        normalAttack: {
          interval: 1.5,
          targeting: 'nearest',
          range: { type: 'diamond', radius: 2 },
          components: [{ type: 'arts', value: 30 }],
          effects: []
        }
      }
    };
  }
  if (type === 'add_defense_module') {
    return {
      type,
      module: {
        id: 'route-armor',
        duration: 6,
        defenseDelta: 20,
        resistanceDelta: 15
      }
    };
  }
  return {
    type: 'pause',
    duration: 2
  };
}

function buildWaypointActionPatch(state, pathId, actionId, field, value) {
  if (field === 'pointIndex') {
    return { pointIndex: Number(value) };
  }
  if (field === 'type') {
    return { action: defaultWaypointAction(value) };
  }

  const path = state.map.paths.find((item) => item.id === pathId);
  const waypoint = path?.waypointActions?.find((item) => item.id === actionId);
  const action = structuredClone(waypoint?.actions?.[0] ?? defaultWaypointAction('pause'));

  if (field === 'duration') {
    if (action.type === 'pause') {
      action.duration = Number(value);
    } else {
      action.module ??= {};
      action.module.duration = Number(value);
    }
  }

  if (action.type === 'add_attack_module') {
    action.module ??= {};
    action.module.normalAttack ??= {};
    action.module.normalAttack.range ??= { type: 'diamond', radius: 2 };
    action.module.normalAttack.components ??= [{ type: 'arts', value: 30 }];
    if (field === 'attackInterval') {
      action.module.normalAttack.interval = Number(value);
    }
    if (field === 'rangeRadius') {
      action.module.normalAttack.range = {
        type: 'diamond',
        radius: Number(value)
      };
    }
    if (field === 'attackType') {
      action.module.normalAttack.components[0] = {
        ...action.module.normalAttack.components[0],
        type: value
      };
    }
    if (field === 'attackValue') {
      action.module.normalAttack.components[0] = {
        ...action.module.normalAttack.components[0],
        value: Number(value)
      };
    }
  }

  if (action.type === 'add_defense_module') {
    action.module ??= {};
    if (field === 'defenseDelta') {
      action.module.defenseDelta = Number(value);
    }
    if (field === 'resistanceDelta') {
      action.module.resistanceDelta = Number(value);
    }
  }

  return { action };
}

function renderWaypointActionRow(path, waypoint) {
  const action = waypoint.actions?.[0] ?? defaultWaypointAction('pause');
  return `
    <article class="waypoint-action-row">
      <label>节点
        <select data-path-id="${path.id}" data-action-id="${waypoint.id}" data-waypoint-field="pointIndex">
          ${path.points.slice(1, -1).map((point, offset) => {
            const index = offset + 1;
            return `<option value="${index}" ${Number(waypoint.pointIndex) === index ? 'selected' : ''}>#${index + 1} (${point.x},${point.y})</option>`;
          }).join('')}
        </select>
      </label>
      <label>类型
        <select data-path-id="${path.id}" data-action-id="${waypoint.id}" data-waypoint-field="type">
          ${Object.entries(WAYPOINT_ACTION_LABELS).map(([type, label]) => `
            <option value="${type}" ${action.type === type ? 'selected' : ''}>${label}</option>
          `).join('')}
        </select>
      </label>
      ${renderWaypointActionFields(path.id, waypoint.id, action)}
      <button data-path-id="${path.id}" data-remove-waypoint-action="${waypoint.id}">删除</button>
    </article>
  `;
}

function renderWaypointActionFields(pathId, actionId, action) {
  if (action.type === 'pause') {
    return `
      <label>停顿秒数
        <input data-path-id="${pathId}" data-action-id="${actionId}" data-waypoint-field="duration" type="number" step="0.1" min="0" value="${Number(action.duration ?? 2)}" />
      </label>
    `;
  }

  if (action.type === 'add_attack_module') {
    const module = action.module ?? {};
    const normalAttack = module.normalAttack ?? {};
    const component = normalAttack.components?.[0] ?? { type: 'arts', value: 30 };
    return `
      <label>持续秒数
        <input data-path-id="${pathId}" data-action-id="${actionId}" data-waypoint-field="duration" type="number" step="0.1" min="0" value="${Number(module.duration ?? module.remaining ?? 6)}" />
      </label>
      <label>伤害类型
        <select data-path-id="${pathId}" data-action-id="${actionId}" data-waypoint-field="attackType">
          <option value="physical" ${component.type === 'physical' ? 'selected' : ''}>物理</option>
          <option value="arts" ${component.type === 'arts' ? 'selected' : ''}>法术</option>
          <option value="neural" ${component.type === 'neural' ? 'selected' : ''}>神经</option>
        </select>
      </label>
      <label>伤害值
        <input data-path-id="${pathId}" data-action-id="${actionId}" data-waypoint-field="attackValue" type="number" min="0" value="${Number(component.value ?? 30)}" />
      </label>
      <label>攻击间隔
        <input data-path-id="${pathId}" data-action-id="${actionId}" data-waypoint-field="attackInterval" type="number" step="0.1" min="0.1" value="${Number(normalAttack.interval ?? 1.5)}" />
      </label>
      <label>范围半径
        <input data-path-id="${pathId}" data-action-id="${actionId}" data-waypoint-field="rangeRadius" type="number" step="0.5" min="0" value="${Number(normalAttack.range?.radius ?? 2)}" />
      </label>
    `;
  }

  const module = action.module ?? {};
  return `
    <label>持续秒数
      <input data-path-id="${pathId}" data-action-id="${actionId}" data-waypoint-field="duration" type="number" step="0.1" min="0" value="${Number(module.duration ?? module.remaining ?? 6)}" />
    </label>
    <label>防御增量
      <input data-path-id="${pathId}" data-action-id="${actionId}" data-waypoint-field="defenseDelta" type="number" value="${Number(module.defenseDelta ?? 20)}" />
    </label>
    <label>法抗增量
      <input data-path-id="${pathId}" data-action-id="${actionId}" data-waypoint-field="resistanceDelta" type="number" value="${Number(module.resistanceDelta ?? 15)}" />
    </label>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
