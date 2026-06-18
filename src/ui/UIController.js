import { CLASS_LIMITS, DEFAULT_OPERATOR_ORDER, TOTAL_DEPLOY_LIMIT } from '../data/defaultOperators.js';
import { Game } from '../core/Game.js';
import { GameLoop } from '../core/GameLoop.js';

export function formatBattleTime(seconds) {
  const totalSeconds = Math.floor(seconds);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const remainder = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function buildOperatorDeckModel({ operatorCatalog, operators, cost, selectedOperatorType }) {
  const deployedByClass = operators.reduce((counts, operator) => {
    counts[operator.class] = (counts[operator.class] ?? 0) + 1;
    return counts;
  }, {});

  return orderedOperatorTemplates(operatorCatalog).map((template) => {
    const id = template.id;
    const classLimit = CLASS_LIMITS[template.class] ?? TOTAL_DEPLOY_LIMIT;
    const classCount = deployedByClass[template.class] ?? 0;
    const totalFull = operators.length >= TOTAL_DEPLOY_LIMIT;
    const classFull = classCount >= classLimit;
    const unaffordable = cost < template.cost;
    let disabledReason = '';
    if (unaffordable) {
      disabledReason = '费用不足';
    } else if (totalFull) {
      disabledReason = '部署上限';
    } else if (classFull) {
      disabledReason = '职业上限';
    }

    return {
      ...template,
      deployed: classCount,
      limit: classLimit,
      disabled: Boolean(disabledReason),
      disabledReason,
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

export function buildSkillPanelModel(operator) {
  if (!operator?.skill) {
    return null;
  }

  return {
    name: operator.skill.name,
    description: operator.skill.description,
    sp: Math.floor(operator.skill.sp),
    spCost: operator.skill.spCost,
    ready: operator.skill.sp >= operator.skill.spCost,
    activeRemaining: Math.ceil(operator.skill.activeRemaining)
  };
}

export function buildRenderKeys(state, message = '') {
  const selected = state.operators.find((operator) => operator.id === state.selectedOperatorId);
  const operatorDeckData = buildOperatorDeckModel(state).map((operator) => [
    operator.id,
    operator.deployed,
    operator.limit,
    operator.disabled,
    operator.disabledReason,
    operator.selected
  ]);
  const skill = buildSkillPanelModel(selected);

  return {
    topStatus: JSON.stringify([
      state.cost,
      state.maxCost,
      state.lives,
      state.maxLives,
      state.currentWave,
      state.totalWaves,
      formatBattleTime(state.elapsed),
      state.map.name,
      message
    ]),
    operatorDeck: JSON.stringify([
      state.status,
      state.cost,
      state.selectedOperatorType,
      state.operators.length,
      operatorDeckData
    ]),
    infoPanel: selected ? JSON.stringify([
      selected.id,
      Math.ceil(selected.hp),
      selected.maxHp,
      selected.attack,
      selected.defense,
      selected.attackInterval,
      selected.blockedCount,
      selected.block,
      skill?.name,
      skill?.description,
      skill?.sp,
      skill?.spCost,
      skill?.ready,
      skill?.activeRemaining
    ]) : 'empty',
    controls: JSON.stringify([state.status, state.speed]),
    result: JSON.stringify([
      state.status,
      state.stars,
      state.kills,
      state.leaks,
      state.lives
    ])
  };
}

export class UIController {
  constructor({ root, canvas, renderer, maps, operatorCatalog, enemyCatalog }) {
    this.root = root;
    this.canvas = canvas;
    this.renderer = renderer;
    this.maps = maps;
    this.operatorCatalog = operatorCatalog;
    this.enemyCatalog = enemyCatalog;
    this.mapIndex = 0;
    this.message = '';
    this.renderKeys = {};
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
    this.mapSelect = this.root.querySelector('#map-select');
    this.startButton = this.root.querySelector('#start-button');
    this.pauseButton = this.root.querySelector('#pause-button');
    this.restartButton = this.root.querySelector('#restart-button');
    this.speedButton = this.root.querySelector('#speed-button');
  }

  bindEvents() {
    this.mapSelect.addEventListener('change', () => {
      this.mapIndex = Number(this.mapSelect.value);
      this.renderKeys = {};
      this.createGame(this.maps[this.mapIndex]);
      this.message = '';
      this.sync();
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
      this.sync();
    });

    this.speedButton.addEventListener('click', () => {
      this.game.cycleSpeed();
      this.sync();
    });

    this.operatorDeck.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('[data-operator-id]');
      if (!button || button.disabled) {
        return;
      }
      event.preventDefault();
      this.game.selectOperator(button.dataset.operatorId);
      this.message = `${button.dataset.operatorName} 待部署`;
      this.sync();
    });

    this.infoPanel.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('#skill-button');
      if (!button) {
        return;
      }
      event.preventDefault();
      const state = this.game.getState();
      if (!state.selectedOperatorId) {
        return;
      }
      const result = this.game.activateSkill(state.selectedOperatorId);
      this.message = result.ok ? result.message : result.reason;
      this.sync();
    });

    this.canvas.addEventListener('pointermove', (event) => {
      const state = this.game.getState();
      this.game.setHoverCell(this.renderer.cellFromEvent(event, state.map));
      this.sync();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.game.setHoverCell(null);
      this.sync();
    });

    this.canvas.addEventListener('click', (event) => {
      const state = this.game.getState();
      const cell = this.renderer.cellFromEvent(event, state.map);
      if (state.selectedOperatorType) {
        const result = this.game.deployOperator(state.selectedOperatorType, cell);
        this.message = result.ok ? `${result.operator.name} 部署完成` : result.reason;
      } else {
        const operator = this.game.getOperatorAt(cell);
        if (operator) {
          this.game.selectPlacedOperator(operator.id);
          this.message = `${operator.name} 已选中`;
        } else {
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
        const result = this.game.retreatOperator(operator.id);
        this.message = result.ok ? `${operator.name} 已撤退` : result.reason;
        this.sync();
      }
    });
  }

  sync() {
    const state = this.game.getState();
    const keys = buildRenderKeys(state, this.message);
    this.renderMapOptions();
    this.renderIfChanged('topStatus', keys.topStatus, () => this.renderTopStatus(state));
    this.renderIfChanged('operatorDeck', keys.operatorDeck, () => this.renderOperatorDeck(state));
    this.renderIfChanged('infoPanel', keys.infoPanel, () => this.renderInfoPanel(state));
    this.renderIfChanged('controls', keys.controls, () => this.renderControls(state));
    this.renderIfChanged('result', keys.result, () => this.renderResult(state));
    this.renderer.render(state);
  }

  renderIfChanged(section, key, render) {
    if (this.renderKeys[section] === key) {
      return;
    }
    render();
    this.renderKeys[section] = key;
  }

  renderMapOptions() {
    if (this.mapSelect.options.length === this.maps.length) {
      return;
    }
    this.mapSelect.innerHTML = this.maps.map((map, index) => {
      return `<option value="${index}">${map.name}</option>`;
    }).join('');
    this.mapSelect.value = String(this.mapIndex);
  }

  renderTopStatus(state) {
    this.topStatus.innerHTML = `
      <div class="status-item accent">COST <strong>${state.cost}/${state.maxCost}</strong></div>
      <div class="status-item">LIFE <strong>${state.lives}/${state.maxLives}</strong></div>
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
      `;
      return;
    }

    const skill = buildSkillPanelModel(selected);
    this.infoPanel.innerHTML = `
      <h2>${selected.name}</h2>
      <dl>
        <div><dt>职业</dt><dd>${selected.className}</dd></div>
        <div><dt>生命</dt><dd>${Math.ceil(selected.hp)}/${selected.maxHp}</dd></div>
        <div><dt>攻击</dt><dd>${selected.attack}</dd></div>
        <div><dt>防御</dt><dd>${selected.defense}</dd></div>
        <div><dt>间隔</dt><dd>${selected.attackInterval}s</dd></div>
        <div><dt>阻挡</dt><dd>${selected.blockedCount}/${selected.block}</dd></div>
      </dl>
      ${skill ? `
        <section class="skill-panel">
          <h3>${skill.name}</h3>
          <p>${skill.description}</p>
          <div class="skill-sp"><span style="width:${Math.min(100, (skill.sp / skill.spCost) * 100)}%"></span></div>
          <div class="skill-row">
            <strong>${skill.sp}/${skill.spCost} SP</strong>
            <button id="skill-button" ${skill.ready ? '' : 'disabled'}>${skill.activeRemaining > 0 ? `${skill.activeRemaining}s` : '释放技能'}</button>
          </div>
        </section>
      ` : ''}
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
}
