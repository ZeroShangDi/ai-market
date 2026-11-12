import { computed, ref } from 'vue';
import type { AppIdentity, UpdateState, createUpdateService } from './core';

interface UpdateUi {
  toast(message: string): void;
  openDialog(): Promise<void>;
  readSkip(key: string): unknown;
  saveSkip(key: string, version: number): void;
  reportError?(cause: unknown): void;
}

export function createUpdatePresenter(
  service: ReturnType<typeof createUpdateService>,
  identity: () => Promise<AppIdentity>,
  ui: UpdateUi,
  options: { configured: boolean; versionName: string; now?: () => number },
) {
  const state = ref<UpdateState>(service.getState());
  const versionName = ref(options.versionName);
  const dialog = ref<'announcement' | 'progress' | null>(null);
  const now = options.now || Date.now;
  const unsubscribe = service.subscribe(value => { state.value = value; });
  const busy = computed(() => ['checking', 'downloading', 'verifying', 'installing', 'installationRequested'].includes(state.value.status));
  const buttonLabel = computed(() => {
    switch (state.value.status) {
      case 'checking': return '检查中…';
      case 'downloading': case 'verifying': case 'installing': return '查看进度';
      case 'installationRequested': return '查看安装';
      case 'readyToInstall': return '继续安装';
      case 'failed': return state.value.release ? '查看更新' : '重新检查';
      default: return state.value.release ? '更新' : '检查更新';
    }
  });
  let lastCheck: number | undefined;
  let checking: Promise<void> | undefined;
  let updating: Promise<void> | undefined;
  let manualRequested = false;
  const prompted = new Set<string>();
  const skipped = new Set<string>();
  let skipKey: string | undefined;
  let promptToken: string | undefined;

  function showDialog(mode: 'announcement' | 'progress') {
    const alreadyOpen = dialog.value !== null;
    dialog.value = mode;
    if (alreadyOpen) return;
    void ui.openDialog().catch(cause => {
      dialog.value = null;
      if (promptToken) prompted.delete(promptToken);
      ui.reportError?.(cause);
      ui.toast('暂时无法打开更新窗口，请在“我的”中重试');
    });
  }

  function check(manual = false): Promise<void> {
    if (updating) return updating;
    if (dialog.value && state.value.status !== 'installationRequested') return Promise.resolve();
    if (manual) manualRequested = true;
    if (checking) return checking;
    checking = (async () => {
      const app = await identity();
      versionName.value = app.versionName;
      skipKey = `app-update.skipped:${app.appId}:${app.channel}`;
      await service.reconcileInstallation();
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
      const key = skipKey;
      const token = `${key}:${release.versionCode}`;
      let saved: unknown;
      try { saved = ui.readSkip(key); } catch { /* In-memory preference still applies. */ }
      if (saved === release.versionCode || skipped.has(token) || prompted.has(token)) return;
      prompted.add(token);
      promptToken = token;
      showDialog('announcement');
    })().catch(cause => {
      ui.reportError?.(cause);
      const message = cause instanceof Error ? cause.message : '检查更新失败，请重试';
      state.value = { status: 'failed', stage: 'check', retryable: true, message };
      if (manualRequested) ui.toast(message);
    }).finally(() => { checking = undefined; manualRequested = false; });
    return checking;
  }

  function startUpdate(): Promise<void> {
    if (state.value.release) showDialog('progress');
    if (updating) return updating;
    if (busy.value) return Promise.resolve();
    if (state.value.status === 'failed' && state.value.retryable === false) return Promise.resolve();
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
    if (state.value.status === 'checking') return;
    if (state.value.release) {
      showDialog(['available', 'cancelled'].includes(state.value.status) ? 'announcement' : 'progress');
    }
    else await check(true);
  }

  return {
    state, versionName, buttonLabel, busy, dialog, check, startUpdate, action,
    skipVersion: () => {
      if (!skipKey || !state.value.release) return;
      const code = state.value.release.versionCode;
      skipped.add(`${skipKey}:${code}`);
      try { ui.saveSkip(skipKey, code); } catch { /* Keep this session’s choice. */ }
    },
    dialogClosed: () => { dialog.value = null; promptToken = undefined; },
    cancel: () => service.cancel(), dispose: unsubscribe,
  };
}
