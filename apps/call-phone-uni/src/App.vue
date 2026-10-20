<script setup lang="ts">
import { onLaunch, onShow, onHide, onError, onUnhandledRejection } from "@dcloudio/uni-app";
import { logger, resumeLogging, pauseLogging, installRequestLogging, runtimeFailure, diagnosticEnvironment } from '@/services/logger';
import { receiveIncomingWorkFiles } from '@/services/incoming-work-files';
import { testConnectivity } from "@/services/connectivity";
import { resumeDeviceSession } from "@/services/session";
import { onApplicationShow } from "@/modules/device-readiness";
import { configureMobilePet, refreshMobilePet, onPetAction, setMobilePetText, setMobilePetEnabled, mobilePet } from "@/modules/mobile-pet";
import { voiceBubble } from "@/modules/voice/transcript";
import { toggleDesktopVoice, closeVoice, closeAppVoice, onVoiceTranscript, voice, notifyVoiceTask } from "@/modules/voice";
import { checkUpdates } from "@/services/updates";
import { configureAssets } from "@/modules/assets";
import assetManifest from "@/modules/assets/manifest.json";
import {
  startForeground,
  stopForeground,
  networkRestored,
} from "@/services/foreground";
import { createWorkNotifier } from '@/services/voice-work';
const workNotifier = createWorkNotifier({
  available: () => voice.active,
  deliver: async (notice) => {
    if (voice.active && await notifyVoiceTask(notice)) return true;
    return false;
  },
});
configureMobilePet({ preferenceKey: "callphone.mobile-pet.enabled" });
configureAssets({ baseUrl: import.meta.env.VITE_ASSET_BASE_URL || "", manifest: assetManifest });
import { restorePackages, onPackageChange, activePackage } from '@/modules/pet-packages';
onPackageChange(async () => {
  closeVoice();
  const enabled = mobilePet.enabled;
  if (enabled) await setMobilePetEnabled(false);
  if (activePackage()) await setMobilePetEnabled(true);
});
let appVisible = false;
onVoiceTranscript(value => { void setMobilePetText(value ? voiceBubble(value) : ''); });
onPetAction(toggleDesktopVoice);
onError(reason => logger.error('runtime', 'uncaught', runtimeFailure(reason)));
onUnhandledRejection(event => logger.error('runtime', 'unhandled-rejection', runtimeFailure(event.reason)));
onLaunch(() => {
  installRequestLogging();
  workNotifier.start();
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
  void restorePackages().then(refreshMobilePet).catch(() => {});
  void resumeDeviceSession().then(() => { if (appVisible) { startForeground(); receiveIncomingWorkFiles(); } }).catch(() => {
    // Leave the workbench open; retry on the next foreground/network event.
    uni.showToast({ title: "暂未连接电脑，可扫码连接或稍后重试", icon: "none" });
  });
  startForeground();
  void checkUpdates();
});
onHide(() => { closeAppVoice(); logger.info('app', 'hidden'); pauseLogging(); appVisible = false; stopForeground(); });
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
