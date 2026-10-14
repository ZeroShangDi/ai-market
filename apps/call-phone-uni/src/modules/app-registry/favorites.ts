import { computed } from 'vue';
import { mobileApps } from './index';
import { createFavoritesStore } from './favorites-core';
import { accountPreferenceScope } from '@/services/vault';
import { hasAccessToken, onSessionChange } from '@/api/http';
import { mockEnabled } from '@/config';

const store = createFavoritesStore(mobileApps, {
  get: key => uni.getStorageSync(key),
  set: (key, value) => uni.setStorageSync(key, value),
}, () => mockEnabled ? 'preview-workspace' : hasAccessToken() ? accountPreferenceScope() : '');

export const favoriteState = store.state;
export const favoriteApps = computed(() => favoriteState.ids.flatMap(id => {
  const app = mobileApps.find(app => app.id === id);
  return app ? [app] : [];
}));
export const refreshFavorites = store.refresh;
export const saveFavorites = store.save;
onSessionChange(() => store.refresh());
