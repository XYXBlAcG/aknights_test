import { normalizeMap } from './MapLoader.js';

export const CUSTOM_MAPS_STORAGE_KEY = 'aknights.customMaps.v1';
export const EDITOR_DRAFT_MAP_STORAGE_KEY = 'aknights.editorDraftMap.v1';

export function loadCustomMapLibrary(storage = globalThis.localStorage) {
  if (!storage) {
    return { maps: [], errors: ['localStorage is unavailable'] };
  }

  try {
    const raw = storage.getItem(CUSTOM_MAPS_STORAGE_KEY);
    if (!raw) {
      return { maps: [], errors: [] };
    }
    const parsed = JSON.parse(raw);
    const rawMaps = Array.isArray(parsed?.maps) ? parsed.maps : [];
    const errors = [];
    const maps = rawMaps.flatMap((rawMap, index) => {
      try {
        return [normalizeMap(rawMap)];
      } catch (error) {
        errors.push(`customMaps[${index}]: ${error.message}`);
        return [];
      }
    });
    return { maps, errors };
  } catch (error) {
    return { maps: [], errors: [error.message] };
  }
}

export function saveCustomMapToLibrary(rawMap, storage = globalThis.localStorage) {
  if (!storage) {
    throw new Error('localStorage is unavailable');
  }

  const map = normalizeMap(rawMap);
  const loaded = loadCustomMapLibrary(storage);
  const existingIndex = loaded.maps.findIndex((item) => item.id === map.id);
  const maps = existingIndex >= 0
    ? loaded.maps.map((item, index) => index === existingIndex ? map : item)
    : [...loaded.maps, map];

  storage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify({ version: 1, maps }));
  return { map, maps, errors: loaded.errors };
}

export function deleteCustomMapFromLibrary(mapId, storage = globalThis.localStorage) {
  if (!storage) {
    throw new Error('localStorage is unavailable');
  }

  const loaded = loadCustomMapLibrary(storage);
  const maps = loaded.maps.filter((map) => map.id !== mapId);
  storage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify({ version: 1, maps }));
  return { maps, errors: loaded.errors };
}

export function buildMapLibrary(defaultMaps, customMaps) {
  return [
    ...defaultMaps.map((map) => ({
      key: `default:${map.id}`,
      source: 'default',
      sourceLabel: '默认',
      deletable: false,
      editable: true,
      map
    })),
    ...customMaps.map((map) => ({
      key: `custom:${map.id}`,
      source: 'custom',
      sourceLabel: '导入',
      deletable: true,
      editable: true,
      map
    }))
  ];
}

export function storeEditorDraftMap(rawMap, storage = globalThis.localStorage, metadata = {}) {
  if (!storage) {
    throw new Error('localStorage is unavailable');
  }

  const map = normalizeMap(rawMap);
  storage.setItem(EDITOR_DRAFT_MAP_STORAGE_KEY, JSON.stringify({
    version: 1,
    map,
    metadata
  }));
  return { map, metadata };
}

export function loadEditorDraftMap(storage = globalThis.localStorage) {
  if (!storage) {
    return { map: null, metadata: {}, errors: ['localStorage is unavailable'] };
  }

  try {
    const raw = storage.getItem(EDITOR_DRAFT_MAP_STORAGE_KEY);
    if (!raw) {
      return { map: null, metadata: {}, errors: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      map: normalizeMap(parsed.map),
      metadata: parsed.metadata ?? {},
      errors: []
    };
  } catch (error) {
    return { map: null, metadata: {}, errors: [error.message] };
  }
}

export function clearEditorDraftMap(storage = globalThis.localStorage) {
  if (!storage) {
    return { ok: false, errors: ['localStorage is unavailable'] };
  }
  storage.removeItem(EDITOR_DRAFT_MAP_STORAGE_KEY);
  return { ok: true, errors: [] };
}
