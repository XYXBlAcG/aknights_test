import { CLASS_LIMITS, DEFAULT_OPERATOR_ORDER, TOTAL_DEPLOY_LIMIT } from '../data/defaultOperators.js';
import { Game } from '../core/Game.js';
import { GameLoop } from '../core/GameLoop.js';
import { normalizeMap } from '../data/MapLoader.js';
import {
  buildMapLibrary,
  deleteCustomMapFromLibrary,
  saveCustomMapToLibrary,
  storeEditorDraftMap
} from '../data/MapLibraryStore.js';
import {
  buildOperatorDisplayStats,
  buildOperatorNeuralBarModel,
  buildOperatorSpBarModel,
  buildSkillPanelModel
} from './OperatorViewModels.js';

export {
  buildOperatorDisplayStats,
  buildOperatorNeuralBarModel,
  buildOperatorSpBarModel,
  buildSkillPanelModel
} from './OperatorViewModels.js';

export function formatBattleTime(seconds) {
  const totalSeconds = Math.floor(seconds);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const remainder = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function buildOperatorDeckModel({
  operatorCatalog,
  operators,
  cost,
  selectedOperatorType,
  redeployCooldowns = {},
  deployLimit = TOTAL_DEPLOY_LIMIT
}) {
  const deployedByClass = operators.reduce((counts, operator) => {
    counts[operator.class] = (counts[operator.class] ?? 0) + 1;
    return counts;
  }, {});

  return orderedOperatorTemplates(operatorCatalog).map((template) => {
    const id = template.id;
    const classLimit = CLASS_LIMITS[template.class] ?? deployLimit;
    const classCount = deployedByClass[template.class] ?? 0;
    const totalFull = operators.length >= deployLimit;
    const classFull = classCount >= classLimit;
    const unaffordable = cost < template.cost;
    const cooldownRemaining = Math.ceil(redeployCooldowns?.[id] ?? 0);
    let disabledReason = '';
    if (totalFull) {
      disabledReason = '部署上限';
    } else if (classFull) {
      disabledReason = '职业上限';
    } else if (cooldownRemaining > 0) {
      disabledReason = `再部署 ${cooldownRemaining}s`;
    } else if (unaffordable) {
      disabledReason = '费用不足';
    }

    return {
      ...template,
      deployed: classCount,
      limit: classLimit,
      disabled: Boolean(disabledReason),
      disabledReason,
      cooldownRemaining,
      selected: selectedOperatorType === id
    };
  });
}

export function orderedOperatorTemplates(operatorCatalog) {
  const defaultIds = new Set(DEFAULT_OPERATOR_ORDER);
  const defaults = DEFAULT_OPERATOR_ORDER
    .map((id) => operatorCatalog[id])
    .filter(Boolean);
  const custom = Object.values(operatorCatalog)
    .filter((template) => !defaultIds.has(template.id))
    .sort((a, b) => a.class.localeCompare(b.class) || a.name.localeCompare(b.name));
  return [...defaults, ...custom];
}

export function importMapJsonIntoList(maps, jsonText) {
  const rawMap = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
  const map = normalizeMap(rawMap);
  return {
    maps: [...maps, map],
    mapIndex: maps.length,
    map
  };
}

export function buildMapLibraryPanelModel(entries, selectedIndex) {
  return entries.map((entry, index) => ({
    index,
    id: entry.map.id,
    name: entry.map.name,
    sourceLabel: entry.sourceLabel ?? (entry.source === 'custom' ? '导入' : '默认'),
    selected: index === selectedIndex,
    deletable: Boolean(entry.deletable),
    editable: entry.editable !== false
  }));
}

export function buildKeyboardShortcutGuideModel() {
  return [
    { key: 'Space', label: '开始 / 暂停 / 继续' },
    { key: 'S', label: '切换速度' },
    { key: 'Esc', label: '取消选择 / 取消部署方向' },
    { key: 'R', label: '重新开始' },
    { key: '1-9', label: '选择底部干员' }
  ];
}

export function buildEnemyIntelModel(enemy) {
  if (!enemy) {
    return null;
  }
  const attack = enemy.normalAttack ?? enemy;
  const rangeSummary = summarizeRange(attack.range ?? enemy.range);
  const traits = [];
  if (enemy.damageType === 'arts' || attack.components?.some((component) => component.type === 'arts')) traits.push('法术');
  if ((attack.range ?? enemy.range) && (attack.range ?? enemy.range).type !== 'melee') traits.push('远程');
  if (enemy.isFlying) traits.push('飞行');
  if (enemy.canBeBlocked === false) traits.push('不可阻挡');
  if ((enemy.blockBypass ?? 0) > 0) traits.push(`防阻挡${enemy.blockBypass}`);
  if (enemy.elite) traits.push('精英');
  if (enemy.boss) traits.push('Boss');
  return {
    id: enemy.id ?? '',
    name: enemy.name ?? '',
    maxHp: enemy.maxHp ?? 0,
    attack: enemy.attack ?? 0,
    defense: enemy.defense ?? 0,
    resistance: enemy.resistance ?? 0,
    speed: enemy.speed ?? 0,
    lifeValue: enemy.lifeValue ?? 1,
    blockBypass: enemy.blockBypass ?? 0,
    components: summarizeDamageComponents(attack.components ?? []),
    rangeSummary,
    traits,
    description: enemy.description ?? '',
    phaseCount: enemy.phases?.length ?? 0
  };
}

function summarizeDamageComponents(components) {
  const labels = {
    physical: '物理',
    arts: '法术',
    neural: '神经'
  };
  return components.map((component) => `${labels[component.type] ?? component.type} ${component.value}`);
}

export function buildRenderKeys(state, message = '') {
  const selected = state.operators.find((operator) => operator.id === state.selectedOperatorId);
  const operatorDeckData = buildOperatorDeckModel(state).map((operator) => [
    operator.id,
    operator.deployed,
    operator.limit,
    operator.disabled,
    operator.disabledReason,
    operator.cooldownRemaining,
    operator.selected
  ]);
  const deployLimit = state.deployLimit ?? TOTAL_DEPLOY_LIMIT;
  const skills = buildSkillPanelModel(selected);
  const selectedStats = selected ? buildOperatorDisplayStats(selected) : null;

  return {
    topStatus: JSON.stringify([
      state.cost,
      state.maxCost,
      state.lives,
      state.maxLives,
      state.currentWave,
      state.totalWaves,
      state.operators.length,
      deployLimit,
      formatBattleTime(state.elapsed),
      state.map.name,
      message
    ]),
    operatorDeck: JSON.stringify([
      state.status,
      state.cost,
      state.selectedOperatorType,
      state.operators.length,
      deployLimit,
      operatorDeckData
    ]),
    infoPanel: selected ? JSON.stringify([
      selected.id,
      Math.ceil(selected.hp),
      selected.maxHp,
      selectedStats.attack,
      selectedStats.attackSummary,
      selectedStats.defense,
      selectedStats.attackInterval,
      selectedStats.blockedCount,
      selectedStats.block,
      skills.map((skill) => [
        skill.id,
        skill.name,
        skill.description,
        skill.sp,
        skill.spCost,
        skill.ready,
        skill.activeRemaining,
        skill.triggerMode,
        skill.rangeSummary
      ])
    ]) : 'empty',
    controls: JSON.stringify([state.status, state.speed]),
    result: JSON.stringify([
      state.status,
      state.stars,
      state.kills,
      state.leaks,
      state.lives
    ]),
    enemyIntel: JSON.stringify((state.enemyIntelQueue ?? []).map((enemy) => [
      enemy.id,
      enemy.name,
      enemy.maxHp,
      enemy.attack,
      enemy.defense,
      enemy.resistance,
      enemy.speed,
      summarizeRange(enemy.range),
      enemy.damageType,
      enemy.isFlying,
      enemy.canBeBlocked,
      enemy.blockBypass,
      enemy.elite,
      enemy.boss,
      enemy.description,
      enemy.phases?.length ?? 0
    ]))
  };
}

export class UIController {
  constructor({ root, canvas, renderer, maps, mapEntries = null, operatorCatalog, enemyCatalog, storage = globalThis.localStorage }) {
    this.root = root;
    this.canvas = canvas;
    this.renderer = renderer;
    this.storage = storage;
    this.defaultMaps = mapEntries ? mapEntries.filter((entry) => entry.source === 'default').map((entry) => entry.map) : maps;
    this.customMaps = mapEntries ? mapEntries.filter((entry) => entry.source === 'custom').map((entry) => entry.map) : [];
    this.mapEntries = mapEntries ?? buildMapLibrary(maps, []);
    this.maps = this.mapEntries.map((entry) => entry.map);
    this.operatorCatalog = operatorCatalog;
    this.enemyCatalog = enemyCatalog;
    this.mapIndex = 0;
    this.message = '';
    this.renderKeys = {};
    this.mapOptionsKey = '';
    this.mapLibraryKey = '';
    this.pendingDeployment = null;
    this.createGame(this.maps[this.mapIndex]);
    this.cacheElements();
    this.bindEvents();
    this.sync();
  }

  createGame(map) {
    this.loop?.stop();
    this.game = new Game({
      map,
      operatorCatalog: this.operatorCatalog,
      enemyCatalog: this.enemyCatalog
    });
    this.loop = new GameLoop({
      game: this.game,
      onFrame: () => this.sync()
    });
  }

  cacheElements() {
    this.topStatus = this.root.querySelector('#top-status');
    this.operatorDeck = this.root.querySelector('#operator-deck');
    this.infoPanel = this.root.querySelector('#info-panel');
    this.controlPanel = this.root.querySelector('#control-panel');
    this.resultModal = this.root.querySelector('#result-modal');
    this.enemyIntelPanel = this.root.querySelector('#enemy-intel-panel');
    this.mapLibraryPanel = this.root.querySelector('#map-library-panel');
    this.mapSelect = this.root.querySelector('#map-select');
    this.mapImportButton = this.root.querySelector('#map-import-button');
    this.mapImportInput = this.root.querySelector('#map-import-input');
    this.startButton = this.root.querySelector('#start-button');
    this.pauseButton = this.root.querySelector('#pause-button');
    this.restartButton = this.root.querySelector('#restart-button');
    this.speedButton = this.root.querySelector('#speed-button');
  }

  bindEvents() {
    this.mapSelect.addEventListener('change', () => {
      this.selectMapIndex(Number(this.mapSelect.value));
    });

    this.mapImportButton?.addEventListener('click', () => {
      this.mapImportInput?.click();
    });

    this.mapImportInput?.addEventListener('change', async () => {
      const file = this.mapImportInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        this.importMapJson(text);
      } catch (error) {
        this.message = `地图导入失败：${error.message}`;
        this.sync();
      } finally {
        this.mapImportInput.value = '';
      }
    });

    this.mapLibraryPanel?.addEventListener('click', (event) => {
      const selectButton = event.target.closest('[data-map-library-select]');
      const editButton = event.target.closest('[data-map-library-edit]');
      const deleteButton = event.target.closest('[data-map-library-delete]');

      if (selectButton) {
        this.selectMapIndex(Number(selectButton.dataset.mapLibrarySelect));
        return;
      }

      if (editButton) {
        this.openMapInEditor(Number(editButton.dataset.mapLibraryEdit));
        return;
      }

      if (deleteButton) {
        this.deleteCustomMap(deleteButton.dataset.mapLibraryDelete);
      }
    });

    this.startButton.addEventListener('click', () => {
      this.game.start();
      this.loop.start();
      this.sync();
    });

    this.pauseButton.addEventListener('click', () => {
      if (this.game.getState().status === 'paused') {
        this.game.resume();
      } else {
        this.game.pause();
      }
      this.sync();
    });

    this.restartButton.addEventListener('click', () => {
      this.game.restart();
      this.renderKeys = {};
      this.message = '';
      this.pendingDeployment = null;
      this.sync();
    });

    this.speedButton.addEventListener('click', () => {
      this.game.cycleSpeed();
      this.sync();
    });

    this.root.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('[data-enemy-intel-close]');
      if (!button) {
        return;
      }
      this.game.dismissEnemyIntel(button.dataset.enemyIntelClose);
      this.sync();
    });

    this.operatorDeck.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('[data-operator-id]');
      if (!button || button.disabled) {
        return;
      }
      event.preventDefault();
      const result = this.game.toggleOperatorSelection(button.dataset.operatorId);
      this.pendingDeployment = null;
      this.message = result.canceled ? '已取消部署选择' : `${button.dataset.operatorName} 待部署`;
      this.sync();
    });

    this.infoPanel.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('[data-skill-button]');
      if (!button) {
        return;
      }
      event.preventDefault();
      const state = this.game.getState();
      if (!state.selectedOperatorId) {
        return;
      }
      const result = this.game.activateSkill(state.selectedOperatorId, button.dataset.skillButton);
      this.message = result.ok ? result.message : result.reason;
      this.sync();
    });

    this.canvas.addEventListener('pointermove', (event) => {
      const state = this.game.getState();
      this.game.setHoverCell(this.renderer.cellFromEvent(event, state.map));
      if (this.pendingDeployment && isSameCell(this.pendingDeployment.cell, this.game.hoverCell)) {
        this.pendingDeployment = {
          ...this.pendingDeployment,
          direction: this.renderer.directionFromEvent(event, state.map, this.pendingDeployment.cell)
        };
      }
      this.sync();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.game.setHoverCell(null);
      this.sync();
    });

    this.canvas.addEventListener('click', (event) => {
      const state = this.game.getState();
      const cell = this.renderer.cellFromEvent(event, state.map);
      if (this.pendingDeployment) {
        this.handlePendingDeploymentClick(event, cell);
      } else if (state.selectedOperatorType) {
        this.beginDeploymentDirectionSelection(state.selectedOperatorType, cell);
      } else {
        const operator = this.game.getOperatorAt(cell);
        if (operator) {
          this.pendingDeployment = null;
          this.game.selectPlacedOperator(operator.id);
          this.message = `${operator.name} 已选中`;
        } else {
          this.pendingDeployment = null;
          this.game.clearSelection();
          this.message = '';
        }
      }
      this.sync();
    });

    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const state = this.game.getState();
      const cell = this.renderer.cellFromEvent(event, state.map);
      const operator = this.game.getOperatorAt(cell);
      if (operator) {
        this.pendingDeployment = null;
        const result = this.game.retreatOperator(operator.id);
        this.message = result.ok ? `${operator.name} 已撤退` : result.reason;
        this.sync();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (this.handleGlobalShortcut(event)) {
        return;
      }
      if (!this.pendingDeployment) {
        return;
      }
      const direction = directionFromKey(event.key);
      if (direction) {
        event.preventDefault();
        this.finalizePendingDeployment(direction);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.finalizePendingDeployment(this.pendingDeployment.direction ?? 'right');
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.pendingDeployment = null;
        this.message = '已取消部署方向选择';
        this.sync();
      }
    });
  }

  handleGlobalShortcut(event) {
    if (isEditableTarget(event.target)) {
      return false;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      const status = this.game.getState().status;
      if (status === 'ready') {
        this.game.start();
        this.loop.start();
      } else if (status === 'paused') {
        this.game.resume();
      } else if (status === 'running') {
        this.game.pause();
      }
      this.sync();
      return true;
    }
    if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      this.game.cycleSpeed();
      this.sync();
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.pendingDeployment = null;
      this.game.clearSelection();
      this.message = '';
      this.sync();
      return true;
    }
    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      this.game.restart();
      this.renderKeys = {};
      this.pendingDeployment = null;
      this.message = '';
      this.sync();
      return true;
    }
    if (/^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      const operator = buildOperatorDeckModel(this.game.getState())[index];
      if (!operator || operator.disabled) {
        return false;
      }
      event.preventDefault();
      const result = this.game.toggleOperatorSelection(operator.id);
      this.pendingDeployment = null;
      this.message = result.canceled ? '已取消部署选择' : `${operator.name} 待部署`;
      this.sync();
      return true;
    }
    return false;
  }

  importMapJson(jsonText) {
    const rawMap = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    const saved = saveCustomMapToLibrary(rawMap, this.storage);
    this.customMaps = saved.maps;
    this.rebuildMapLibrary();
    this.mapIndex = this.mapEntries.findIndex((entry) => entry.source === 'custom' && entry.map.id === saved.map.id);
    if (this.mapIndex < 0) {
      this.mapIndex = this.maps.length - 1;
    }
    this.renderKeys = {};
    this.mapOptionsKey = '';
    this.mapLibraryKey = '';
    this.message = `已导入地图：${saved.map.name}`;
    this.pendingDeployment = null;
    this.createGame(saved.map);
    this.sync();
    return saved.map;
  }

  sync() {
    const state = this.game.getState();
    const keys = buildRenderKeys(state, this.message);
    this.renderMapOptions();
    this.renderMapLibraryPanel();
    this.renderIfChanged('topStatus', keys.topStatus, () => this.renderTopStatus(state));
    this.renderIfChanged('operatorDeck', keys.operatorDeck, () => this.renderOperatorDeck(state));
    this.renderIfChanged('infoPanel', keys.infoPanel, () => this.renderInfoPanel(state));
    this.renderIfChanged('controls', keys.controls, () => this.renderControls(state));
    this.renderIfChanged('result', keys.result, () => this.renderResult(state));
    this.renderIfChanged('enemyIntel', keys.enemyIntel, () => this.renderEnemyIntel(state));
    this.renderer.render({ ...state, pendingDeployment: this.pendingDeployment });
  }

  beginDeploymentDirectionSelection(operatorType, cell) {
    const check = this.game.canDeploy(operatorType, cell);
    if (!check.ok) {
      this.message = check.reason;
      this.pendingDeployment = null;
      return;
    }
    this.pendingDeployment = {
      operatorType,
      cell: { x: cell.x, y: cell.y },
      direction: 'right'
    };
    this.message = `${check.template.name} 选择方向`;
  }

  handlePendingDeploymentClick(event, cell) {
    if (isSameCell(cell, this.pendingDeployment.cell)) {
      this.finalizePendingDeployment(this.renderer.directionFromEvent(event, this.game.getState().map, this.pendingDeployment.cell));
      return;
    }

    const adjacentDirection = directionBetweenCells(this.pendingDeployment.cell, cell);
    if (adjacentDirection) {
      this.finalizePendingDeployment(adjacentDirection);
      return;
    }

    const state = this.game.getState();
    if (state.selectedOperatorType) {
      this.beginDeploymentDirectionSelection(state.selectedOperatorType, cell);
      return;
    }

    this.pendingDeployment = null;
  }

  finalizePendingDeployment(direction) {
    if (!this.pendingDeployment) {
      return;
    }
    const pending = this.pendingDeployment;
    const result = this.game.deployOperator(pending.operatorType, pending.cell, direction);
    this.pendingDeployment = null;
    this.message = result.ok ? `${result.operator.name} 部署完成 · ${directionLabel(direction)}` : result.reason;
    this.sync();
  }

  selectMapIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.maps.length) {
      return;
    }
    this.mapIndex = index;
    this.renderKeys = {};
    this.pendingDeployment = null;
    this.createGame(this.maps[this.mapIndex]);
    this.message = '';
    this.sync();
  }

  rebuildMapLibrary() {
    this.mapEntries = buildMapLibrary(this.defaultMaps, this.customMaps);
    this.maps = this.mapEntries.map((entry) => entry.map);
  }

  openMapInEditor(index) {
    const entry = this.mapEntries[index];
    if (!entry) {
      return;
    }
    try {
      storeEditorDraftMap(entry.map, this.storage, { source: entry.source });
      window.location.href = `${import.meta.env.BASE_URL}editor.html?draft=1`;
    } catch (error) {
      this.message = `编辑跳转失败：${error.message}`;
      this.sync();
    }
  }

  deleteCustomMap(mapId) {
    const deletingSelected = this.mapEntries[this.mapIndex]?.source === 'custom' && this.mapEntries[this.mapIndex]?.map.id === mapId;
    try {
      const result = deleteCustomMapFromLibrary(mapId, this.storage);
      this.customMaps = result.maps;
      this.rebuildMapLibrary();
      this.mapOptionsKey = '';
      this.mapLibraryKey = '';
      if (deletingSelected) {
        this.mapIndex = 0;
        this.renderKeys = {};
        this.pendingDeployment = null;
        this.createGame(this.maps[this.mapIndex]);
      } else {
        this.mapIndex = Math.min(this.mapIndex, this.maps.length - 1);
      }
      this.message = '已删除导入地图';
      this.sync();
    } catch (error) {
      this.message = `删除失败：${error.message}`;
      this.sync();
    }
  }

  renderIfChanged(section, key, render) {
    if (this.renderKeys[section] === key) {
      return;
    }
    render();
    this.renderKeys[section] = key;
  }

  renderMapOptions() {
    const key = this.mapEntries.map((entry) => `${entry.key}:${entry.map.name}`).join('|');
    if (this.mapOptionsKey === key) {
      this.mapSelect.value = String(this.mapIndex);
      return;
    }
    this.mapSelect.innerHTML = this.mapEntries.map((entry, index) => {
      return `<option value="${index}">${escapeHtml(entry.map.name)}</option>`;
    }).join('');
    this.mapSelect.value = String(this.mapIndex);
    this.mapOptionsKey = key;
  }

  renderMapLibraryPanel() {
    if (!this.mapLibraryPanel) {
      return;
    }

    const model = buildMapLibraryPanelModel(this.mapEntries, this.mapIndex);
    const key = JSON.stringify(model);
    if (this.mapLibraryKey === key) {
      return;
    }

    this.mapLibraryPanel.innerHTML = `
      <h2>地图库</h2>
      <div class="map-library-list">
        ${model.map((entry) => `
          <article class="map-library-item ${entry.selected ? 'selected' : ''}">
            <button data-map-library-select="${entry.index}">
              <strong>${escapeHtml(entry.name)}</strong>
              <span>${escapeHtml(entry.sourceLabel)} · ${escapeHtml(entry.id)}</span>
            </button>
            <div class="map-library-actions">
              <button data-map-library-edit="${entry.index}" ${entry.editable ? '' : 'disabled'}>编辑</button>
              <button data-map-library-delete="${escapeHtml(entry.id)}" ${entry.deletable ? '' : 'disabled'}>删除</button>
            </div>
          </article>
        `).join('')}
      </div>
    `;
    this.mapLibraryKey = key;
  }

  renderTopStatus(state) {
    this.topStatus.innerHTML = `
      <div class="status-item accent">COST <strong>${state.cost}/${state.maxCost}</strong></div>
      <div class="status-item">LIFE <strong>${state.lives}/${state.maxLives}</strong></div>
      <div class="status-item">DEPLOY <strong>${state.operators.length}/${state.deployLimit}</strong></div>
      <div class="status-item">WAVE <strong>${state.currentWave}/${state.totalWaves}</strong></div>
      <div class="status-item">TIME <strong>${formatBattleTime(state.elapsed)}</strong></div>
      <div class="status-item map-name">${state.map.name}</div>
      <div class="status-message">${this.message}</div>
    `;
  }

  renderOperatorDeck(state) {
    const model = buildOperatorDeckModel(state);
    this.operatorDeck.innerHTML = model.map((operator) => `
      <button class="operator-card ${operator.selected ? 'selected' : ''}" data-operator-id="${operator.id}" data-operator-name="${operator.name}" ${operator.disabled || state.status === 'victory' || state.status === 'defeat' ? 'disabled' : ''}>
        <span class="operator-class" style="background:${operator.color}">${operator.className.slice(0, 1)}</span>
        <span class="operator-name">${operator.name}</span>
        <span class="operator-meta">
          <b>${operator.cost}</b>
          <em>${operator.deployed}/${operator.limit}</em>
        </span>
        <span class="operator-reason">${operator.disabledReason}</span>
      </button>
    `).join('');
  }

  renderInfoPanel(state) {
    const selected = state.operators.find((operator) => operator.id === state.selectedOperatorId);
    if (!selected) {
      this.infoPanel.innerHTML = `
        <h2>战术面板</h2>
        <p>选择底部干员后点击合法格部署。右键已部署干员撤退。</p>
        ${this.renderShortcutGuide()}
      `;
      return;
    }

    const skills = buildSkillPanelModel(selected);
    const stats = buildOperatorDisplayStats(selected);
    this.infoPanel.innerHTML = `
      <h2>${selected.name}</h2>
      <dl>
        <div><dt>职业</dt><dd>${selected.className}</dd></div>
        <div><dt>生命</dt><dd>${stats.hp}/${stats.maxHp}</dd></div>
        <div><dt>攻击</dt><dd>${stats.attack}<small>${escapeHtml(stats.attackSummary)}</small></dd></div>
        <div><dt>防御</dt><dd>${stats.defense}</dd></div>
        <div><dt>法抗</dt><dd>${stats.resistance}</dd></div>
        <div><dt>间隔</dt><dd>${stats.attackInterval}s</dd></div>
        <div><dt>阻挡</dt><dd>${stats.blockedCount}/${stats.block}</dd></div>
      </dl>
      ${skills.length > 0 ? skills.map((skill) => `
        <section class="skill-panel">
          <h3>${skill.name}<span>${skill.triggerMode === 'auto' ? '自动' : '手动'}</span></h3>
          <p>${skill.description}</p>
          <small>范围：${skill.rangeSummary}</small>
          <div class="skill-sp"><span style="width:${skillPanelPercent(skill)}%"></span></div>
          <div class="skill-row">
            <strong>${skillPanelValue(skill)}</strong>
            ${skill.manual
              ? `<button data-skill-button="${skill.id}" ${skill.ready ? '' : 'disabled'}>${skillButtonLabel(skill, '释放技能')}</button>`
              : `<button disabled>${skillButtonLabel(skill, '自动')}</button>`}
          </div>
        </section>
      `).join('') : ''}
      ${this.renderShortcutGuide()}
    `;
  }

  renderShortcutGuide() {
    return `
      <section class="shortcut-guide">
        <h3>快捷键</h3>
        <dl>
          ${buildKeyboardShortcutGuideModel().map((item) => `
            <div><dt>${escapeHtml(item.key)}</dt><dd>${escapeHtml(item.label)}</dd></div>
          `).join('')}
        </dl>
      </section>
    `;
  }

  renderControls(state) {
    this.pauseButton.textContent = state.status === 'paused' ? '继续' : '暂停';
    this.speedButton.textContent = `${state.speed}x`;
    this.startButton.disabled = state.status === 'running';
  }

  renderResult(state) {
    if (state.status !== 'victory' && state.status !== 'defeat') {
      this.resultModal.classList.add('hidden');
      return;
    }

    this.resultModal.classList.remove('hidden');
    this.resultModal.innerHTML = `
      <div class="result-box">
        <h2>${state.status === 'victory' ? '行动完成' : '防线失守'}</h2>
        <div class="stars">${state.status === 'victory' ? '★'.repeat(state.stars) : 'NO CLEAR'}</div>
        <p>击败 ${state.kills} / 漏怪 ${state.leaks} / 剩余生命 ${state.lives}</p>
        <button id="modal-restart">重新开始</button>
      </div>
    `;
    this.resultModal.querySelector('#modal-restart').addEventListener('click', () => {
      this.game.restart();
      this.sync();
    }, { once: true });
  }

  renderEnemyIntel(state) {
    const model = buildEnemyIntelModel(state.enemyIntelQueue?.[0]);
    if (!this.enemyIntelPanel) {
      this.enemyIntelPanel = document.createElement('aside');
      this.enemyIntelPanel.id = 'enemy-intel-panel';
      this.enemyIntelPanel.className = 'enemy-intel-panel hidden';
      this.root.appendChild(this.enemyIntelPanel);
    }
    if (!model) {
      this.enemyIntelPanel.classList.add('hidden');
      this.enemyIntelPanel.replaceChildren();
      return;
    }
    this.enemyIntelPanel.classList.remove('hidden');
    this.enemyIntelPanel.replaceChildren();

    const closeButton = document.createElement('button');
    closeButton.className = 'enemy-intel-close';
    closeButton.dataset.enemyIntelClose = model.id;
    closeButton.setAttribute('aria-label', '关闭敌人情报');
    closeButton.textContent = '×';

    const title = document.createElement('h2');
    title.textContent = model.name;

    const stats = document.createElement('dl');
    stats.appendChild(createEnemyIntelStat('生命', `${model.maxHp}${model.phaseCount > 0 ? ` / ${model.phaseCount}阶段` : ''}`));
    stats.appendChild(createEnemyIntelStat('攻击', model.attack));
    stats.appendChild(createEnemyIntelStat('防御', model.defense));
    stats.appendChild(createEnemyIntelStat('法抗', `${Math.round(model.resistance * 100)}%`));
    stats.appendChild(createEnemyIntelStat('速度', model.speed));
    stats.appendChild(createEnemyIntelStat('范围', model.rangeSummary));

    const description = document.createElement('p');
    description.textContent = model.description;

    const tags = document.createElement('div');
    tags.className = 'enemy-intel-tags';
    model.traits.forEach((trait) => {
      const tag = document.createElement('span');
      tag.textContent = trait;
      tags.appendChild(tag);
    });

    this.enemyIntelPanel.appendChild(closeButton);
    this.enemyIntelPanel.appendChild(title);
    this.enemyIntelPanel.appendChild(stats);
    this.enemyIntelPanel.appendChild(description);
    this.enemyIntelPanel.appendChild(tags);
  }
}

function skillPanelPercent(skill) {
  if (Number(skill.ammo ?? 0) > 0 && Number(skill.ammoRemaining ?? 0) > 0) {
    return Math.min(100, (skill.ammoRemaining / skill.ammo) * 100);
  }
  const spCost = Number(skill.spCost ?? 0);
  if (!Number.isFinite(spCost) || spCost <= 0) {
    return 0;
  }
  return Math.min(100, (Number(skill.sp ?? 0) / spCost) * 100);
}

function skillPanelValue(skill) {
  if (Number(skill.ammo ?? 0) > 0 && Number(skill.ammoRemaining ?? 0) > 0) {
    return `${skill.ammoRemaining}/${skill.ammo} 弹药`;
  }
  return `${skill.sp}/${skill.spCost} SP`;
}

function skillButtonLabel(skill, fallback) {
  if (Number(skill.ammo ?? 0) > 0 && Number(skill.ammoRemaining ?? 0) > 0) {
    return `${skill.ammoRemaining} 发`;
  }
  if (skill.activeRemaining > 0) {
    return `${skill.activeRemaining}s`;
  }
  return fallback;
}

function createEnemyIntelStat(label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  const details = document.createElement('dd');
  term.textContent = label;
  details.textContent = String(value);
  row.appendChild(term);
  row.appendChild(details);
  return row;
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

function isSameCell(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function directionBetweenCells(origin, target) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    return null;
  }
  if (dx === 1) {
    return 'right';
  }
  if (dx === -1) {
    return 'left';
  }
  if (dy === 1) {
    return 'down';
  }
  return 'up';
}

function directionFromKey(key) {
  const normalized = key.toLowerCase();
  if (normalized === 'arrowup' || normalized === 'w') {
    return 'up';
  }
  if (normalized === 'arrowright' || normalized === 'd') {
    return 'right';
  }
  if (normalized === 'arrowdown' || normalized === 's') {
    return 'down';
  }
  if (normalized === 'arrowleft' || normalized === 'a') {
    return 'left';
  }
  return null;
}

function directionLabel(direction) {
  if (direction === 'up') {
    return '向上';
  }
  if (direction === 'down') {
    return '向下';
  }
  if (direction === 'left') {
    return '向左';
  }
  return '向右';
}

function isEditableTarget(target) {
  const tagName = target?.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target?.isContentEditable;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
