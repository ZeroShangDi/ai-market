<template>
  <view class="update-overlay" @tap.self="$emit('close')">
    <view class="update-dialog" role="dialog" aria-modal="true" :aria-label="announcement ? '发现新版本' : presentation.title">
      <button class="close-button" aria-label="关闭更新窗口" @tap="$emit('close')"><AppIcon name="close" :size="20" color="#939bad" /></button>
      <view class="hero" :class="{ warning: failed }"><view class="hero-icon"><AppIcon :name="announcement ? 'update' : presentation.icon" :size="30" :color="failed ? '#b47b36' : '#4c69d6'" /></view></view>
      <text class="eyebrow">应用更新</text>
      <text class="dialog-title">{{ announcement ? '发现新版本' : presentation.title }}</text>
      <view v-if="state.release" class="version-line"><text class="version-tag">v{{ state.release.versionName }}</text><text class="package-size">{{ packageSize }}</text></view>

      <view v-if="announcement" class="highlights">
        <view v-for="(line, index) in highlights" :key="index" class="highlight"><view class="bullet" /><text>{{ line }}</text></view>
      </view>
      <view v-else class="progress-content" aria-live="polite">
        <template v-if="inProgress">
          <view class="progress-heading"><text class="progress-label">{{ state.status === 'downloading' ? '下载进度' : '下载完成' }}</text><view class="progress-value">{{ progress }}<text>%</text></view></view>
          <view class="progress-track" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" aria-label="安装包下载进度"><view class="progress-fill" :style="{ width: progress + '%' }" /></view>
          <view class="steps"><view v-for="(step, index) in ['下载', '校验', '安装']" :key="step" class="step" :class="{ active: index === activeStep, done: index < activeStep }"><view class="step-dot">{{ index < activeStep ? '✓' : index + 1 }}</view><text>{{ step }}</text></view></view>
        </template>
        <text v-if="presentation.detail" class="status-detail" :class="{ 'error-detail': failed }">{{ presentation.detail }}</text>
      </view>

      <view class="dialog-actions">
        <button v-if="announcement" class="primary-button" @tap="$emit('update')">立即更新</button>
        <template v-else>
          <button v-if="permissionDenied" class="settings-button" @tap="$emit('settings')">允许安装应用</button>
          <button v-if="presentation.action" class="primary-button" @tap="$emit('update')">{{ presentation.action }}</button>
          <button v-else class="primary-button" @tap="$emit('close')">{{ canCancel ? '后台继续' : '知道了' }}</button>
        </template>
        <button v-if="announcement" class="text-button" @tap="$emit('skip')">跳过此版本</button>
        <button v-else-if="canCancel" class="text-button" @tap="$emit('cancel')">取消更新</button>
        <button v-else-if="presentation.action" class="text-button" @tap="$emit('close')">稍后再说</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import type { UpdateState } from '@/modules/app-update/core';
import { updateHighlights, updatePresentation, updateProgress } from '@/modules/app-update/presentation';
const props = defineProps<{ state: UpdateState; announcement: boolean }>();
defineEmits<{ (event: 'close' | 'update' | 'skip' | 'cancel' | 'settings'): void }>();
const highlights = computed(() => updateHighlights(props.state.release?.notes || ''));
const presentation = computed(() => updatePresentation(props.state));
const progress = computed(() => updateProgress(props.state));
const packageSize = computed(() => props.state.release ? `${(props.state.release.artifact.bytes / 1024 / 1024).toFixed(1)} MB` : '');
const failed = computed(() => props.state.status === 'failed');
const permissionDenied = computed(() => failed.value && props.state.stage === 'install');
const canCancel = computed(() => ['downloading', 'verifying', 'readyToInstall'].includes(props.state.status));
const inProgress = computed(() => ['downloading', 'verifying', 'readyToInstall', 'installing', 'installationRequested'].includes(props.state.status));
const activeStep = computed(() => props.state.status === 'downloading' ? 0 : props.state.status === 'verifying' ? 1 : 2);
</script>

<style scoped>
.update-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px 20px; background: rgba(24, 33, 55, .42); }
.update-dialog { position: relative; width: 100%; max-width: 348px; max-height: 100%; overflow-y: auto; padding: 28px 26px 16px; box-sizing: border-box; border-radius: 28px; background: linear-gradient(165deg, #f0f4ff 0, #fff 190px); box-shadow: 0 24px 80px rgba(21, 35, 77, .18); text-align: center; color: #222b3d; }
.close-button { position: absolute; top: 12px; right: 12px; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border-radius: 50%; background: transparent; }
button { cursor: pointer; border: 0; font-family: inherit; }
button::after { border: 0; }
.hero { display: flex; align-items: center; justify-content: center; width: 88px; height: 88px; margin: 0 auto 15px; border: 1px solid #e5ebfc; border-radius: 50%; background: rgba(230, 237, 255, .45); }
.hero-icon { display: flex; align-items: center; justify-content: center; width: 62px; height: 62px; border-radius: 21px; background: #fff; box-shadow: 0 8px 24px rgba(66, 100, 202, .10); }
.hero.warning { background: #fcf5e9; border-color: #f5e9d5; }
.eyebrow { display: block; margin-bottom: 7px; color: #8b96ae; font-size: 11px; letter-spacing: 2px; }
.dialog-title { display: block; font-size: 23px; font-weight: 600; line-height: 1.4; letter-spacing: -.5px; }
.version-line { display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 12px; font-size: 11px; }
.version-tag { padding: 4px 9px; border-radius: 7px; background: #edf2ff; color: #5971bd; }
.package-size { color: #98a1b2; }
.highlights { margin: 26px 0 28px; text-align: left; }
.highlight { display: flex; align-items: baseline; gap: 10px; margin: 12px 0; font-size: 14px; line-height: 1.7; color: #5a6579; overflow-wrap: anywhere; }
.bullet { flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; background: #8ea3e5; }
.progress-content { margin: 25px 0 24px; }
.progress-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.progress-label { color: #8791a6; font-size: 12px; }
.progress-value { font-size: 30px; font-weight: 600; color: #435fbf; font-variant-numeric: tabular-nums; line-height: 1; }
.progress-value text { padding-left: 3px; font-size: 13px; font-weight: 400; }
.progress-track { height: 7px; background: #edf1f9; border-radius: 8px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, #7b96ed, #4d6dd8); transition: width .25s ease; }
.steps { display: flex; justify-content: space-between; margin-top: 17px; }
.step { display: flex; align-items: center; gap: 6px; color: #adb4c2; font-size: 11px; }
.step-dot { display: flex; align-items: center; justify-content: center; width: 17px; height: 17px; border-radius: 50%; background: #f1f3f7; font-size: 10px; }
.step.active { color: #526fcd; }.step.active .step-dot { background: #eaf0ff; }.step.done { color: #7c91c8; }
.status-detail { display: block; margin-top: 23px; color: #929bad; font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap; }
.error-detail { padding: 14px; border-radius: 12px; background: #faf6ef; color: #927550; text-align: left; max-height: 140px; overflow-y: auto; }
.dialog-actions { display: flex; flex-direction: column; gap: 4px; }
.primary-button, .settings-button { width: 100%; margin: 0; height: 46px; line-height: 46px; padding: 0 12px; border-radius: 13px; background: #4e6cd5; color: #fff; font-size: 14px; font-weight: 500; }
.primary-button:active { background: #425fc8; }
.settings-button { background: #edf2ff; color: #526ac0; margin-bottom: 5px; }
.text-button { margin: 0; padding: 0 12px; height: 42px; line-height: 42px; background: transparent; color: #929bad; font-size: 12px; }
@media (max-height: 540px) { .update-dialog { padding-top: 18px; }.hero { width: 54px; height: 54px; margin-bottom: 10px; }.hero-icon { width: 44px; height: 44px; border-radius: 15px; }.highlights, .progress-content { margin: 18px 0; } }
</style>
