<template>
  <view class="update-card">
    <view class="update-row">
      <view class="update-copy">
        <text class="update-title">应用更新</text>
        <text class="update-version">当前版本 {{ versionName }}</text>
      </view>
      <button class="update-action" :disabled="busy" @tap="updatePresenter.action()">{{ buttonLabel }}</button>
    </view>
    <text v-if="state.release && !busy" class="update-note">可更新至 {{ state.release.versionName }}</text>
    <text v-if="state.message" class="update-note">{{ state.message }}</text>
    <view v-if="canCancel || permissionDenied" class="update-tools">
      <button v-if="canCancel" class="update-link" @tap="updatePresenter.cancel()">取消下载</button>
      <button v-if="permissionDenied" class="update-link" @tap="installSettings">允许安装应用</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { updatePresenter } from '@/services/updates';
import { openAndroidInstallSettings } from '@/modules/app-update/android';
const { state, versionName, buttonLabel, busy } = updatePresenter;
const canCancel = computed(() => ['downloading', 'verifying'].includes(state.value.status));
const permissionDenied = computed(() => state.value.status === 'failed' && state.value.stage === 'install');
function installSettings() {
  try { openAndroidInstallSettings(); }
  catch { uni.showToast({ title: '暂时无法打开安装权限设置', icon: 'none' }); }
}
</script>

<style scoped>
.update-card { margin-top: 12px; padding: 14px; border-radius: 18px; background: #fff; box-shadow: 0 6px 16px rgba(20,31,51,.06); }
.update-row { display: flex; align-items: center; gap: 12px; min-height: 40px; }
.update-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; }
.update-title { color: #1a1f2e; font-size: 14px; font-weight: 500; }
.update-version { color: #8791a4; font-size: 11px; }
.update-action { flex-shrink: 0; margin: 0; padding: 0 14px; min-width: 92px; height: 34px; line-height: 34px; background: #edf1ff; color: #294fdb; border-radius: 10px; font-size: 12px; }
.update-action::after, .update-link::after { border: 0; }
.update-action[disabled] { background: #f3f5fa; color: #8791a4; }
.update-note { display: block; margin-top: 10px; color: #8791a4; font-size: 11px; line-height: 1.65; white-space: pre-wrap; }
.update-tools { display: flex; gap: 14px; margin-top: 8px; }
.update-link { margin: 0; padding: 0; background: transparent; color: #294fdb; font-size: 12px; line-height: 30px; }
</style>
