import { getCellType, isCellInBounds } from '../utils/GridMath.js';

const VALID_CELL_TYPES = new Set(['path', 'high', 'wall']);
const cache = new Map();

export function normalizeMap(rawMap) {
  if (!rawMap || typeof rawMap !== 'object') {
    throw new Error('Map data must be an object');
  }

  const version = String(rawMap.version ?? '1.0');
  if (version === '2.0') {
    const normalized = {
      ...rawMap,
      paths: rawMap.paths?.map(normalizePath) ?? [],
      timeline: rawMap.timeline?.map(normalizeTimelineEvent) ?? []
    };
    validateMap(normalized);
    return normalized;
  }

  if (version !== '1.0') {
    throw new Error(`Unsupported map version: ${version}`);
  }

  const legacyPath = rawMap.path ?? [];
  const normalized = {
    ...rawMap,
    version: '2.0',
    paths: [{
      id: 'main',
      name: '主通道',
      entry: legacyPath[0],
      exit: legacyPath[legacyPath.length - 1],
      points: legacyPath,
      color: '#f6c445',
      lifeDamage: 1
    }],
    timeline: (rawMap.timeline ?? []).map((event) => normalizeTimelineEvent({
      ...event,
      pathId: event.pathId ?? 'main'
    }))
  };
  delete normalized.path;

  validateMap(normalized);
  return normalized;
}

export function validateMap(map) {
  requiredString(map, 'version');
  requiredString(map, 'id');
  requiredString(map, 'name');
  requiredNumber(map, 'width');
  requiredNumber(map, 'height');
  requiredNumber(map, 'initialCost');
  requiredNumber(map, 'maxCost');
  requiredNumber(map, 'maxLives');
  requiredNumber(map, 'totalWaves');

  if (map.version !== '2.0') {
    throw new Error(`Map ${map.id} must be normalized to version 2.0`);
  }

  if (!Array.isArray(map.grid) || map.grid.length !== map.height) {
    throw new Error(`Map ${map.id} grid height does not match height`);
  }

  map.grid.forEach((row, y) => {
    if (!Array.isArray(row) || row.length !== map.width) {
      throw new Error(`Map ${map.id} grid row ${y} width does not match width`);
    }
    row.forEach((cellType, x) => {
      if (!VALID_CELL_TYPES.has(cellType)) {
        throw new Error(`Map ${map.id} has invalid cell type ${cellType} at ${x},${y}`);
      }
    });
  });

  if (!Array.isArray(map.paths) || map.paths.length === 0) {
    throw new Error(`Map ${map.id} must define at least one path`);
  }

  const pathIds = new Set();
  map.paths.forEach((path) => {
    if (!path.id) {
      throw new Error(`Map ${map.id} has a path without id`);
    }
    if (pathIds.has(path.id)) {
      throw new Error(`Map ${map.id} has duplicate path id ${path.id}`);
    }
    pathIds.add(path.id);

    if (!Array.isArray(path.points) || path.points.length < 2) {
      throw new Error(`Path ${path.id} must contain at least two points`);
    }

    path.points.forEach((point) => {
      if (!isCellInBounds(point, map.width, map.height)) {
        throw new Error(`Path ${path.id} point ${JSON.stringify(point)} is outside grid`);
      }
      if (getCellType(map, point) !== 'path') {
        throw new Error(`Path ${path.id} point ${point.x},${point.y} must be on path terrain`);
      }
    });
  });

  if (!Array.isArray(map.timeline)) {
    throw new Error(`Map ${map.id} timeline must be an array`);
  }

  map.timeline.forEach((event, index) => {
    requiredNumber(event, 'wave', `timeline[${index}]`);
    requiredNumber(event, 'startTime', `timeline[${index}]`);
    requiredString(event, 'enemyType', `timeline[${index}]`);
    requiredNumber(event, 'count', `timeline[${index}]`);
    requiredString(event, 'pathId', `timeline[${index}]`);

    if (!pathIds.has(event.pathId)) {
      throw new Error(`Timeline event ${index} references missing path ${event.pathId}`);
    }
    if (event.count < 1) {
      throw new Error(`Timeline event ${index} count must be positive`);
    }
  });

  return true;
}

export async function loadMap(url, fetcher = fetch) {
  if (cache.has(url)) {
    return cache.get(url);
  }

  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Failed to load map ${url}: ${response.status}`);
  }

  const rawMap = await response.json();
  const map = normalizeMap(rawMap);
  cache.set(url, map);
  return map;
}

export function clearMapCache() {
  cache.clear();
}

function normalizePath(path) {
  const points = path.points ?? [];
  return {
    name: path.name ?? path.id,
    color: path.color ?? '#f6c445',
    lifeDamage: path.lifeDamage ?? 1,
    ...path,
    entry: path.entry ?? points[0],
    exit: path.exit ?? points[points.length - 1],
    points
  };
}

function normalizeTimelineEvent(event) {
  return {
    interval: 0.8,
    ...event
  };
}

function requiredString(target, key, prefix = 'map') {
  if (typeof target?.[key] !== 'string' || target[key].length === 0) {
    throw new Error(`${prefix}.${key} must be a non-empty string`);
  }
}

function requiredNumber(target, key, prefix = 'map') {
  if (typeof target?.[key] !== 'number' || Number.isNaN(target[key])) {
    throw new Error(`${prefix}.${key} must be a number`);
  }
}
