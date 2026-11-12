/** Framework- and application-independent pet lifecycle. Native resources belong to the adapter. */
export type PetEvent = { type: string; code?: string; message?: string; visible?: boolean };
export interface PetAdapter {
  permission(): boolean | null;
  status(): Promise<boolean>;
  show(text: string): Promise<void>;
  hide(): Promise<void>;
  setText(text: string): Promise<void>;
  openSettings(): Promise<void>;
  subscribe(listener: (event: PetEvent) => void): () => void;
  dispose(): Promise<void>;
}
export type PetState = { enabled: boolean; visible: boolean; permission: boolean | null; message: string; status: string };
export const initialPetState = (): PetState => ({ enabled: false, visible: false, permission: null, message: '', status: '' });
export function createPetController(adapter: PetAdapter, storage: { read(): boolean; write(enabled: boolean): void }, state = initialPetState()) {
  let initialized = false, disposed = false, revision = 0, preferenceWarning = '';
  let operation: Promise<void> = Promise.resolve(), refreshing: Promise<void> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined, unsubscribe: (() => void) | undefined;
  const observers = new Set<() => void>();
  const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
  function notify() { observers.forEach(fn => { try { fn(); } catch { /* Isolate host observers. */ } }); }
  function enqueue(action: () => Promise<void>) { operation = operation.then(action, action); return operation; }
  function stopTicker() { if (ticker) clearInterval(ticker); ticker = undefined; }
  function save(enabled: boolean) {
    try { storage.write(enabled); preferenceWarning = ''; }
    catch { preferenceWarning = '桌宠开关未能保存，重启应用后可能恢复原设置'; }
  }
  function listen() {
    if (unsubscribe) return;
    unsubscribe = adapter.subscribe(event => {
      if (disposed) return;
      if (event.type === 'closed' || event.type === 'lost') {
        revision++; state.visible = false; stopTicker();
        if (event.type === 'closed') { state.enabled = false; save(false); }
        state.message = event.message || preferenceWarning;
      } else if (event.type === 'error') state.message = event.message || '桌宠操作失败';
      notify();
    });
  }
  async function reconcile() {
    if (disposed) return;
    const current = revision;
    const stale = () => disposed || current !== revision;
    try {
      listen();
      state.permission = adapter.permission();
      if (!state.enabled || state.permission !== true) {
        stopTicker(); state.visible = false;
        await adapter.hide();
        if (stale()) return;
        state.message = !state.enabled ? preferenceWarning : state.permission === false
          ? '请允许显示在其他应用上层' : '无法读取悬浮窗权限，请重新检查运行环境';
      } else {
        const visible = await adapter.status();
        if (stale()) return;
        if (!visible) { state.visible = false; await adapter.show(state.status); }
        if (stale()) return;
        // The adapter resolves show only after the native view is actually attached.
        state.visible = true; state.message = preferenceWarning;
        if (!ticker) ticker = setInterval(() => { void refresh(); }, 5000);
      }
    } catch (e) {
      if (stale()) return;
      state.visible = false; state.message = messageOf(e); stopTicker();
      // Cleanup failures remain visible to the user. Never mark an unknown window as running.
      try { await adapter.hide(); } catch (cleanup) { state.message += '；' + messageOf(cleanup); }
    }
    if (!stale()) notify();
  }
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (!initialized) {
      initialized = true;
      try { state.enabled = storage.read() === true; } catch { state.enabled = false; }
    }
    if (!refreshing) refreshing = enqueue(reconcile).finally(() => { refreshing = undefined; });
    return refreshing;
  }
  async function setEnabled(enabled: boolean) {
    if (disposed) throw new Error('桌宠模块已释放');
    initialized = true; const current = ++revision; state.enabled = enabled;
    save(enabled);
    if (!enabled) {
      state.visible = false; stopTicker(); notify();
      // Send cancellation now instead of waiting for an in-flight show to attach/time out.
      try { await adapter.hide(); } catch (e) { state.message = messageOf(e); notify(); throw e; }
    }
    // A superseded refresh must complete before reconciling the newest desired state.
    if (refreshing) await refreshing;
    if (disposed || current !== revision) return;
    await refresh();
    if (enabled && current === revision && state.enabled && !disposed) {
      if (state.permission === false) await adapter.openSettings();
      else if (!state.visible) throw new Error(state.message || '桌宠未显示，请重试');
    }
  }
  function setText(text: string): Promise<void> {
    if (disposed) return Promise.resolve();
    if (text.length > 80) return Promise.reject(new Error('桌宠状态文字不能超过 80 字符'));
    state.status = text;
    return enqueue(async () => {
      if (disposed || !state.visible) return;
      try { await adapter.setText(state.status); }
      catch (e) { state.message = messageOf(e); notify(); }
    });
  }
  let disposing: Promise<void> | undefined;
  function dispose(): Promise<void> {
    if (disposing) return disposing;
    disposed = true; revision++; stopTicker(); unsubscribe?.(); unsubscribe = undefined;
    state.visible = false; notify(); observers.clear();
    disposing = adapter.dispose().catch(error => { disposing = undefined; throw error; });
    return disposing;
  }
  function isActive() {
    try { return !disposed && state.enabled && state.visible && adapter.permission() === true; }
    catch { return false; }
  }
  return { state, refresh, setEnabled, setText, dispose, isActive,
    openSettings: () => adapter.openSettings(),
    onChange(fn: () => void) { observers.add(fn); return () => { observers.delete(fn); }; } };
}
