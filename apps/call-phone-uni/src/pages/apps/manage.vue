<template>
  <view class="page">
    <view class="wrap">
      <MobileHeader title="管理常用" back-icon-name="chevron-left" back-fallback="/pages/apps/index" :intercept-back="true" action-text="完成" :action-disabled="saving || !!favoriteState.error || !scope" @back="requestLeave" @action="finish" />
      <PreviewBanner />
      <view class="content">
        <view class="section-heading"><text class="section-title">我的常用</text><text class="hint">长按拖动排序</text></view>
        <view class="favorites-card">
          <view v-if="draft.length" class="favorite-grid">
            <view v-for="(app, index) in selectedApps" :key="app.id" class="favorite-item" :class="{ dragging: draggingId === app.id }" @touchstart="rememberTouch" @longpress="startDrag(app.id)" @touchmove.stop.prevent="moveDrag" @touchend="endDrag" @touchcancel="cancelDrag">
              <view class="favorite-tile" role="button" :aria-label="`调整${app.name}顺序`" @tap="openSort(index)">
                <view class="favorite-icon"><AppAsset :name="app.iconAsset" class="tile-asset"><template #fallback><AppIcon :name="app.icon" :size="52" /></template></AppAsset></view>
                <text class="favorite-name">{{ app.name }}</text>
              </view>
              <view class="remove" role="button" :aria-label="`移除${app.name}`" @tap.stop="remove(app.id)"><text aria-hidden="true">−</text></view>
            </view>
          </view>
          <view v-else class="favorites-empty">从下方添加常用应用</view>
        </view>
        <view v-if="favoriteState.error" class="storage-error" role="button" @tap="reload">{{ favoriteState.error }}</view>
        <view v-else-if="!scope" class="storage-error" role="button" @tap="reload">账户状态已变化，点击重新加载</view>

        <view class="section-heading add-heading"><text class="section-title">添加应用</text></view>
        <view class="app-grid">
          <view v-for="app in mobileApps" :key="app.id" class="app-card" :class="{ added: draft.includes(app.id) }" role="button" :aria-label="`${draft.includes(app.id) ? '已添加' : '添加'}${app.name}`" @tap="add(app.id)">
            <view class="app-icon"><AppAsset :name="app.iconAsset" class="card-asset"><template #fallback><AppIcon :name="app.icon" :size="40" /></template></AppAsset></view>
            <view class="app-copy"><text class="app-name">{{ app.name }}</text><text class="app-description">{{ app.summary }}</text></view>
            <view class="add-state"><text v-if="draft.includes(app.id)">已添加</text><AppIcon v-else name="add" :size="18" color="#294fdb" /></view>
          </view>
        </view>
      </view>
    </view>
    <view v-if="draggedApp && draggingId" class="drag-ghost" :style="{ left: `${pointer.x - 26}px`, top: `${pointer.y - 26}px` }"><AppIcon :name="draggedApp.icon" :size="52" /></view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onUnmounted, ref } from 'vue';
import { onBackPress, onShow } from '@dcloudio/uni-app';
import MobileHeader from '@/components/MobileHeader.vue';
import PreviewBanner from '@/components/PreviewBanner.vue';
import AppIcon from '@/components/AppIcon.vue';
import AppAsset from '@/modules/assets/AppAsset.vue';
import { mobileApps } from '@/modules/app-registry';
import { favoriteState, refreshFavorites, saveFavorites } from '@/modules/app-registry/favorites';
import { moveFavorite } from '@/modules/app-registry/favorites-core';
import { onSessionChange } from '@/api/http';
import { ensureSession } from '@/services/session';
import { hasUnfinishedCall } from '@/services/calls';
import { toast } from '@/ui/format';

const draft = ref<string[]>([]), original = ref<string[]>([]), scope = ref('');
const saving = ref(false);
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(original.value));
const selectedApps = computed(() => draft.value.flatMap(id => { const app = mobileApps.find(app => app.id === id); return app ? [app] : []; }));
const instance = getCurrentInstance();
const draggingId = ref('');
const pointer = ref({ x: 0, y: 0 });
const draggedApp = computed(() => mobileApps.find(app => app.id === draggingId.value));
interface Bounds { left: number; top: number; width: number; height: number }
interface TouchEventLike { touches?: ArrayLike<{ clientX: number; clientY: number }> }
let cells: Bounds[] = [], beforeDrag: string[] = [], suppressTapUntil = 0;
let initialized = false, leaving = false, promptOpen = false, disposed = false;
let editGeneration = 0;

function reload() {
  cancelDrag();
  refreshFavorites();
  scope.value = favoriteState.scope;
  original.value = favoriteState.ids.slice();
  draft.value = original.value.slice();
  initialized = true;
  ++editGeneration;
}
function add(id: string) { if (!draft.value.includes(id)) draft.value.push(id); }
function remove(id: string) { if (!draggingId.value) draft.value = draft.value.filter(item => item !== id); }
function rememberTouch(event: TouchEventLike) {
  const point = event.touches?.[0];
  if (point) pointer.value = { x: point.clientX, y: point.clientY };
}
function startDrag(id: string) {
  if (!instance?.proxy || !draft.value.includes(id) || draft.value.length < 2) return;
  const generation = editGeneration;
  beforeDrag = draft.value.slice();
  draggingId.value = id;
  suppressTapUntil = Date.now() + 600;
  uni.createSelectorQuery().in(instance.proxy).selectAll('.favorite-item').boundingClientRect(rects => {
    if (generation !== editGeneration || draggingId.value !== id) return;
    cells = Array.isArray(rects) ? rects as Bounds[] : [];
  }).exec();
}
function moveDrag(event: TouchEventLike) {
  if (!draggingId.value) return;
  rememberTouch(event);
  const { x, y } = pointer.value;
  const target = cells.findIndex(cell => x >= cell.left && x <= cell.left + cell.width && y >= cell.top && y <= cell.top + cell.height);
  const current = draft.value.indexOf(draggingId.value);
  if (target >= 0 && target !== current) draft.value = moveFavorite(draft.value, current, target);
}
function endDrag() {
  if (draggingId.value) suppressTapUntil = Date.now() + 600;
  draggingId.value = ''; cells = []; beforeDrag = [];
}
function cancelDrag() {
  if (draggingId.value) draft.value = beforeDrag.slice();
  endDrag();
}
function openSort(index: number) {
  if (draggingId.value || Date.now() < suppressTapUntil) return;
  const app = selectedApps.value[index];
  if (!app) return;
  const actions: { label: string; run(): void }[] = [];
  if (index > 0) actions.push({ label: '向前移', run: () => { draft.value = moveFavorite(draft.value, index, index - 1); } });
  if (index < draft.value.length - 1) actions.push({ label: '向后移', run: () => { draft.value = moveFavorite(draft.value, index, index + 1); } });
  actions.push({ label: '移除常用', run: () => remove(app.id) });
  const generation = editGeneration;
  uni.showActionSheet({ itemList: actions.map(action => action.label), success: result => { if (!disposed && generation === editGeneration) actions[result.tapIndex]?.run(); } });
}
function canLeave() {
  if (!hasUnfinishedCall()) return true;
  toast('请先完成当前通话并保存结果'); return false;
}
function leave() {
  if (!canLeave()) return;
  leaving = true;
  uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/apps/index', fail: () => { leaving = false; } }) });
}
function finish() {
  if (saving.value || !canLeave()) return;
  if (!dirty.value) { leave(); return; }
  saving.value = true;
  try {
    saveFavorites(draft.value, scope.value);
    original.value = draft.value.slice();
    toast('常用应用已更新');
    leave();
  } catch (error) { toast((error as Error).message); }
  finally { saving.value = false; }
}
function requestLeave() {
  if (!canLeave() || saving.value || promptOpen) return;
  cancelDrag();
  if (!dirty.value) { leave(); return; }
  promptOpen = true;
  const generation = editGeneration;
  uni.showModal({ title: '保存常用设置？', content: '你调整了常用应用，是否保存？', confirmText: '保存', cancelText: '放弃修改', success: result => {
    if (disposed || generation !== editGeneration) return;
    if (result.confirm) finish();
    else if (result.cancel) leave();
  }, complete: () => { promptOpen = false; } });
}
const stopSession = onSessionChange(() => { cancelDrag(); initialized = false; scope.value = ''; draft.value = []; original.value = []; ++editGeneration; });
onShow(() => {
  if (!ensureSession()) return;
  refreshFavorites();
  if (!initialized || scope.value !== favoriteState.scope) reload();
});
onBackPress(() => { if (leaving) return false; requestLeave(); return true; });
onUnmounted(() => { disposed = true; ++editGeneration; stopSession(); });
</script>

<style scoped lang="scss">
.page { min-height: 100vh; background: #f7f8fc; padding-bottom: calc(28px + env(safe-area-inset-bottom)); }
.wrap { max-width: 500px; margin: auto; }
.content { padding: 24px 19px; }
.section-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 15px; }
.section-title { font-size: 17px; font-weight: 600; }
.hint { font-size: 11px; color: #8791a4; }
.favorites-card { padding: 22px 12px 19px; background: #fff; border-radius: 22px; }
.favorite-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px 4px; }
.favorite-item { position: relative; min-width: 0; user-select: none; -webkit-user-select: none; touch-action: none; }
.favorite-item.dragging { opacity: .25; }
.favorite-tile { display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 2px 0; }
.favorite-icon { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: 16px; overflow: hidden; }
.tile-asset { width: 52px; height: 52px; }
.favorite-name { font-size: 12px; color: #44516a; }
.remove { position: absolute; top: -7px; right: 3px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
.remove text { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #fff0ef; border: 2px solid #fff; color: #cd6359; font-size: 17px; line-height: 1; }
.favorites-empty { text-align: center; padding: 22px 0; font-size: 13px; color: #8791a4; }
.storage-error { margin-top: 14px; color: #a96812; font-size: 12px; }
.add-heading { margin-top: 28px; }
.app-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.app-card { position: relative; display: flex; align-items: center; gap: 9px; min-width: 0; min-height: 92px; padding: 18px 10px; border-radius: 18px; background: #fff; }
.app-icon { flex-shrink: 0; width: 40px; height: 40px; border-radius: 12px; overflow: hidden; display: flex; }
.card-asset { width: 40px; height: 40px; }
.app-copy { min-width: 0; flex: 1; }
.app-name { font-size: 14px; font-weight: 500; }
.app-description { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; text-overflow: ellipsis; overflow-wrap: anywhere; max-height: 3em; font-size: 11px; color: #68758b; line-height: 1.5; margin-top: 5px; }
.add-state { position: absolute; right: 8px; top: 6px; display: flex; }
.add-state text { font-size: 9px; color: #8791a4; }
.drag-ghost { position: fixed; z-index: 25; width: 52px; height: 52px; border-radius: 16px; overflow: hidden; pointer-events: none; box-shadow: 0 10px 22px rgba(41,79,219,.2); transform: scale(1.08); }
@media (max-width: 350px) { .content { padding-left: 15px; padding-right: 15px; } .favorites-card { padding-left: 8px; padding-right: 8px; } .app-grid { gap: 10px; } .app-card { gap: 7px; padding-left: 9px; padding-right: 9px; } }
</style>
