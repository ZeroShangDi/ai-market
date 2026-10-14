import { computed, ref } from 'vue';
import type { AppIdentity, UpdateState, createUpdateService } from './core';

interface UpdateUi {
  toast(message: string): void;
  confirm(options: { title: string; content: string; update(): void; skip(): void }): void;
  readSkip(key: string): unknown;
  saveSkip(key: string, version: number): void;
}

export function createUpdatePresenter(
  service: ReturnType<typeof createUpdateService>,
  identity: () => Promise<AppIdentity>,
  ui: UpdateUi,
  options: { configured: boolean; versionName: string; now?: () => number },
) {
  const state = ref<UpdateState>(service.getState());
  const versionName = ref(options.versionName);
  const now = options.now || Date.now;
  const unsubscribe = service.subscribe(value => { state.value = value; });
  const busy = computed(() => ['checking', 'downloading', 'verifying', 'installing', 'installationRequested'].includes(state.value.status));
  const buttonLabel = computed(() => {
    switch (state.value.status) {
      case 'checking': return '检查中…';
      case 'downloading': return `下载中 ${state.value.progress || 0}%`;
      case 'verifying': return '校验中…';
      case 'installing': case 'installationRequested': return '安装中…';
      default: return state.value.release ? '更新' : '检查更新';
    }
  });
  let lastCheck: number | undefined;
  let checking: Promise<void> | undefined;
  let updating: Promise<void> | undefined;
  let manualRequested = false;
  const prompted = new Set<string>();
  const skipped = new Set<string>();

  function check(manual = false): Promise<void> {
    if (updating) return updating;
    if (manual) manualRequested = true;
    if (checking) return checking;
    checking = (async () => {
      let app: AppIdentity;
      try {
        app = await identity();
        versionName.value = app.versionName;
        await service.reconcileInstallation();
      } catch (cause) {
        if (manualRequested) ui.toast(cause instanceof Error ? cause.message : '暂时无法读取应用版本');
        return;
      }
      if (!manualRequested && lastCheck !== undefined && now() - lastCheck < 60 * 60 * 1000) return;
      if (!options.configured && !manualRequested) return;
      await service.check();
      const current = service.getState();
      if (current.status === 'upToDate' || current.status === 'available') lastCheck = now();
      if (manualRequested) {
        if (current.status === 'upToDate') ui.toast('已经是最新版本');
        else if (current.status === 'failed') ui.toast(current.message || '检查更新失败，请重试');
        return;
      }
      if (current.status !== 'available' || !current.release) return;
      const release = current.release;
      const key = `app-update.skipped:${app.appId}:${app.channel}`;
      const token = `${key}:${release.versionCode}`;
      let saved: unknown;
      try { saved = ui.readSkip(key); } catch { /* In-memory preference still applies. */ }
      if (saved === release.versionCode || skipped.has(token) || prompted.has(token)) return;
      prompted.add(token);
      ui.confirm({
        title: `发现新版本 ${release.versionName}`,
        content: release.notes || '优化使用体验，修复已知问题。',
        update: () => { void startUpdate(); },
        skip: () => {
          skipped.add(token);
          try { ui.saveSkip(key, release.versionCode); } catch { /* Keep this session’s choice. */ }
        },
      });
    })().finally(() => { checking = undefined; manualRequested = false; });
    return checking;
  }

  function startUpdate(): Promise<void> {
    if (updating) return updating;
    if (busy.value) return Promise.resolve();
    updating = (async () => {
      if (!service.getState().release) return;
      if (!['readyToInstall', 'installationRequested'].includes(service.getState().status)) await service.download();
      if (service.getState().status === 'readyToInstall' ||
          (service.getState().status === 'failed' && service.getState().stage === 'install')) {
        await service.install();
      }
      const current = service.getState();
      if (current.status === 'failed') ui.toast(current.message || '更新失败，请重试');
    })().finally(() => { updating = undefined; });
    return updating;
  }

  async function action() {
    if (busy.value) return;
    if (state.value.release) await startUpdate();
    else await check(true);
  }

  return {
    state, versionName, buttonLabel, busy, check, startUpdate, action,
    cancel: () => service.cancel(), dispose: unsubscribe,
  };
}
