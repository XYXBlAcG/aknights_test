export function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isSameCell(a, b) {
  return a?.x === b?.x && a?.y === b?.y;
}

export function isCellInBounds(cell, width, height) {
  return Number.isInteger(cell?.x)
    && Number.isInteger(cell?.y)
    && cell.x >= 0
    && cell.y >= 0
    && cell.x < width
    && cell.y < height;
}

export function getCellType(map, cell) {
  if (!isCellInBounds(cell, map.width, map.height)) {
    return null;
  }
  return map.grid[cell.y]?.[cell.x] ?? null;
}

export function isCellInDiamondRange(origin, target, radius) {
  return manhattanDistance(origin, target) <= radius;
}

export function gridToPixel(cell, tileSize) {
  return {
    x: cell.x * tileSize,
    y: cell.y * tileSize
  };
}

export function gridToCenter(cell, tileSize) {
  return {
    x: cell.x * tileSize + tileSize / 2,
    y: cell.y * tileSize + tileSize / 2
  };
}

export function pixelToGrid(point, tileSize) {
  return {
    x: Math.floor(point.x / tileSize),
    y: Math.floor(point.y / tileSize)
  };
}

export function pathLength(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0;
  }

  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += manhattanDistance(points[index - 1], points[index]);
  }
  return length;
}

export function pathPositionAtDistance(points, distance) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      x: 0,
      y: 0,
      cell: { x: 0, y: 0 },
      segmentIndex: 0,
      complete: true
    };
  }

  if (points.length === 1 || distance <= 0) {
    const start = points[0];
    return {
      x: start.x,
      y: start.y,
      cell: { x: start.x, y: start.y },
      segmentIndex: 0,
      complete: false
    };
  }

  let remaining = distance;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const segmentLength = manhattanDistance(from, to);

    if (segmentLength === 0) {
      continue;
    }

    if (remaining <= segmentLength) {
      const progress = remaining / segmentLength;
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      return {
        x,
        y,
        cell: { x: Math.round(x), y: Math.round(y) },
        segmentIndex: index - 1,
        complete: false
      };
    }

    remaining -= segmentLength;
  }

  const end = points[points.length - 1];
  return {
    x: end.x,
    y: end.y,
    cell: { x: end.x, y: end.y },
    segmentIndex: Math.max(0, points.length - 2),
    complete: true
  };
}
