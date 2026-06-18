import { isSameCell, manhattanDistance } from './GridMath.js';

const PATTERN_LIMIT = 5;
export const DIRECTIONS = ['up', 'right', 'down', 'left'];

const RANGE_PRESETS = {
  melee: [{ x: 0, y: 0 }],
  'diamond-2': diamondPattern(2),
  'diamond-3': diamondPattern(3),
  'front-line-3': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
  'front-box-3x3': [
    { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 }, { x: 3, y: -1 },
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }
  ],
  cross: [
    { x: 0, y: -2 },
    { x: 0, y: -1 },
    { x: -2, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: 2 }
  ],
  'wide-medic': diamondPattern(3).filter((cell) => manhattanDistance({ x: 0, y: 0 }, cell) !== 3 || cell.x === 0 || cell.y === 0)
};

export function normalizeRange(range) {
  if (!range || typeof range !== 'object') {
    throw new Error('Range must be an object');
  }

  if (range.type === 'melee') {
    return { type: 'melee', radius: 0 };
  }

  if (range.type === 'diamond') {
    const radius = Number(range.radius);
    if (!Number.isFinite(radius) || radius < 0) {
      throw new Error('Diamond range radius must be a non-negative number');
    }
    return { type: 'diamond', radius };
  }

  if (range.type === 'pattern') {
    const cells = normalizePatternCells(range.cells);
    if (cells.length === 0) {
      throw new Error('Pattern range must include at least one cell');
    }
    return { type: 'pattern', cells };
  }

  throw new Error(`Unknown range type ${range.type}`);
}

export function normalizeDirection(direction = 'right') {
  return DIRECTIONS.includes(direction) ? direction : 'right';
}

export function rangeCellsFor(origin, range, direction = 'right') {
  const normalized = normalizeRange(range);
  if (normalized.type === 'melee') {
    return [{ x: origin.x, y: origin.y }];
  }

  if (normalized.type === 'diamond') {
    const radius = Math.ceil(normalized.radius);
    const cells = [];
    for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
      for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
        if (manhattanDistance(origin, { x, y }) <= normalized.radius) {
          cells.push({ x, y });
        }
      }
    }
    return cells;
  }

  const facing = normalizeDirection(direction);
  return normalized.cells.map((cell) => {
    const rotated = rotatePatternCell(cell, facing);
    return {
      x: origin.x + rotated.x,
      y: origin.y + rotated.y
    };
  });
}

export function isCellInRange(origin, target, range, direction = 'right') {
  return rangeCellsFor(origin, range, direction).some((cell) => isSameCell(cell, target));
}

export function rangePreset(name) {
  const cells = RANGE_PRESETS[name];
  if (!cells) {
    throw new Error(`Unknown range preset ${name}`);
  }
  return normalizeRange({ type: 'pattern', cells });
}

function normalizePatternCells(cells) {
  if (!Array.isArray(cells)) {
    throw new Error('Pattern range cells must be an array');
  }

  const seen = new Set();
  const normalized = [];
  cells.forEach((cell) => {
    const x = Number(cell?.x);
    const y = Number(cell?.y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return;
    }
    if (Math.abs(x) > PATTERN_LIMIT || Math.abs(y) > PATTERN_LIMIT) {
      return;
    }
    const key = `${x},${y}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push({ x, y });
  });
  return normalized;
}

function diamondPattern(radius) {
  const cells = [];
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (Math.abs(x) + Math.abs(y) <= radius) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function rotatePatternCell(cell, direction) {
  if (direction === 'down') {
    return { x: -cell.y, y: cell.x };
  }
  if (direction === 'left') {
    return { x: -cell.x, y: -cell.y };
  }
  if (direction === 'up') {
    return { x: cell.y, y: -cell.x };
  }
  return { x: cell.x, y: cell.y };
}
