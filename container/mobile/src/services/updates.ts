import { createUpdateService } from '@/modules/app-update/core';
import { createSignedReleaseSource } from '@/modules/app-update/source';
import { createAndroidUpdateAdapter, verifyReleaseSignature } from '@/modules/app-update/android';
import { createUpdatePresenter } from '@/modules/app-update/presenter';
import { logger } from './logger';

const url = import.meta.env.VITE_UPDATE_MANIFEST_URL || '';
const origins = (import.meta.env.VITE_UPDATE_DOWNLOAD_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
const lanOrigins = (import.meta.env.VITE_UPDATE_LAN_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
const source = createSignedReleaseSource(url, origins, (payload, signature) =>
  verifyReleaseSignature(import.meta.env.VITE_UPDATE_PUBLIC_KEY || '', payload, signature),
  lanOrigins,
);
const platform = createAndroidUpdateAdapter(import.meta.env.VITE_UPDATE_CHANNEL || 'stable');
export const updates = createUpdateService(source, platform);
let lastStatus = '';
updates.subscribe(state => {
  if (lastStatus === state.status) return;
  lastStatus = state.status;
  logger[state.status === 'failed' ? 'error' : 'info']('update', 'state.changed', {
    status: state.status, stage: state.stage, reason: state.message, version: state.release?.versionName,
  });
});
export const updatePresenter = createUpdatePresenter(updates, () => platform.identity(), {
  reportError: error => logger.error('update', 'check.failed', { error }),
  toast: title => { logger.info('update', 'notice', { reason: title }); uni.showToast({ title, icon: 'none' }); },
  openDialog: () => new Promise<void>((resolve, reject) => uni.navigateTo({
    url: '/pages/app-update/index', animationType: 'fade-in', animationDuration: 180,
    success: () => resolve(), fail: reject,
  })),
  readSkip: key => uni.getStorageSync(key),
  saveSkip: (key, value) => uni.setStorageSync(key, value),
}, { configured: !!url, versionName: __APP_VERSION_NAME__ });
export const checkUpdates = updatePresenter.check;
