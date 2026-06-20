import { DEFAULT_OPERATORS } from '../data/defaultOperators.js';
import { buildOperatorNeuralBarModel, buildOperatorSpBarModel } from '../ui/OperatorViewModels.js';
import { hasReadyManualSkill } from '../systems/SkillSystem.js';
import { gridToCenter, pixelToGrid } from '../utils/GridMath.js';
import { rangeCellsFor as getRangeCellsFor } from '../utils/RangeMath.js';

export { rangeCellsFor } from '../utils/RangeMath.js';

const TILE_COLORS = {
  path: '#27313d',
  high: '#2d4454',
  wall: '#111821'
};

const TILE_STROKES = {
  path: '#56606d',
  high: '#5fc9ff',
  wall: '#222b35'
};

export function calculateCanvasMetrics(map, canvasWidth, canvasHeight) {
  const usableWidth = canvasWidth * 0.8;
  const usableHeight = canvasHeight * 0.8;
  const tileSize = Math.floor(Math.min(usableWidth / map.width, usableHeight / map.height));
  const boardWidth = tileSize * map.width;
  const boardHeight = tileSize * map.height;

  return {
    tileSize,
    boardWidth,
    boardHeight,
    offsetX: Math.floor((canvasWidth - boardWidth) / 2),
    offsetY: Math.floor((canvasHeight - boardHeight) / 2)
  };
}

export function tileColorForType(type) {
  return TILE_COLORS[type] ?? '#1a222b';
}

export function buildForbiddenTileOverlayModel(cell, { tileSize, offsetX, offsetY }) {
  const px = offsetX + cell.x * tileSize;
  const py = offsetY + cell.y * tileSize;
  const fillInset = 2;
  const crossInset = Math.max(6, tileSize * 0.2);
  return {
    fillRect: {
      x: px + fillInset,
      y: py + fillInset,
      width: tileSize - fillInset * 2,
      height: tileSize - fillInset * 2
    },
    lines: [
      {
        from: { x: px + crossInset, y: py + crossInset },
        to: { x: px + tileSize - crossInset, y: py + tileSize - crossInset }
      },
      {
        from: { x: px + tileSize - crossInset, y: py + crossInset },
        to: { x: px + crossInset, y: py + tileSize - crossInset }
      }
    ]
  };
}

export function buildEnemyHpBarModel(enemy) {
  const phaseCount = Array.isArray(enemy?.phases) && enemy.phases.length > 1 ? enemy.phases.length : 1;
  const phaseIndex = clampInteger(enemy?.phaseIndex, 0, phaseCount - 1);
  const bars = Array.from({ length: phaseCount }, (_, index) => {
    if (index < phaseIndex) {
      return { phaseIndex: index, ratio: 1, active: false, state: 'completed' };
    }
    if (index > phaseIndex) {
      return { phaseIndex: index, ratio: 1, active: false, state: 'pending' };
    }
    return {
      phaseIndex: index,
      ratio: unitHpRatio(enemy),
      active: true,
      state: 'active'
    };
  });

  return { bars };
}

export function smoothDisplayedRatio(current, target, factor = 0.22) {
  if (!Number.isFinite(current)) {
    return clampRatio(target);
  }
  const next = current + (clampRatio(target) - current) * factor;
  return Math.round(clampRatio(next) * 1000) / 1000;
}

export function buildBossHpBarModel(enemies = [], effects = []) {
  const boss = enemies.find((enemy) => enemy?.boss && !enemy.isDead && !enemy.reachedExit);
  if (!boss) {
    return { visible: false };
  }
  const animationEffect = effects.find((effect) => {
    return effect.type === 'boss_bar' && effect.payload?.bossId === boss.id;
  });
  const phaseCount = Array.isArray(boss.phases) && boss.phases.length > 0 ? boss.phases.length : 1;
  return {
    visible: true,
    id: boss.id,
    name: boss.name,
    hp: Math.ceil(boss.hp),
    maxHp: Math.ceil(boss.maxHp),
    hpText: `${Math.ceil(boss.hp)}/${Math.ceil(boss.maxHp)}`,
    ratio: unitHpRatio(boss),
    phaseIndex: clampInteger(boss.phaseIndex, 0, phaseCount - 1),
    phaseCount,
    animation: animationEffect?.payload?.kind ?? 'idle',
    animationProgress: effectProgress(animationEffect)
  };
}

export function buildFloatingTextLayout({ cell, progress, stackIndex = 0, tileSize, offsetX, offsetY }) {
  const center = gridToCenter(cell, tileSize);
  const lane = Number(stackIndex ?? 0);
  const side = lane % 2 === 0 ? 1 : -1;
  const spread = Math.ceil(lane / 2);
  return {
    x: offsetX + center.x + side * spread * tileSize * 0.24,
    y: offsetY + center.y - tileSize * (0.25 + progress * 0.45 + lane * 0.1)
  };
}

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.metrics = null;
    this.displayRatios = new Map();
  }

  render(state) {
    const { width, height, ratio } = this.resizeCanvas();
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    this.metrics = calculateCanvasMetrics(state.map, width, height);
    this.drawBackground(ctx, width, height);
    this.drawGrid(ctx, state);
    this.drawMapOverlays(ctx, state);
    this.drawPaths(ctx, state);
    this.drawEffects(ctx, state);
    this.drawDeploymentPreview(ctx, state);
    this.drawSelectedRange(ctx, state);
    this.drawDeploymentDirectionPrompt(ctx, state);
    this.drawOperators(ctx, state);
    this.drawEnemies(ctx, state);
    this.drawBossHpBar(ctx, state, width);
    ctx.restore();
  }

  cellFromEvent(event, map) {
    const rect = this.canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const metrics = this.metrics ?? calculateCanvasMetrics(map, rect.width, rect.height);
    const local = {
      x: point.x - metrics.offsetX,
      y: point.y - metrics.offsetY
    };
    return pixelToGrid(local, metrics.tileSize);
  }

  directionFromEvent(event, map, cell) {
    const rect = this.canvas.getBoundingClientRect();
    const metrics = this.metrics ?? calculateCanvasMetrics(map, rect.width, rect.height);
    const localX = event.clientX - rect.left - metrics.offsetX - cell.x * metrics.tileSize;
    const localY = event.clientY - rect.top - metrics.offsetY - cell.y * metrics.tileSize;
    const dx = localX - metrics.tileSize / 2;
    const dy = localY - metrics.tileSize / 2;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? 'right' : 'left';
    }
    return dy >= 0 ? 'down' : 'up';
  }

  drawBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#111821');
    gradient.addColorStop(1, '#0b0f15');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawGrid(ctx, state) {
    const { tileSize, offsetX, offsetY } = this.metrics;
    state.map.grid.forEach((row, y) => {
      row.forEach((type, x) => {
        const px = offsetX + x * tileSize;
        const py = offsetY + y * tileSize;
        ctx.fillStyle = tileColorForType(type);
        ctx.fillRect(px, py, tileSize, tileSize);
        ctx.strokeStyle = TILE_STROKES[type] ?? '#303947';
        ctx.lineWidth = type === 'high' ? 1.4 : 1;
        ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);

        if (type === 'high') {
          ctx.fillStyle = 'rgba(95, 201, 255, 0.12)';
          ctx.fillRect(px + 4, py + 4, tileSize - 8, tileSize - 8);
        }
      });
    });
  }

  drawMapOverlays(ctx, state) {
    const { tileSize, offsetX, offsetY } = this.metrics;
    Object.entries(state.map.tileMeta ?? {}).forEach(([key, meta]) => {
      if (meta.deployable !== false) {
        return;
      }
      const [x, y] = key.split(',').map(Number);
      const overlay = buildForbiddenTileOverlayModel({ x, y }, this.metrics);
      ctx.save();
      ctx.fillStyle = 'rgba(236, 87, 87, 0.18)';
      ctx.fillRect(overlay.fillRect.x, overlay.fillRect.y, overlay.fillRect.width, overlay.fillRect.height);
      ctx.strokeStyle = 'rgba(236, 87, 87, 0.72)';
      ctx.lineWidth = Math.max(2, tileSize * 0.08);
      ctx.lineCap = 'round';
      overlay.lines.forEach((line) => {
        ctx.beginPath();
        ctx.moveTo(line.from.x, line.from.y);
        ctx.lineTo(line.to.x, line.to.y);
        ctx.stroke();
      });
      ctx.restore();
    });

    (state.map.paths ?? []).forEach((path) => {
      const entry = path.entry ?? path.points?.[0];
      const exit = path.exit ?? path.points?.[path.points.length - 1];
      if (entry) {
        this.drawTileBadge(ctx, entry, '#ec5757', 'IN');
      }
      if (exit) {
        this.drawTileBadge(ctx, exit, '#5fc9ff', 'OUT');
      }
    });
  }

  drawPaths(ctx, state) {
    const { tileSize, offsetX, offsetY } = this.metrics;
    state.map.paths.forEach((path) => {
      ctx.beginPath();
      path.points.forEach((point, index) => {
        const center = gridToCenter(point, tileSize);
        const x = offsetX + center.x;
        const y = offsetY + center.y;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.strokeStyle = path.color ?? '#f6c445';
      ctx.lineWidth = Math.max(4, tileSize * 0.08);
      ctx.globalAlpha = 0.42;
      ctx.stroke();
      ctx.globalAlpha = 1;

      (path.waypointActions ?? []).forEach((waypoint) => {
        const point = path.points[waypoint.pointIndex];
        if (!point) {
          return;
        }
        const center = gridToCenter(point, tileSize);
        ctx.save();
        ctx.fillStyle = '#f6c445';
        ctx.strokeStyle = '#10141b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(offsetX + center.x, offsetY + center.y, Math.max(5, tileSize * 0.12), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    });
  }

  drawEffects(ctx, state) {
    (state.effects ?? []).forEach((effect) => {
      if (!effect?.type) {
        return;
      }
      if (effect.type === 'wave_warning') {
        this.drawWaveWarningEffect(ctx, effect, state);
      }
      if (effect.type === 'operator_attack' || effect.type === 'enemy_attack') {
        this.drawAttackEffect(ctx, effect);
      }
      if (effect.type === 'operator_heal') {
        this.drawHealEffect(ctx, effect);
      }
      if (effect.type === 'enemy_death') {
        this.drawDeathEffect(ctx, effect);
      }
      if (effect.type === 'floating_text') {
        this.drawFloatingTextEffect(ctx, effect);
      }
    });
  }

  drawWaveWarningEffect(ctx, effect, state) {
    const pathId = effect?.payload?.pathId;
    const path = state?.map?.paths?.find((candidate) => candidate.id === pathId);
    if (!this.metrics || !Array.isArray(path?.points) || path.points.length === 0) {
      return;
    }

    const { tileSize, offsetX, offsetY } = this.metrics;
    const progress = effectProgress(effect);
    const pulse = Math.sin(progress * Math.PI);
    ctx.save();
    ctx.strokeStyle = effectColor(effect.payload?.color, '#f6c445');
    ctx.fillStyle = effectColor(effect.payload?.color, '#f6c445');
    ctx.globalAlpha = 0.3 + pulse * 0.45;
    ctx.lineWidth = Math.max(3, tileSize * 0.08) + pulse * Math.max(2, tileSize * 0.03);
    ctx.lineCap = 'round';
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([Math.max(6, tileSize * 0.18), Math.max(5, tileSize * 0.12)]);
    }
    ctx.beginPath();
    path.points.forEach((point, index) => {
      const center = gridToCenter(point, tileSize);
      const x = offsetX + center.x;
      const y = offsetY + center.y;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([]);
    }

    const start = gridToCenter(path.points[0], tileSize);
    ctx.globalAlpha = 0.22 + pulse * 0.32;
    ctx.beginPath();
    ctx.arc(offsetX + start.x, offsetY + start.y, tileSize * (0.24 + pulse * 0.18), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawAttackEffect(ctx, effect) {
    const source = effect?.payload?.source;
    const target = effect?.payload?.target;
    if (!this.metrics || !isGridCell(source) || !isGridCell(target)) {
      return;
    }

    const { tileSize, offsetX, offsetY } = this.metrics;
    const progress = effectProgress(effect);
    const sourceCenter = gridToCenter(source, tileSize);
    const targetCenter = gridToCenter(target, tileSize);
    const sourceX = offsetX + sourceCenter.x;
    const sourceY = offsetY + sourceCenter.y;
    const targetX = offsetX + targetCenter.x;
    const targetY = offsetY + targetCenter.y;
    const color = effectColor(effect.payload?.color, effect.type === 'enemy_attack' ? '#ec5757' : '#f6c445');

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.max(0.12, 1 - progress);
    ctx.lineWidth = Math.max(2, tileSize * 0.045);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sourceX, sourceY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.globalAlpha = Math.max(0.08, 0.55 - progress * 0.45);
    ctx.beginPath();
    ctx.arc(targetX, targetY, tileSize * (0.12 + progress * 0.18), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawHealEffect(ctx, effect) {
    const source = effect?.payload?.source;
    const target = effect?.payload?.target;
    if (!this.metrics || !isGridCell(source) || !isGridCell(target)) {
      return;
    }

    const { tileSize, offsetX, offsetY } = this.metrics;
    const progress = effectProgress(effect);
    const sourceCenter = gridToCenter(source, tileSize);
    const targetCenter = gridToCenter(target, tileSize);
    const sourceX = offsetX + sourceCenter.x;
    const sourceY = offsetY + sourceCenter.y;
    const targetX = offsetX + targetCenter.x;
    const targetY = offsetY + targetCenter.y;
    const color = effectColor(effect.payload?.color, '#72e0a6');
    const pulse = Math.sin(progress * Math.PI);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.22 + pulse * 0.52;
    ctx.lineWidth = Math.max(2, tileSize * 0.04);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sourceX, sourceY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.globalAlpha = 0.18 + pulse * 0.28;
    ctx.beginPath();
    ctx.arc(targetX, targetY, tileSize * (0.16 + pulse * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawDeathEffect(ctx, effect) {
    const cell = effect?.payload?.cell;
    if (!this.metrics || !isGridCell(cell)) {
      return;
    }

    const { tileSize, offsetX, offsetY } = this.metrics;
    const progress = effectProgress(effect);
    const center = gridToCenter(cell, tileSize);
    const x = offsetX + center.x;
    const y = offsetY + center.y;
    const color = effectColor(effect.payload?.color, '#e15f5f');
    const radius = tileSize * (0.16 + progress * 0.42);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.max(0, 0.7 - progress * 0.62);
    ctx.lineWidth = effect.payload?.phaseBreak ? Math.max(3, tileSize * 0.06) : Math.max(2, tileSize * 0.045);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = Math.max(0, 0.16 - progress * 0.14);
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawFloatingTextEffect(ctx, effect) {
    const cell = effect?.payload?.cell;
    if (!this.metrics || !isGridCell(cell)) {
      return;
    }

    const { tileSize, offsetX, offsetY } = this.metrics;
    const progress = effectProgress(effect);
    const { x, y } = buildFloatingTextLayout({
      cell,
      progress,
      stackIndex: effect.payload?.stackIndex ?? 0,
      tileSize,
      offsetX,
      offsetY
    });
    const amount = Number(effect.payload?.amount ?? 0);
    const kind = effect.payload?.kind ?? 'damage';
    const color = kind === 'heal' ? '#72e0a6' : kind === 'neural' ? '#d87dff' : '#ec5757';
    const sign = amount > 0 ? '+' : '';

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - progress * 0.85);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#061015';
    ctx.lineWidth = 3;
    ctx.font = `800 ${Math.max(12, tileSize * 0.22)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(`${sign}${Math.round(amount)}`, x, y);
    ctx.fillText(`${sign}${Math.round(amount)}`, x, y);
    ctx.restore();
  }

  drawDeploymentPreview(ctx, state) {
    if (!state.selectedOperatorType && !state.pendingDeployment) {
      return;
    }

    const operatorType = state.pendingDeployment?.operatorType ?? state.selectedOperatorType;
    const template = state.operatorCatalog[operatorType] ?? DEFAULT_OPERATORS[operatorType];
    if (!template) {
      return;
    }

    const { tileSize, offsetX, offsetY } = this.metrics;
    const expectedTypes = new Set(deployTerrainTypes(template));
    const occupied = new Set(state.operators.map((operator) => `${operator.cell.x},${operator.cell.y}`));

    state.map.grid.forEach((row, y) => {
      row.forEach((type, x) => {
        const cell = { x, y };
        const legal = expectedTypes.has(type)
          && !occupied.has(`${x},${y}`)
          && state.cost >= template.cost
          && !isEntryOrExitCell(state.map, cell)
          && state.map.tileMeta?.[cellKey(cell)]?.deployable !== false;
        if (!expectedTypes.has(type) && type !== 'wall') {
          return;
        }
        if (type === 'wall') {
          return;
        }
        ctx.fillStyle = legal ? 'rgba(95, 201, 255, 0.18)' : 'rgba(236, 87, 87, 0.16)';
        ctx.fillRect(offsetX + x * tileSize + 2, offsetY + y * tileSize + 2, tileSize - 4, tileSize - 4);
      });
    });

    const previewCell = state.pendingDeployment?.cell ?? state.hoverCell;
    const previewDirection = state.pendingDeployment?.direction ?? 'right';
    if (previewCell) {
      this.drawRangeCells(ctx, previewCell, template.normalAttack?.range ?? template.range, legalRangeColor(template), previewDirection);
    }
  }

  drawOperators(ctx, state) {
    const { tileSize, offsetX, offsetY } = this.metrics;
    state.operators.forEach((operator) => {
      const center = gridToCenter(operator.cell, tileSize);
      const x = offsetX + center.x;
      const y = offsetY + center.y;
      const radius = tileSize * 0.34;

      ctx.beginPath();
      ctx.fillStyle = operator.color;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = state.selectedOperatorId === operator.id ? '#ffffff' : '#10141b';
      ctx.lineWidth = state.selectedOperatorId === operator.id ? 3 : 2;
      ctx.stroke();

      this.drawDirectionMarker(ctx, x, y, radius, operator.direction);
      if (hasReadyManualSkill(operator)) {
        this.drawReadySkillMarker(ctx, x, y, radius);
      }

      ctx.fillStyle = '#061015';
      ctx.font = `700 ${Math.max(10, tileSize * 0.18)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(operator.className.slice(0, 1), x, y);

      this.drawHpBar(ctx, operator, x - radius, y + radius + 4, radius * 2, 5);
      const neuralBar = buildOperatorNeuralBarModel(operator);
      if (neuralBar.visible) {
        const neuralRatio = this.displayRatioFor(`${operator.id}:neural`, neuralBar.ratio);
        this.drawRatioBar(ctx, x - radius, y - radius - 9, radius * 2, 4, neuralRatio, '#d87dff');
      }
      const spBar = buildOperatorSpBarModel(operator);
      if (spBar.visible) {
        this.drawRatioBar(ctx, x - radius, y + radius + 11, radius * 2, 4, spBar.ratio, spBar.ready ? '#f6c445' : '#5fc9ff');
      }
    });
  }

  drawEnemies(ctx, state) {
    const { tileSize, offsetX, offsetY } = this.metrics;
    state.enemies.forEach((enemy) => {
      const x = offsetX + enemy.x * tileSize + tileSize / 2;
      const y = offsetY + enemy.y * tileSize + tileSize / 2;
      const radius = tileSize * (enemy.isFlying ? 0.24 : 0.28);

      ctx.beginPath();
      if (enemy.isFlying) {
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius, y + radius);
        ctx.lineTo(x - radius, y + radius);
        ctx.closePath();
      } else {
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = enemy.color;
      ctx.fill();
      ctx.strokeStyle = enemy.blockedBy ? '#ffffff' : '#10141b';
      ctx.lineWidth = enemy.blockedBy ? 2.5 : 1.5;
      ctx.stroke();
      if (enemy.movementPauseRemaining > 0) {
        ctx.fillStyle = '#f6c445';
        ctx.font = `700 ${Math.max(10, tileSize * 0.18)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('II', x, y - radius - Math.max(6, tileSize * 0.08));
      }

      this.drawEnemyHpBars(ctx, enemy, x - radius, y + radius + 4, radius * 2, 4);
    });
  }

  drawSelectedRange(ctx, state) {
    const selected = state.operators.find((operator) => operator.id === state.selectedOperatorId);
    if (selected) {
      this.drawRangeCells(ctx, selected.cell, selected.normalAttack?.range ?? selected.range, 'rgba(246, 196, 69, 0.18)', selected.direction);
    }
  }

  drawRangeCells(ctx, origin, range, fillStyle, direction = 'right') {
    if (!origin || !range) {
      return;
    }

    const { tileSize, offsetX, offsetY } = this.metrics;
    getRangeCellsFor(origin, range, direction).forEach((cell) => {
      ctx.fillStyle = fillStyle;
      ctx.fillRect(offsetX + cell.x * tileSize + 3, offsetY + cell.y * tileSize + 3, tileSize - 6, tileSize - 6);
    });
  }

  drawDeploymentDirectionPrompt(ctx, state) {
    const pending = state.pendingDeployment;
    if (!pending) {
      return;
    }
    const { tileSize, offsetX, offsetY } = this.metrics;
    const center = gridToCenter(pending.cell, tileSize);
    const x = offsetX + center.x;
    const y = offsetY + center.y;
    const radius = tileSize * 0.42;
    ctx.save();
    ctx.strokeStyle = '#f6c445';
    ctx.fillStyle = 'rgba(246, 196, 69, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ['up', 'right', 'down', 'left'].forEach((direction) => {
      this.drawDirectionMarker(ctx, x, y, radius + tileSize * 0.1, direction, '#f6c445');
    });
    ctx.restore();
  }

  drawDirectionMarker(ctx, x, y, radius, direction = 'right', color = '#ffffff') {
    const vector = directionVector(direction);
    const tipX = x + vector.x * radius;
    const tipY = y + vector.y * radius;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + vector.x * radius * 0.35, y + vector.y * radius * 0.35);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawReadySkillMarker(ctx, x, y, radius) {
    ctx.save();
    ctx.strokeStyle = '#f6c445';
    ctx.fillStyle = '#f6c445';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + radius * 0.72, y - radius * 0.72, Math.max(4, radius * 0.18), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawTileBadge(ctx, cell, color, label) {
    const { tileSize, offsetX, offsetY } = this.metrics;
    const px = offsetX + cell.x * tileSize;
    const py = offsetY + cell.y * tileSize;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(px + 3, py + 3, tileSize - 6, tileSize - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#061015';
    ctx.font = `800 ${Math.max(8, tileSize * 0.12)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + tileSize / 2, py + tileSize / 2);
    ctx.restore();
  }

  drawHpBar(ctx, unit, x, y, width, height) {
    const hpRatio = this.displayRatioFor(`${unit.id ?? unit.name}:hp`, unitHpRatio(unit));
    this.drawRatioBar(ctx, x, y, width, height, hpRatio, hpRatio > 0.45 ? '#72e0a6' : '#ec5757');
  }

  drawEnemyHpBars(ctx, enemy, x, y, width, height) {
    const model = buildEnemyHpBarModel(enemy);
    const barHeight = model.bars.length > 1 ? Math.max(2, Math.floor(height * 0.75)) : height;
    const gap = model.bars.length > 1 ? 1 : 0;

    model.bars.forEach((bar, index) => {
      const barY = y + index * (barHeight + gap);
      const ratio = this.displayRatioFor(`${enemy.id}:phase:${bar.phaseIndex}`, bar.ratio);
      this.drawRatioBar(ctx, x, barY, width, barHeight, ratio, enemyHpBarColor({ ...bar, ratio }));
    });
  }

  drawBossHpBar(ctx, state, canvasWidth) {
    const model = buildBossHpBarModel(state.enemies, state.effects);
    if (!model.visible) {
      return;
    }
    const width = Math.min(canvasWidth * 0.58, 560);
    const height = 20;
    const x = (canvasWidth - width) / 2;
    const enterOffset = model.animation === 'enter' ? (1 - model.animationProgress) * -34 : 0;
    const y = Math.max(14, this.metrics.offsetY - 42) + enterOffset;
    const ratio = model.animation === 'phase_refill'
      ? Math.max(model.ratio, model.animationProgress)
      : this.displayRatioFor(`${model.id}:boss`, model.ratio);

    ctx.save();
    ctx.fillStyle = 'rgba(6, 16, 21, 0.88)';
    ctx.fillRect(x - 12, y - 12, width + 24, height + 34);
    ctx.strokeStyle = '#ec5757';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 12, y - 12, width + 24, height + 34);
    ctx.fillStyle = '#111821';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = '#ec5757';
    ctx.fillRect(x, y, width * clampRatio(ratio), height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${model.name}  ${model.hpText}`, x + width / 2, y + height / 2);
    ctx.fillStyle = '#f6c445';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText(`PHASE ${model.phaseIndex + 1}/${model.phaseCount}`, x + width / 2, y + height + 12);
    ctx.restore();
  }

  drawRatioBar(ctx, x, y, width, height, ratio, color) {
    ctx.fillStyle = '#111821';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), height);
  }

  resizeCanvas() {
    const width = this.canvas.clientWidth || 800;
    const height = this.canvas.clientHeight || 480;
    const ratio = window.devicePixelRatio || 1;
    const targetWidth = Math.floor(width * ratio);
    const targetHeight = Math.floor(height * ratio);
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }
    return { width, height, ratio };
  }

  displayRatioFor(key, target) {
    const current = this.displayRatios.get(key);
    const next = smoothDisplayedRatio(current, target);
    this.displayRatios.set(key, next);
    return next;
  }
}

function legalRangeColor(template) {
  const deployTypes = deployTypesForTemplate(template);
  if (deployTypes.includes('ground') && deployTypes.includes('high')) {
    return 'rgba(78, 208, 179, 0.16)';
  }
  return deployTypes[0] === 'ground' ? 'rgba(246, 196, 69, 0.16)' : 'rgba(95, 201, 255, 0.16)';
}

function deployTypesForTemplate(template) {
  return Array.isArray(template.deployTypes) && template.deployTypes.length > 0
    ? template.deployTypes
    : [template.deployType];
}

function deployTerrainTypes(template) {
  return deployTypesForTemplate(template)
    .map((deployType) => deployType === 'ground' ? 'path' : (deployType === 'high' ? 'high' : null))
    .filter(Boolean);
}

function directionVector(direction) {
  if (direction === 'up') {
    return { x: 0, y: -1 };
  }
  if (direction === 'down') {
    return { x: 0, y: 1 };
  }
  if (direction === 'left') {
    return { x: -1, y: 0 };
  }
  return { x: 1, y: 0 };
}

function unitHpRatio(unit) {
  const hp = Number(unit?.hp);
  const maxHp = Number(unit?.maxHp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
    return 0;
  }
  return clampRatio(hp / maxHp);
}

function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

function isEntryOrExitCell(map, cell) {
  return (map.paths ?? []).some((path) => {
    const entry = path.entry ?? path.points?.[0];
    const exit = path.exit ?? path.points?.[path.points.length - 1];
    return sameCell(entry, cell) || sameCell(exit, cell);
  });
}

function sameCell(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function clampRatio(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function clampInteger(value, min, max) {
  const parsed = Number.isInteger(value) ? value : min;
  return Math.max(min, Math.min(max, parsed));
}

function enemyHpBarColor(bar) {
  if (bar.state === 'pending') {
    return '#56606d';
  }
  if (bar.state === 'completed') {
    return '#8fd4ff';
  }
  return bar.ratio > 0.45 ? '#72e0a6' : '#ec5757';
}

function effectProgress(effect) {
  const elapsed = Number(effect?.elapsed);
  const duration = Number(effect?.duration);
  if (!Number.isFinite(elapsed) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, elapsed / duration));
}

function effectColor(color, fallback) {
  return typeof color === 'string' && color.length > 0 ? color : fallback;
}

function isGridCell(cell) {
  return Number.isFinite(cell?.x) && Number.isFinite(cell?.y);
}
