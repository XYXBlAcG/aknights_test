import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMapLibrary,
  clearEditorDraftMap,
  deleteCustomMapFromLibrary,
  loadCustomMapLibrary,
  loadEditorDraftMap,
  saveCustomMapToLibrary,
  storeEditorDraftMap
} from '../src/data/MapLibraryStore.js';

test('custom map library saves normalized maps and upserts by id', () => {
  const storage = createStorage();
  const rawMap = legacyMap({ id: 'custom-a', name: '作战记录 A' });

  const first = saveCustomMapToLibrary(rawMap, storage);
  const second = saveCustomMapToLibrary({
    ...rawMap,
    name: '作战记录 A 改'
  }, storage);
  const loaded = loadCustomMapLibrary(storage);

  assert.equal(first.map.version, '2.0');
  assert.equal(second.maps.length, 1);
  assert.equal(loaded.errors.length, 0);
  assert.equal(loaded.maps.length, 1);
  assert.equal(loaded.maps[0].name, '作战记录 A 改');
});

test('custom map library deletes imported maps without touching defaults', () => {
  const storage = createStorage();
  saveCustomMapToLibrary(legacyMap({ id: 'custom-a', name: 'A' }), storage);
  saveCustomMapToLibrary(legacyMap({ id: 'custom-b', name: 'B' }), storage);

  const result = deleteCustomMapFromLibrary('custom-a', storage);
  const library = buildMapLibrary(
    [legacyMap({ id: 'training-ground', name: '默认地图' })],
    result.maps
  );

  assert.deepEqual(result.maps.map((map) => map.id), ['custom-b']);
  assert.deepEqual(library.map((entry) => ({
    id: entry.map.id,
    source: entry.source,
    deletable: entry.deletable
  })), [
    { id: 'training-ground', source: 'default', deletable: false },
    { id: 'custom-b', source: 'custom', deletable: true }
  ]);
});

test('editor draft handoff persists the map selected for editing', () => {
  const storage = createStorage();
  const map = legacyMap({ id: 'custom-edit', name: '待编辑地图' });

  storeEditorDraftMap(map, storage, { source: 'custom' });
  const draft = loadEditorDraftMap(storage);

  assert.equal(draft.errors.length, 0);
  assert.equal(draft.map.id, 'custom-edit');
  assert.equal(draft.map.version, '2.0');
  assert.deepEqual(draft.metadata, { source: 'custom' });
});

test('editor draft handoff can be cleared after the editor consumes it', () => {
  const storage = createStorage();
  storeEditorDraftMap(legacyMap({ id: 'custom-edit', name: '待编辑地图' }), storage);

  clearEditorDraftMap(storage);
  const draft = loadEditorDraftMap(storage);

  assert.equal(draft.map, null);
  assert.deepEqual(draft.errors, []);
});

test('custom map library reports malformed storage without throwing', () => {
  const storage = createStorage();
  storage.setItem('aknights.customMaps.v1', '{"maps":');

  const result = loadCustomMapLibrary(storage);

  assert.deepEqual(result.maps, []);
  assert.equal(result.errors.length, 1);
});

function legacyMap({ id, name }) {
  return {
    version: '1.0',
    id,
    name,
    width: 2,
    height: 1,
    initialCost: 15,
    maxCost: 30,
    maxLives: 5,
    totalWaves: 1,
    grid: [['path', 'path']],
    path: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    timeline: [{ wave: 1, startTime: 0, enemyType: 'infantry', count: 1 }]
  };
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
