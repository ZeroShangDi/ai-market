import { createUpdateService } from '@/modules/app-update/core';
import { createSignedReleaseSource } from '@/modules/app-update/source';
import { createAndroidUpdateAdapter, verifyReleaseSignature } from '@/modules/app-update/android';
import { createUpdatePresenter } from '@/modules/app-update/presenter';

const url = import.meta.env.VITE_UPDATE_MANIFEST_URL || '';
const origins = (import.meta.env.VITE_UPDATE_DOWNLOAD_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
const lanOrigins = (import.meta.env.VITE_UPDATE_LAN_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
const source = createSignedReleaseSource(url, origins, (payload, signature) =>
  verifyReleaseSignature(import.meta.env.VITE_UPDATE_PUBLIC_KEY || '', payload, signature),
  lanOrigins,
);
const platform = createAndroidUpdateAdapter(import.meta.env.VITE_UPDATE_CHANNEL || 'stable');
export const updates = createUpdateService(source, platform);
export const updatePresenter = createUpdatePresenter(updates, () => platform.identity(), {
  toast: title => uni.showToast({ title, icon: 'none' }),
  confirm: options => uni.showModal({
    title: options.title,
    content: options.content,
    confirmText: '更新',
    cancelText: '跳过',
    success: result => { if (result.confirm) options.update(); else if (result.cancel) options.skip(); },
  }),
  readSkip: key => uni.getStorageSync(key),
  saveSkip: (key, value) => uni.setStorageSync(key, value),
}, { configured: !!url, versionName: __APP_VERSION_NAME__ });
export const checkUpdates = updatePresenter.check;
