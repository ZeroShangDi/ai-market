import { reactive } from 'vue';

interface FavoriteEntry { id: string; defaultFavorite: boolean }
interface FavoriteStorage { get(key: string): unknown; set(key: string, value: unknown): void }

export function normalizeFavorites(ids: readonly unknown[], apps: readonly FavoriteEntry[]): string[] {
  const allowed = new Set(apps.map(app => app.id));
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && allowed.has(id)))];
}

export function moveFavorite(ids: readonly string[], from: number, to: number): string[] {
  const next = ids.slice();
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function createFavoritesStore(apps: readonly FavoriteEntry[], storage: FavoriteStorage, currentScope: () => string) {
  const defaults = () => apps.filter(app => app.defaultFavorite).map(app => app.id);
  const keyFor = (scope: string) => 'tongzige.favorites.v1:' + scope;
  const state = reactive({ scope: '', ids: defaults(), error: '' });
  function refresh() {
    const scope = currentScope();
    state.scope = scope;
    state.error = '';
    state.ids = defaults();
    if (!scope) return;
    try {
      const record = storage.get(keyFor(scope));
      if (record === '' || record == null) return;
      if (typeof record !== 'object' || (record as any).version !== 1 || !Array.isArray((record as any).ids)) throw new Error('invalid preferences');
      state.ids = normalizeFavorites((record as any).ids, apps);
    } catch {
      state.error = '常用设置读取失败，请重试';
    }
  }
  function save(ids: readonly string[], expectedScope: string) {
    const scope = currentScope();
    if (!scope || scope !== expectedScope || scope !== state.scope) throw new Error('账户或工作空间已变化，请重新打开管理页');
    if (state.error) throw new Error(state.error);
    const next = normalizeFavorites(ids, apps);
    try { storage.set(keyFor(scope), { version: 1, ids: next }); }
    catch { throw new Error('常用设置保存失败，请重试'); }
    state.ids = next;
  }
  return { state, refresh, save };
}
