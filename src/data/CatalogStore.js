import {
  normalizeEnemyTemplate,
  normalizeOperatorTemplate,
  validateCustomCatalogs
} from './CatalogValidators.js';

export const CUSTOM_CATALOG_STORAGE_KEY = 'aknights.customCatalogs.v1';

export function emptyCustomCatalogs() {
  return {
    version: 1,
    operators: {},
    enemies: {}
  };
}

export function loadCustomCatalogs(storage = globalThis.localStorage) {
  if (!storage) {
    return { data: emptyCustomCatalogs(), errors: [] };
  }

  try {
    const raw = storage.getItem(CUSTOM_CATALOG_STORAGE_KEY);
    if (!raw) {
      return { data: emptyCustomCatalogs(), errors: [] };
    }
    const parsed = JSON.parse(raw);
    return normalizeCustomCatalogs(parsed);
  } catch (error) {
    return {
      data: emptyCustomCatalogs(),
      errors: [`Custom catalog load failed: ${error.message}`]
    };
  }
}

export function saveCustomCatalogs(data, storage = globalThis.localStorage) {
  if (!storage) {
    return { ok: false, errors: ['localStorage is unavailable'] };
  }
  const normalized = normalizeCustomCatalogs(data);
  if (normalized.errors.length > 0) {
    return { ok: false, errors: normalized.errors };
  }
  storage.setItem(CUSTOM_CATALOG_STORAGE_KEY, `${JSON.stringify(normalized.data, null, 2)}\n`);
  return { ok: true, errors: [] };
}

export function mergeCatalogs(defaultOperators, defaultEnemies, customData = emptyCustomCatalogs()) {
  const normalized = normalizeCustomCatalogs(customData);
  return {
    operatorCatalog: {
      ...clone(defaultOperators),
      ...normalized.data.operators
    },
    enemyCatalog: {
      ...clone(defaultEnemies),
      ...normalized.data.enemies
    },
    errors: normalized.errors
  };
}

export function normalizeCustomCatalogs(data) {
  const result = emptyCustomCatalogs();
  const errors = [];
  const source = data && typeof data === 'object' ? data : emptyCustomCatalogs();

  Object.entries(source.operators ?? {}).forEach(([key, template]) => {
    try {
      const normalized = normalizeOperatorTemplate({ ...template, id: template?.id ?? key });
      result.operators[normalized.id] = normalized;
    } catch (error) {
      errors.push(`operator ${key}: ${error.message}`);
    }
  });

  Object.entries(source.enemies ?? {}).forEach(([key, template]) => {
    try {
      const normalized = normalizeEnemyTemplate({ ...template, id: template?.id ?? key });
      result.enemies[normalized.id] = normalized;
    } catch (error) {
      errors.push(`enemy ${key}: ${error.message}`);
    }
  });

  const validation = validateCustomCatalogs(result);
  errors.push(...validation.errors);

  return {
    data: result,
    errors
  };
}

function clone(value) {
  return structuredClone(value);
}

