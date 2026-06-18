import { normalizeMap, validateMap } from '../data/MapLoader.js';
import { isCellInBounds, isSameCell } from '../utils/GridMath.js';

const VALID_CELL_TYPES = new Set(['path', 'high', 'wall']);
let pathSequence = 0;
let eventSequence = 0;

export function createEditorState({
  width = 10,
  height = 6,
  name = '未命名地图',
  id = 'custom-map'
} = {}) {
  const map = {
    version: '2.0',
    id,
    name,
    description: '',
    width,
    height,
    initialCost: 20,
    maxCost: 30,
    maxLives: 10,
    totalWaves: 3,
    grid: Array.from({ length: height }, () => Array.from({ length: width }, () => 'wall')),
    paths: [],
    timeline: []
  };

  return {
    map,
    selectedTool: 'path',
    selectedPathId: null,
    timelineEvents: [],
    message: ''
  };
}

export function setCellType(state, cell, type) {
  return paintCells(state, [cell], type);
}

export function paintCells(state, cells, type, options = {}) {
  if (!VALID_CELL_TYPES.has(type)) {
    throw new Error(`Invalid cell type ${type}`);
  }
  const targetCells = uniqueInBoundsCells(cells, state.map.width, state.map.height);
  const next = cloneState(state);

  targetCells.forEach((cell) => {
    const previousType = next.map.grid[cell.y][cell.x];
    next.map.grid[cell.y][cell.x] = type;
  });

  if (type !== 'path') {
    removePathPointsAtCells(next, targetCells);
  }

  if (type === 'path' && options.appendPathPoints && next.selectedPathId) {
    const path = findPath(next, next.selectedPathId);
    targetCells
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((cell) => {
        if (!path.points.some((point) => isSameCell(point, cell))) {
          path.points.push({ x: cell.x, y: cell.y });
        }
      });
    normalizePathEndpoints(next, path.id);
  }

  normalizeAllPathEndpoints(next);
  return next;
}

export function cellsInRect(start, end) {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const cells = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

export function resizeMap(state, width, height, fillType = 'wall') {
  if (!VALID_CELL_TYPES.has(fillType)) {
    throw new Error(`Invalid cell type ${fillType}`);
  }

  const nextWidth = clampInteger(width, 3, 30);
  const nextHeight = clampInteger(height, 3, 20);
  const next = cloneState(state);
  const grid = Array.from({ length: nextHeight }, (_, y) => {
    return Array.from({ length: nextWidth }, (_, x) => next.map.grid[y]?.[x] ?? fillType);
  });

  next.map = {
    ...next.map,
    width: nextWidth,
    height: nextHeight,
    grid
  };
  next.map.paths.forEach((path) => {
    path.points = path.points.filter((point) => isCellInBounds(point, nextWidth, nextHeight));
  });
  normalizeAllPathEndpoints(next);
  return next;
}

export function updateMapMeta(state, patch) {
  const next = cloneState(state);
  next.map = {
    ...next.map,
    ...patch
  };
  return next;
}

export function addPath(state, name = '新路径') {
  const next = cloneState(state);
  pathSequence += 1;
  const path = {
    id: `path-${pathSequence}`,
    name,
    entry: null,
    exit: null,
    points: [],
    color: pathColor(pathSequence),
    lifeDamage: 1
  };
  next.map.paths.push(path);
  next.selectedPathId = path.id;
  return next;
}

export function updatePath(state, pathId, patch) {
  const next = cloneState(state);
  const path = findPath(next, pathId);
  Object.assign(path, patch);
  return normalizePathEndpoints(next, path.id);
}

export function removePath(state, pathId) {
  const next = cloneState(state);
  next.map.paths = next.map.paths.filter((path) => path.id !== pathId);
  next.timelineEvents = next.timelineEvents.filter((event) => event.pathId !== pathId);
  next.map.timeline = next.timelineEvents.map(stripEventId);
  if (next.selectedPathId === pathId) {
    next.selectedPathId = next.map.paths[0]?.id ?? null;
  }
  return next;
}

export function selectPath(state, pathId) {
  if (!state.map.paths.some((path) => path.id === pathId)) {
    throw new Error(`Path ${pathId} does not exist`);
  }
  return {
    ...cloneState(state),
    selectedPathId: pathId
  };
}

export function addPointToSelectedPath(state, cell) {
  if (!state.selectedPathId) {
    throw new Error('No path selected');
  }
  if (!isCellInBounds(cell, state.map.width, state.map.height)) {
    throw new Error(`Cell ${cell.x},${cell.y} is outside grid`);
  }
  if (state.map.grid[cell.y][cell.x] !== 'path') {
    throw new Error('Path points must be on path terrain');
  }

  const next = cloneState(state);
  const path = findPath(next, next.selectedPathId);
  path.points.push({ x: cell.x, y: cell.y });
  return normalizePathEndpoints(next, path.id);
}

export function removeLastPointFromSelectedPath(state) {
  if (!state.selectedPathId) {
    throw new Error('No path selected');
  }

  const next = cloneState(state);
  const path = findPath(next, next.selectedPathId);
  path.points.pop();
  return normalizePathEndpoints(next, path.id);
}

export function addTimelineEvent(state) {
  const next = cloneState(state);
  eventSequence += 1;
  const pathId = next.selectedPathId ?? next.map.paths[0]?.id ?? '';
  const event = {
    id: `event-${eventSequence}`,
    wave: 1,
    startTime: 0,
    enemyType: 'infantry',
    count: 1,
    interval: 0.8,
    pathId
  };
  next.timelineEvents.push(event);
  next.map.timeline = next.timelineEvents.map(stripEventId);
  return next;
}

export function updateTimelineEvent(state, eventId, patch) {
  const next = cloneState(state);
  const event = next.timelineEvents.find((item) => item.id === eventId);
  if (!event) {
    throw new Error(`Timeline event ${eventId} does not exist`);
  }
  Object.assign(event, coerceTimelinePatch(patch));
  next.map.timeline = next.timelineEvents.map(stripEventId);
  next.map.totalWaves = Math.max(next.map.totalWaves, ...next.timelineEvents.map((item) => item.wave));
  return next;
}

export function removeTimelineEvent(state, eventId) {
  const next = cloneState(state);
  next.timelineEvents = next.timelineEvents.filter((event) => event.id !== eventId);
  next.map.timeline = next.timelineEvents.map(stripEventId);
  return next;
}

export function buildTimelinePreviewModel(timelineEvents, totalWaves = 1) {
  const events = [...(timelineEvents ?? [])].map((event) => {
    const count = Math.max(1, Number(event.count) || 1);
    const interval = Math.max(0, Number(event.interval) || 0);
    const startTime = Math.max(0, Number(event.startTime) || 0);
    const endTime = startTime + Math.max(0, count - 1) * interval;
    return {
      ...event,
      wave: Math.max(1, Number(event.wave) || 1),
      startTime,
      count,
      interval,
      endTime
    };
  });
  const waveCount = Math.max(1, Number(totalWaves) || 1, ...events.map((event) => event.wave));
  const duration = Math.max(30, ...events.map((event) => event.endTime));
  const rows = Array.from({ length: waveCount }, (_, index) => ({
    wave: index + 1,
    events: []
  }));

  events
    .sort((a, b) => a.startTime - b.startTime || a.wave - b.wave)
    .forEach((event) => {
      const width = event.count > 1 ? ((event.endTime - event.startTime) / duration) * 100 : 2.5;
      rows[event.wave - 1].events.push({
        id: event.id,
        wave: event.wave,
        enemyType: event.enemyType,
        pathId: event.pathId,
        count: event.count,
        startTime: event.startTime,
        endTime: event.endTime,
        leftPercent: roundPercent((event.startTime / duration) * 100),
        widthPercent: roundPercent(Math.max(2.5, width)),
        label: `${event.enemyType} x${event.count}`
      });
    });

  return {
    duration,
    rows
  };
}

export function toMapJson(state) {
  const map = {
    ...state.map,
    paths: state.map.paths.map((path) => normalizeExportPath(path)),
    timeline: state.timelineEvents.map(stripEventId)
  };
  validateMap(map);
  return map;
}

export function getValidation(state) {
  try {
    toMapJson(state);
    return {
      ok: true,
      message: '地图有效'
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message
    };
  }
}

export function loadMapIntoEditor(rawMap) {
  const map = normalizeMap(rawMap);
  const timelineEvents = map.timeline.map((event) => {
    eventSequence += 1;
    return {
      id: `event-${eventSequence}`,
      ...event
    };
  });
  map.paths.forEach((path) => {
    const match = /^path-(\d+)$/.exec(path.id);
    if (match) {
      pathSequence = Math.max(pathSequence, Number(match[1]));
    }
  });

  return {
    map: {
      ...map,
      timeline: timelineEvents.map(stripEventId)
    },
    selectedTool: 'path',
    selectedPathId: map.paths[0]?.id ?? null,
    timelineEvents,
    message: '地图已导入'
  };
}

function cloneState(state) {
  return structuredClone(state);
}

function findPath(state, pathId) {
  const path = state.map.paths.find((item) => item.id === pathId);
  if (!path) {
    throw new Error(`Path ${pathId} does not exist`);
  }
  return path;
}

function normalizePathEndpoints(state, pathId) {
  const path = findPath(state, pathId);
  path.entry = path.points[0] ?? null;
  path.exit = path.points[path.points.length - 1] ?? null;
  return state;
}

function normalizeAllPathEndpoints(state) {
  state.map.paths.forEach((path) => {
    path.entry = path.points[0] ?? null;
    path.exit = path.points[path.points.length - 1] ?? null;
  });
  return state;
}

function removePathPointsAtCells(state, cells) {
  if (cells.length === 0) {
    return state;
  }
  const keys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  state.map.paths.forEach((path) => {
    path.points = path.points.filter((point) => !keys.has(`${point.x},${point.y}`));
  });
  return state;
}

function uniqueInBoundsCells(cells, width, height) {
  const seen = new Set();
  const result = [];
  cells.forEach((cell) => {
    if (!isCellInBounds(cell, width, height)) {
      return;
    }
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push({ x: cell.x, y: cell.y });
  });
  return result;
}

function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Map size must be a finite number`);
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeExportPath(path) {
  const points = path.points.map((point) => ({ x: point.x, y: point.y }));
  return {
    id: path.id,
    name: path.name,
    entry: points[0],
    exit: points[points.length - 1],
    points,
    color: path.color,
    lifeDamage: path.lifeDamage ?? 1
  };
}

function stripEventId(event) {
  return {
    wave: Number(event.wave),
    startTime: Number(event.startTime),
    enemyType: event.enemyType,
    count: Number(event.count),
    interval: Number(event.interval),
    pathId: event.pathId
  };
}

function coerceTimelinePatch(patch) {
  const next = { ...patch };
  ['wave', 'startTime', 'count', 'interval'].forEach((key) => {
    if (key in next) {
      next[key] = Number(next[key]);
    }
  });
  return next;
}

function roundPercent(value) {
  return Math.round(value * 100) / 100;
}

function pathColor(index) {
  const colors = ['#f6c445', '#5fc9ff', '#72e0a6', '#b98cff', '#ff8a4d'];
  return colors[(index - 1) % colors.length];
}
