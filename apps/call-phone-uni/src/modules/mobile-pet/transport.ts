import type { PetAdapter, PetEvent } from './controller';
export interface NativeBridge {
  getApiVersion(): number;
  getPermission(): number;
  execute(command: string, payload: string, callback: (result: string) => void): void;
  onOverlayEvent(callback: (event: string) => void): void;
  offOverlayEvent(): void;
}
export type NativeResult = { ok: boolean; code: string; message: string; visible: boolean };
const unavailable = () => new Error('桌宠原生插件未就绪，请使用包含桌宠插件的自定义基座或安装包');
export function createNativePetAdapter(getBridge: () => NativeBridge, appearance: () => Record<string, unknown>): PetAdapter {
  const listeners = new Set<(event: PetEvent) => void>();
  let subscribed = false, disposed = false;
  function bridge() {
    const value = getBridge();
    try {
      if (!value || typeof value.getApiVersion !== 'function' || value.getApiVersion() !== 2) throw unavailable();
    } catch { throw unavailable(); }
    return value;
  }
  function invoke(command: string, payload: object = {}): Promise<NativeResult> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, result?: NativeResult) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        error ? reject(error) : resolve(result!);
      };
      const timer = setTimeout(() => {
        finish(new Error('桌宠操作超时，请返回应用重试'));
        // Native also has an attachment deadline. This covers a lost bridge callback.
        if (command === 'show') { try { bridge().execute('hide', '{}', () => {}); } catch { /* Report timeout. */ } }
      }, 8000);
      try {
        bridge().execute(command, JSON.stringify(payload), value => {
          if (settled) return;
          try {
            const result = JSON.parse(value) as NativeResult;
            if (typeof result.ok !== 'boolean' || typeof result.visible !== 'boolean') throw new Error('桌宠返回了无效状态');
            if (!result.ok) throw new Error(result.message || result.code || '桌宠操作失败');
            finish(undefined, result);
          } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); }
        });
      } catch { finish(unavailable()); }
    });
  }
  function ensureSubscription() {
    if (subscribed) return;
    bridge().onOverlayEvent(value => {
      try {
        const event = JSON.parse(value) as PetEvent;
        if (!disposed && ['closed', 'lost', 'error', 'voice'].includes(event.type)) {
          listeners.forEach(fn => { try { fn(event); } catch { /* Isolate subscribers. */ } });
        }
      } catch { /* Ignore malformed events; status polling independently verifies the window. */ }
    });
    subscribed = true;
  }
  return {
    permission() {
      const result = bridge().getPermission();
      return result === 1 ? true : result === 0 ? false : null;
    },
    async status() { return (await invoke('status')).visible; },
    async show(text) {
      if (disposed) throw new Error('桌宠模块已释放');
      ensureSubscription();
      const result = await invoke('show', { ...appearance(), version: 1, text });
      if (!result.visible) throw new Error('悬浮窗尚未显示，请重试');
    },
    async hide() {
      // An absent plugin cannot own a window. This keeps disabled/H5 startup quiet.
      try { bridge(); } catch { return; }
      if ((await invoke('hide')).visible) throw new Error('悬浮窗尚未关闭，请重试');
    },
    async setText(text) { await invoke('text', { text }); },
    async openSettings() { await invoke('settings'); },
    subscribe(fn) {
      listeners.add(fn);
      // Registration is deferred until show so unavailable platforms can stay disabled.
      return () => { listeners.delete(fn); };
    },
    async dispose() {
      disposed = true; listeners.clear();
      try { bridge(); } catch { return; }
      try { if ((await invoke('dispose')).visible) throw new Error('悬浮窗尚未释放，请重试'); }
      finally { if (subscribed) bridge().offOverlayEvent(); subscribed = false; }
    },
  };
}
