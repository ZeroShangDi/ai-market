<script setup lang="ts">
import { onLaunch, onShow, onHide, onError, onUnhandledRejection } from "@dcloudio/uni-app";
import { logger, resumeLogging, pauseLogging, installRequestLogging, runtimeFailure, diagnosticEnvironment } from '@/services/logger';
import { receiveIncomingWorkFiles } from '@/services/incoming-work-files';
import { testConnectivity } from "@/services/connectivity";
import { resumeDeviceSession } from "@/services/session";
import { onApplicationShow } from "@/modules/device-readiness";
import { configureMobilePet, refreshMobilePet } from "@/modules/mobile-pet";
import { checkUpdates } from "@/services/updates";
import { configureAssets } from "@/modules/assets";
import assetManifest from "@/modules/assets/manifest.json";
import {
  startForeground,
  stopForeground,
  networkRestored,
} from "@/services/foreground";
configureMobilePet({ preferenceKey: "callphone.mobile-pet.enabled" });
configureAssets({ baseUrl: import.meta.env.VITE_ASSET_BASE_URL || "", manifest: assetManifest });
let appVisible = false;
onError(reason => logger.error('runtime', 'uncaught', runtimeFailure(reason)));
onUnhandledRejection(event => logger.error('runtime', 'unhandled-rejection', runtimeFailure(event.reason)));
onLaunch(() => {
  installRequestLogging();
  void testConnectivity(false);
  logger.info('app', 'launched', diagnosticEnvironment());
  uni.onNetworkStatusChange((status) => {
    logger.info('network', 'status.changed', { connected: status.isConnected, networkType: status.networkType });
    if (status.isConnected) {
      void resumeDeviceSession().then(networkRestored).catch(() => {});
    }
  });
});
onShow(() => {
  resumeLogging(); logger.info('app', 'shown');
  appVisible = true;
  void onApplicationShow();
  void refreshMobilePet();
  void resumeDeviceSession().then(() => { if (appVisible) { startForeground(); receiveIncomingWorkFiles(); } }).catch(() => {
    // Leave the workbench open; retry on the next foreground/network event.
    uni.showToast({ title: "暂未连接电脑，可扫码连接或稍后重试", icon: "none" });
  });
  startForeground();
  void checkUpdates();
});
onHide(() => { logger.info('app', 'hidden'); pauseLogging(); appVisible = false; stopForeground(); });
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
