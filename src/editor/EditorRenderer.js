import { calculateCanvasMetrics, tileColorForType } from '../renderers/CanvasRenderer.js';
import { gridToCenter, pixelToGrid } from '../utils/GridMath.js';

export class EditorRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.metrics = null;
  }

  render(state, hoverCell = null) {
    const { width, height, ratio } = this.resizeCanvas();
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.metrics = calculateCanvasMetrics(state.map, width, height);
    this.drawBackground(ctx, width, height);
    this.drawGrid(ctx, state, hoverCell);
    this.drawPaths(ctx, state);
    ctx.restore();
  }

  cellFromEvent(event, map) {
    const rect = this.canvas.getBoundingClientRect();
    const metrics = this.metrics ?? calculateCanvasMetrics(map, rect.width, rect.height);
    const point = {
      x: event.clientX - rect.left - metrics.offsetX,
      y: event.clientY - rect.top - metrics.offsetY
    };
    return pixelToGrid(point, metrics.tileSize);
  }

  drawBackground(ctx, width, height) {
    ctx.fillStyle = '#0b0f15';
    ctx.fillRect(0, 0, width, height);
  }

  drawGrid(ctx, state, hoverCell) {
    const { tileSize, offsetX, offsetY } = this.metrics;
    state.map.grid.forEach((row, y) => {
      row.forEach((type, x) => {
        const px = offsetX + x * tileSize;
        const py = offsetY + y * tileSize;
        ctx.fillStyle = tileColorForType(type);
        ctx.fillRect(px, py, tileSize, tileSize);
        ctx.strokeStyle = '#344454';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);
        ctx.fillStyle = '#6f8297';
        ctx.font = `${Math.max(9, tileSize * 0.12)}px Inter, sans-serif`;
        ctx.fillText(`${x},${y}`, px + 4, py + 12);
      });
    });

    if (hoverCell) {
      ctx.fillStyle = 'rgba(246, 196, 69, 0.22)';
      ctx.fillRect(
        offsetX + hoverCell.x * tileSize + 2,
        offsetY + hoverCell.y * tileSize + 2,
        tileSize - 4,
        tileSize - 4
      );
    }
  }

  drawPaths(ctx, state) {
    const { tileSize, offsetX, offsetY } = this.metrics;
    state.map.paths.forEach((path) => {
      if (path.points.length === 0) {
        return;
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
      ctx.strokeStyle = path.id === state.selectedPathId ? '#ffffff' : path.color;
      ctx.lineWidth = path.id === state.selectedPathId ? 5 : 3;
      ctx.stroke();

      path.points.forEach((point, index) => {
        const center = gridToCenter(point, tileSize);
        const x = offsetX + center.x;
        const y = offsetY + center.y;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(4, tileSize * 0.12), 0, Math.PI * 2);
        ctx.fillStyle = path.color;
        ctx.fill();
        ctx.fillStyle = '#061015';
        ctx.font = `700 ${Math.max(9, tileSize * 0.14)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), x, y);
      });
    });
  }

  resizeCanvas() {
    const width = this.canvas.clientWidth || 800;
    const height = this.canvas.clientHeight || 520;
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
