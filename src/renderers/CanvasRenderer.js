import { DEFAULT_OPERATORS } from '../data/defaultOperators.js';
import { gridToCenter, isCellInDiamondRange, pixelToGrid } from '../utils/GridMath.js';

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
    this.drawDeploymentPreview(ctx, state);
    this.drawOperators(ctx, state);
    this.drawEnemies(ctx, state);
    this.drawSelectedRange(ctx, state);
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

  drawDeploymentPreview(ctx, state) {
    if (!state.selectedOperatorType) {
      return;
    }

    const template = state.operatorCatalog[state.selectedOperatorType] ?? DEFAULT_OPERATORS[state.selectedOperatorType];
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

    if (state.hoverCell) {
      this.drawRangeCells(ctx, state.hoverCell, template.range, legalRangeColor(template.deployType));
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

      ctx.fillStyle = '#061015';
      ctx.font = `700 ${Math.max(10, tileSize * 0.18)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(operator.className.slice(0, 1), x, y);

      this.drawHpBar(ctx, operator, x - radius, y + radius + 4, radius * 2, 5);
      if (operator.block > 0) {
        ctx.fillStyle = '#dce9f8';
        ctx.font = `600 ${Math.max(9, tileSize * 0.14)}px Inter, sans-serif`;
        ctx.fillText(`${operator.blockedCount}/${operator.block}`, x, y - radius - 7);
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
      this.drawRangeCells(ctx, selected.cell, selected.range, 'rgba(246, 196, 69, 0.18)');
    }
  }

  drawRangeCells(ctx, origin, range, fillStyle) {
    if (!origin || !range || range.type === 'melee') {
      return;
    }

    const { tileSize, offsetX, offsetY } = this.metrics;
    const radius = Math.ceil(range.radius);
    for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
      for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
        if (!isCellInDiamondRange(origin, { x, y }, range.radius)) {
          continue;
        }
        ctx.fillStyle = fillStyle;
        ctx.fillRect(offsetX + x * tileSize + 3, offsetY + y * tileSize + 3, tileSize - 6, tileSize - 6);
      }
    }
  }

  drawHpBar(ctx, unit, x, y, width, height) {
    ctx.fillStyle = '#111821';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = unit.hp / unit.maxHp > 0.45 ? '#72e0a6' : '#ec5757';
    ctx.fillRect(x, y, width * Math.max(0, unit.hp / unit.maxHp), height);
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
