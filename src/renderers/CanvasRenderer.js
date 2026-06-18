import { DEFAULT_OPERATORS } from '../data/defaultOperators.js';
import { buildOperatorSpBarModel } from '../ui/UIController.js';
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

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.metrics = null;
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
    this.drawPaths(ctx, state);
    this.drawEffects(ctx, state);
    this.drawDeploymentPreview(ctx, state);
    this.drawSelectedRange(ctx, state);
    this.drawDeploymentDirectionPrompt(ctx, state);
    this.drawOperators(ctx, state);
    this.drawEnemies(ctx, state);
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
      if (effect.type === 'enemy_death') {
        this.drawDeathEffect(ctx, effect);
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
    const expectedType = template.deployType === 'ground' ? 'path' : 'high';
    const occupied = new Set(state.operators.map((operator) => `${operator.cell.x},${operator.cell.y}`));

    state.map.grid.forEach((row, y) => {
      row.forEach((type, x) => {
        const legal = type === expectedType && !occupied.has(`${x},${y}`) && state.cost >= template.cost;
        if (type !== expectedType && type !== 'wall') {
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
      this.drawRangeCells(ctx, previewCell, template.range, legalRangeColor(template.deployType), previewDirection);
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

      this.drawHpBar(ctx, enemy, x - radius, y + radius + 4, radius * 2, 4);
    });
  }

  drawSelectedRange(ctx, state) {
    const selected = state.operators.find((operator) => operator.id === state.selectedOperatorId);
    if (selected) {
      this.drawRangeCells(ctx, selected.cell, selected.range, 'rgba(246, 196, 69, 0.18)', selected.direction);
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

  drawHpBar(ctx, unit, x, y, width, height) {
    const hpRatio = unit.hp / unit.maxHp;
    this.drawRatioBar(ctx, x, y, width, height, hpRatio, hpRatio > 0.45 ? '#72e0a6' : '#ec5757');
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
}

function legalRangeColor(deployType) {
  return deployType === 'ground' ? 'rgba(246, 196, 69, 0.16)' : 'rgba(95, 201, 255, 0.16)';
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
