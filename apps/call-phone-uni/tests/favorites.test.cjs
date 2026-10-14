const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const exportsForTest = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/modules/app-registry/favorites-core.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(code, { exports: exportsForTest, require: key => key === 'vue' ? vue : undefined, Set, Array, Number, Error });
const { createFavoritesStore, moveFavorite, normalizeFavorites } = exportsForTest;
const entries = [{ id: 'ai', defaultFavorite: true }, { id: 'dialer', defaultFavorite: true }, { id: 'new-app', defaultFavorite: false }];
function harness() {
  const records = new Map();
  let scope = 'server/workspace/user-a', failWrite = false, failRead = false;
  const store = createFavoritesStore(entries, {
    get(key) { if (failRead) throw Error('read failed'); return records.get(key); },
    set(key, value) { if (failWrite) throw Error('write failed'); records.set(key, JSON.parse(JSON.stringify(value))); },
  }, () => scope);
  const changeScope = value => { scope = value; store.refresh(); };
  store.refresh();
  return { ...store, records, changeScope, setWriteFailure: value => { failWrite = value; }, setReadFailure: value => { failRead = value; } };
}
const ids = h => Array.from(h.state.ids);

test('defaults apply only on first use, deliberate empty favorites survive reload and restart', () => {
  const h = harness();
  assert.deepEqual(ids(h), ['ai', 'dialer']);
  h.save([], h.state.scope);
  h.refresh();
  assert.deepEqual(ids(h), []);
  const again = createFavoritesStore(entries, { get: key => h.records.get(key), set() {} }, () => h.state.scope);
  again.refresh();
  assert.deepEqual(ids(again), []);
});

test('explicit order is preserved and new apps are not automatically added', () => {
  const h = harness();
  h.save(['dialer', 'ai'], h.state.scope);
  h.refresh();
  assert.deepEqual(ids(h), ['dialer', 'ai']);
  assert.ok(!h.state.ids.includes('new-app'));
});

test('accounts and workspaces have independent preferences and stale editors cannot overwrite another identity', () => {
  const h = harness();
  const userA = h.state.scope;
  h.save(['dialer'], userA);
  h.changeScope('server/workspace/user-b');
  assert.deepEqual(ids(h), ['ai', 'dialer']);
  assert.throws(() => h.save(['ai'], userA), /已变化/);
  h.save([], h.state.scope);
  h.changeScope('server/another-workspace/user-a');
  assert.deepEqual(ids(h), ['ai', 'dialer']);
  h.changeScope(userA);
  assert.deepEqual(ids(h), ['dialer']);
  h.changeScope('');
  assert.deepEqual(ids(h), ['ai', 'dialer']);
  assert.throws(() => h.save([], ''), /已变化/);
});

test('failed reads or writes never publish unsaved preferences', () => {
  const h = harness();
  h.setWriteFailure(true);
  assert.throws(() => h.save([], h.state.scope), /保存失败/);
  assert.deepEqual(ids(h), ['ai', 'dialer']);
  assert.equal(h.records.size, 0);
  h.setReadFailure(true); h.refresh();
  assert.match(h.state.error, /读取失败/);
  assert.throws(() => h.save([], h.state.scope), /读取失败/);
  h.setReadFailure(false); h.setWriteFailure(false); h.refresh();
  h.save(['dialer'], h.state.scope);
  assert.deepEqual(ids(h), ['dialer']);
});

test('invalid records fail visibly; removed and duplicate app IDs are safely filtered', () => {
  const h = harness();
  const key = 'tongzige.favorites.v1:' + h.state.scope;
  h.records.set(key, { version: 2, ids: ['ai'] }); h.refresh();
  assert.match(h.state.error, /读取失败/);
  h.records.set(key, { version: 1, ids: ['dialer', 'deleted', 'dialer', 'ai', null] }); h.refresh();
  assert.deepEqual(ids(h), ['dialer', 'ai']);
  assert.equal(h.state.error, '');
});

test('reordering leaves input unchanged and ignores invalid positions', () => {
  const draft = ['ai', 'dialer', 'new-app'];
  assert.deepEqual(Array.from(moveFavorite(draft, 0, 2)), ['dialer', 'new-app', 'ai']);
  assert.deepEqual(Array.from(moveFavorite(draft, 2, 0)), ['new-app', 'ai', 'dialer']);
  for (const pair of [[-1, 0], [0, 3], [0.5, 1], [1, NaN]]) assert.deepEqual(Array.from(moveFavorite(draft, ...pair)), draft);
  assert.deepEqual(draft, ['ai', 'dialer', 'new-app']);
  assert.deepEqual(Array.from(normalizeFavorites(['unknown', 'ai', 'ai', 1], entries)), ['ai']);
});
