<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { resumeDeviceSession } from "@/services/session";
import { onApplicationShow } from "@/modules/device-readiness";
import { configureMobilePet, refreshMobilePet } from "@/modules/mobile-pet";
import { checkUpdates } from "@/services/updates";
import {
  startForeground,
  stopForeground,
  networkRestored,
} from "@/services/foreground";
configureMobilePet({ preferenceKey: "callphone.mobile-pet.enabled" });
let appVisible = false;
onLaunch(() =>
  uni.onNetworkStatusChange((status) => {
    if (status.isConnected) {
      void resumeDeviceSession().then(networkRestored).catch(() => {});
    }
  }),
);
onShow(() => {
  appVisible = true;
  void onApplicationShow();
  void refreshMobilePet();
  void resumeDeviceSession().then(() => { if (appVisible) startForeground(); }).catch(() => {
    // Leave the workbench open; retry on the next foreground/network event.
    uni.showToast({ title: "暂未连接电脑，可扫码连接或稍后重试", icon: "none" });
  });
  startForeground();
  void checkUpdates();
});
onHide(() => { appVisible = false; stopForeground(); });
</script>
<style lang="scss">
page {
  background: #f7f8fc;
  color: #1a1f2e;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "PingFang SC",
    sans-serif;
}
view,
text {
  box-sizing: border-box;
}
</style>
