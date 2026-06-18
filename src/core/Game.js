import { normalizeMap } from '../data/MapLoader.js';
import { DEFAULT_ENEMIES } from '../data/defaultEnemies.js';
import { DEFAULT_OPERATORS } from '../data/defaultOperators.js';
import { resetEnemySequence } from '../entities/Enemy.js';
import { resetOperatorSequence } from '../entities/Operator.js';
import { createBlockingSystem } from '../systems/BlockingSystem.js';
import { createCombatSystem } from '../systems/CombatSystem.js';
import { createCostSystem } from '../systems/CostSystem.js';
import { createDeploymentSystem } from '../systems/DeploymentSystem.js';
import {
  createEnemyAttackEffect,
  createEnemyDeathEffect,
  createEffectSystem,
  createOperatorAttackEffect,
  createWaveWarningEffect
} from '../systems/EffectSystem.js';
import { createWaveSystem } from '../systems/WaveSystem.js';
import { evaluateBattleResult } from '../systems/WinLoseSystem.js';
import { activateOperatorSkill, tickOperatorSkills } from '../systems/SkillSystem.js';
import { pathLength, pathPositionAtDistance } from '../utils/GridMath.js';

const SPEEDS = [0.5, 1, 1.5, 2, 3, 4, 5];

export class Game {
  constructor({ map, operatorCatalog = DEFAULT_OPERATORS, enemyCatalog = DEFAULT_ENEMIES }) {
    this.originalMap = map;
    this.operatorCatalog = operatorCatalog;
    this.enemyCatalog = enemyCatalog;
    this.speedOptions = SPEEDS;
    this.speed = 1;
    this.selectedOperatorType = null;
    this.selectedOperatorId = null;
    this.speedBeforeInspection = null;
    this.hoverCell = null;
    this.resetState();
  }

  resetState() {
    this.restoreSpeedAfterInspection();
    resetOperatorSequence();
    resetEnemySequence();
    this.map = normalizeMap(this.originalMap);
    this.pathsById = new Map(this.map.paths.map((path) => [path.id, {
      ...path,
      length: pathLength(path.points)
    }]));
    this.costSystem = createCostSystem({
      initialCost: this.map.initialCost,
      maxCost: this.map.maxCost
    });
    this.deploymentSystem = createDeploymentSystem({
      map: this.map,
      costSystem: this.costSystem,
      operatorCatalog: this.operatorCatalog
    });
    this.waveSystem = createWaveSystem({
      timeline: this.map.timeline,
      enemyCatalog: this.enemyCatalog
    });
    this.blockingSystem = createBlockingSystem();
    this.combatSystem = createCombatSystem();
    this.effectSystem = createEffectSystem();
    this.warnedWaveEvents = new Set();
    this.seenEnemyTypes = new Set();
    this.enemyIntelQueue = [];
    this.enemies = [];
    this.status = 'ready';
    this.lives = this.map.maxLives;
    this.leaks = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.stars = 0;
    this.result = null;
    this.currentWave = 0;
  }

  start() {
    if (this.status === 'ready' || this.status === 'paused') {
      this.status = 'running';
    }
  }

  pause() {
    if (this.status === 'running') {
      this.status = 'paused';
    }
  }

  resume() {
    if (this.status === 'paused') {
      this.status = 'running';
    }
  }

  restart() {
    this.resetState();
  }

  setSpeed(multiplier) {
    if (this.speedOptions.includes(multiplier)) {
      this.speed = multiplier;
    }
  }

  cycleSpeed() {
    const index = this.speedOptions.indexOf(this.speed);
    this.speed = this.speedOptions[(index + 1) % this.speedOptions.length];
    return this.speed;
  }

  selectOperator(operatorType) {
    if (!this.operatorCatalog[operatorType]) {
      return { ok: false, reason: `Unknown operator ${operatorType}` };
    }
    this.restoreSpeedAfterInspection();
    this.selectedOperatorType = operatorType;
    this.selectedOperatorId = null;
    return { ok: true };
  }

  toggleOperatorSelection(operatorType) {
    if (this.selectedOperatorType === operatorType) {
      this.clearSelection();
      return { ok: true, canceled: true };
    }
    return this.selectOperator(operatorType);
  }

  clearSelection() {
    this.restoreSpeedAfterInspection();
    this.selectedOperatorType = null;
    this.selectedOperatorId = null;
  }

  setHoverCell(cell) {
    this.hoverCell = cell ? { x: cell.x, y: cell.y } : null;
  }

  canDeploy(operatorType, cell) {
    return this.deploymentSystem.canDeploy(operatorType, cell);
  }

  deployOperator(operatorType, cell, direction = 'right') {
    if (this.isEnded()) {
      return { ok: false, reason: 'Battle has ended' };
    }
    const result = this.deploymentSystem.deploy(operatorType, cell, direction);
    if (result.ok) {
      this.selectedOperatorType = null;
      this.selectedOperatorId = result.operator.id;
    }
    return result;
  }

  retreatOperator(operatorId) {
    if (this.isEnded()) {
      return { ok: false, reason: 'Battle has ended' };
    }
    const result = this.deploymentSystem.retreat(operatorId);
    if (result.ok && this.selectedOperatorId === operatorId) {
      this.clearSelection();
    }
    return result;
  }

  selectPlacedOperator(operatorId) {
    const operator = this.deploymentSystem.operators.find((item) => item.id === operatorId);
    if (!operator) {
      return { ok: false, reason: `Operator ${operatorId} is not deployed` };
    }
    this.selectedOperatorId = operatorId;
    this.selectedOperatorType = null;
    this.beginInspectionSpeed();
    return { ok: true, operator };
  }

  activateSkill(operatorId, skillId = null) {
    if (this.isEnded()) {
      return { ok: false, reason: 'Battle has ended' };
    }

    const operator = this.deploymentSystem.operators.find((item) => item.id === operatorId);
    if (!operator) {
      return { ok: false, reason: `Operator ${operatorId} is not deployed` };
    }

    return activateOperatorSkill(operator, {
      costSystem: this.costSystem,
      operators: this.deploymentSystem.operators
    }, skillId);
  }

  getOperatorAt(cell) {
    return this.deploymentSystem.getOperatorAt(cell);
  }

  tick(deltaSeconds) {
    if (this.status !== 'running') {
      return this.getState();
    }

    const scaledDelta = deltaSeconds * this.speed;
    this.effectSystem.tick(scaledDelta);
    this.elapsed += scaledDelta;

    const waveWarningSeconds = this.map.waveWarningSeconds ?? 2;
    this.waveSystem.warningsDue(waveWarningSeconds + scaledDelta).forEach((warning) => {
      if (this.warnedWaveEvents.has(warning.id)) {
        return;
      }
      this.warnedWaveEvents.add(warning.id);
      this.effectSystem.add(createWaveWarningEffect({
        ...warning,
        duration: waveWarningSeconds
      }));
    });

    const waveResult = this.waveSystem.tick(scaledDelta);
    this.currentWave = Math.max(this.currentWave, waveResult.currentWave);
    waveResult.spawned.forEach((enemy) => {
      this.placeEnemyAtPathDistance(enemy, 0);
      this.enemies.push(enemy);
      this.queueEnemyIntel(enemy.templateId);
    });

    this.costSystem.tick(scaledDelta, this.deploymentSystem.operators);
    this.deploymentSystem.tickCooldowns(scaledDelta);
    tickOperatorSkills(scaledDelta, this.deploymentSystem.operators, {
      costSystem: this.costSystem,
      operators: this.deploymentSystem.operators
    });
    this.blockingSystem.clearInvalidBlocks(this.deploymentSystem.operators, this.enemies);
    this.moveEnemies(scaledDelta);
    this.blockingSystem.update(this.deploymentSystem.operators, this.enemies);

    const combatResult = this.combatSystem.tick(scaledDelta, {
      operators: this.deploymentSystem.operators,
      enemies: this.enemies,
      onEnemyKilled: (enemy) => this.handleEnemyKilled(enemy)
    });
    this.addCombatEffects(combatResult);

    this.enemies = this.enemies.filter((enemy) => !enemy.isDead && !enemy.reachedExit);
    this.deploymentSystem.operators = this.deploymentSystem.operators.filter((operator) => !operator.isDead);
    if (this.selectedOperatorId && !this.deploymentSystem.operators.some((operator) => operator.id === this.selectedOperatorId)) {
      this.clearSelection();
    }
    this.blockingSystem.update(this.deploymentSystem.operators, this.enemies);
    this.evaluateResult();
    return this.getState();
  }

  addCombatEffects(result) {
    result.attacks?.forEach((attack) => {
      this.effectSystem.add(createOperatorAttackEffect({
        source: attack.source.cell,
        target: attack.target.cell,
        color: attack.source.color
      }));
    });
    result.enemyAttacks?.forEach((attack) => {
      this.effectSystem.add(createEnemyAttackEffect({
        source: attack.source.cell,
        target: attack.target.cell,
        color: attack.source.color
      }));
    });
    result.killedEnemies?.forEach((enemy) => {
      this.effectSystem.add(createEnemyDeathEffect({
        cell: enemy.cell,
        color: enemy.color,
        phaseBreak: false
      }));
    });
    result.phaseChangedEnemies?.forEach((enemy) => {
      this.effectSystem.add(createEnemyDeathEffect({
        cell: enemy.cell,
        color: enemy.color,
        phaseBreak: true
      }));
    });
  }

  getState() {
    return {
      status: this.status,
      map: this.map,
      cost: this.costSystem.current,
      maxCost: this.costSystem.max,
      lives: this.lives,
      maxLives: this.map.maxLives,
      leaks: this.leaks,
      kills: this.kills,
      stars: this.stars,
      result: this.result,
      speed: this.speed,
      speedOptions: this.speedOptions,
      elapsed: this.elapsed,
      currentWave: this.currentWave,
      totalWaves: this.map.totalWaves,
      operators: this.deploymentSystem.operators,
      enemies: this.enemies,
      effects: this.effectSystem.list(),
      operatorCatalog: this.operatorCatalog,
      selectedOperatorType: this.selectedOperatorType,
      selectedOperatorId: this.selectedOperatorId,
      hoverCell: this.hoverCell,
      redeployCooldowns: { ...this.deploymentSystem.redeployCooldowns },
      deployLimit: this.deploymentSystem.totalLimit,
      enemyIntelQueue: this.enemyIntelQueue.map((enemy) => structuredClone(enemy))
    };
  }

  queueEnemyIntel(templateId) {
    if (this.seenEnemyTypes.has(templateId)) {
      return;
    }
    const template = this.enemyCatalog[templateId];
    if (!template) {
      return;
    }
    this.seenEnemyTypes.add(templateId);
    this.enemyIntelQueue.push(template);
  }

  dismissEnemyIntel(templateId) {
    this.enemyIntelQueue = this.enemyIntelQueue.filter((enemy) => enemy.id !== templateId);
  }

  isEnded() {
    return this.status === 'victory' || this.status === 'defeat';
  }

  beginInspectionSpeed() {
    if (this.speedBeforeInspection === null) {
      this.speedBeforeInspection = this.speed;
    }
    this.speed = 0.5;
  }

  restoreSpeedAfterInspection() {
    if (this.speedBeforeInspection !== null) {
      this.speed = this.speedBeforeInspection;
      this.speedBeforeInspection = null;
    }
  }

  moveEnemies(deltaSeconds) {
    this.enemies.forEach((enemy) => {
      if (enemy.isDead || enemy.reachedExit || enemy.blockedBy) {
        return;
      }

      const path = this.pathsById.get(enemy.pathId);
      if (!path) {
        throw new Error(`Enemy ${enemy.id} references missing path ${enemy.pathId}`);
      }

      enemy.pathDistance += enemy.speed * deltaSeconds;
      if (enemy.pathDistance >= path.length) {
        this.placeEnemyAtPathDistance(enemy, path.length);
        enemy.reachedExit = true;
        this.leaks += 1;
        this.lives = Math.max(0, this.lives - (path.lifeDamage ?? 1));
        return;
      }

      this.placeEnemyAtPathDistance(enemy, enemy.pathDistance);
    });
  }

  placeEnemyAtPathDistance(enemy, distance) {
    const path = this.pathsById.get(enemy.pathId);
    if (!path) {
      throw new Error(`Enemy ${enemy.id} references missing path ${enemy.pathId}`);
    }
    const position = pathPositionAtDistance(path.points, distance);
    enemy.x = position.x;
    enemy.y = position.y;
    enemy.cell = position.cell;
  }

  handleEnemyKilled(enemy) {
    if (enemy._rewarded) {
      return;
    }
    enemy._rewarded = true;
    this.kills += 1;
    this.costSystem.add(enemy.rewardCost ?? 0);
  }

  evaluateResult() {
    const result = evaluateBattleResult({
      lives: this.lives,
      leaks: this.leaks,
      wavesComplete: this.waveSystem.isComplete(),
      enemiesRemaining: this.enemies.filter((enemy) => !enemy.isDead && !enemy.reachedExit).length
    });

    if (result.state === 'victory' || result.state === 'defeat') {
      this.status = result.state;
      this.stars = result.stars;
      this.result = result;
    }
  }
}
