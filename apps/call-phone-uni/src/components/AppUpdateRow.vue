<template>
  <view class="update-card">
    <view class="update-row">
      <view class="update-copy">
        <text class="update-title">应用更新</text>
        <text class="update-version">当前版本 {{ versionName }}</text>
      </view>
      <button class="update-action" :disabled="state.status === 'checking'" @tap="updatePresenter.action()">{{ buttonLabel }}</button>
    </view>
    <text v-if="state.release && !busy" class="update-note">可更新至 {{ state.release.versionName }}</text>
    <view v-if="state.status === 'downloading'" class="update-progress">
      <view class="update-track"><view class="update-fill" :style="{ width: progress + '%' }" /></view>
      <text>{{ progress }}%</text>
    </view>
    <text v-else-if="statusText" class="update-note">{{ statusText }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { updatePresenter } from '@/services/updates';
import { updatePresentation, updateProgress } from '@/modules/app-update/presentation';
const { state, versionName, buttonLabel, busy } = updatePresenter;
const progress = computed(() => updateProgress(state.value));
const statusText = computed(() => ['verifying', 'installing', 'installationRequested', 'failed'].includes(state.value.status) ? updatePresentation(state.value).title : '');
</script>

<style scoped>
.update-card { margin-top: 12px; padding: 14px; border-radius: 18px; background: #fff; box-shadow: 0 6px 16px rgba(20,31,51,.06); }
.update-row { display: flex; align-items: center; gap: 12px; min-height: 40px; }
.update-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; }
.update-title { color: #1a1f2e; font-size: 14px; font-weight: 500; }
.update-version { color: #8791a4; font-size: 11px; }
.update-action { flex-shrink: 0; margin: 0; padding: 0 14px; min-width: 92px; height: 34px; line-height: 34px; background: #edf1ff; color: #294fdb; border-radius: 10px; font-size: 12px; }
.update-action::after { border: 0; }
.update-action[disabled] { background: #f3f5fa; color: #8791a4; }
.update-note { display: block; margin-top: 10px; color: #8791a4; font-size: 11px; line-height: 1.65; white-space: pre-wrap; }
.update-progress { display: flex; align-items: center; gap: 12px; margin-top: 14px; color: #8791a4; font-size: 11px; }
.update-track { flex: 1; height: 4px; border-radius: 4px; overflow: hidden; background: #edf1ff; }
.update-fill { height: 100%; background: #5572df; transition: width .2s; }
</style>
