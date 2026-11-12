<template>
  <AppUpdateDialog :state="state" :announcement="dialog === 'announcement'" @update="updatePresenter.startUpdate()" @close="close" @skip="skip" @cancel="cancel" @settings="installSettings" />
</template>

<script setup lang="ts">
import { onUnload } from '@dcloudio/uni-app';
import AppUpdateDialog from '@/components/AppUpdateDialog.vue';
import { updatePresenter } from '@/services/updates';
import { openAndroidInstallSettings } from '@/modules/app-update/android';
const { state, dialog } = updatePresenter;
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  uni.navigateBack({ animationType: 'fade-out', animationDuration: 180, fail: () => { closing = false; } });
}
function skip() { updatePresenter.skipVersion(); close(); }
function cancel() { void updatePresenter.cancel(); }
function installSettings() {
  try { openAndroidInstallSettings(); }
  catch { uni.showToast({ title: '暂时无法打开安装权限设置', icon: 'none' }); }
}
// Native Back and route changes dismiss the window, never cancel the shared download.
onUnload(() => updatePresenter.dialogClosed());
</script>

<style>
page { background: transparent; }
</style>
