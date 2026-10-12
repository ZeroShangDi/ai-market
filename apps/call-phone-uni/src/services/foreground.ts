import { ref } from "vue";
import { dispatchPollMs, mockEnabled } from "@/config";
import {
  getSessionVersion,
  hasAccessToken,
  hasCallphoneDeviceCredential,
  onSessionChange,
} from "@/api/http";
import { mobileService } from "./mobile";
import { isPetActive as canRunInBackground, onPetChange } from "@/modules/mobile-pet";
import { reportPetConnection } from "./pet-status";
import { retryPendingCompletions, hasUnfinishedCall } from "./calls";
import { acceptNextDispatch } from "./automatic-call";
import type { Dispatch } from "@/types/mobile";

export const foregroundDispatches = ref<Dispatch[]>([]);
export const foregroundError = ref("");
let visible = false;
let generation = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let inFlight: Promise<void> | undefined;
export function refreshDispatches(): Promise<void> {
  if (
    (!visible && !canRunInBackground()) ||
    (!mockEnabled && (!hasAccessToken() || !hasCallphoneDeviceCredential()))
  ) {
    foregroundDispatches.value = [];
    return Promise.resolve();
  }
  if (inFlight) return inFlight;
  const version = generation,
    session = getSessionVersion();
  const current = () =>
    (visible || canRunInBackground()) && version === generation && session === getSessionVersion();
  inFlight = (async () => {
    try {
      await mobileService.heartbeat();
    } catch {
      /* Dispatch request reports authorization errors. */
    }
    if (!current()) return;
    try {
      const result = await mobileService.dispatches();
      if (!current()) return;
      foregroundDispatches.value = result.items.filter(
        (item) =>
          (item.status === "queued" || item.status === "pending") &&
          new Date(item.expires_at).getTime() > Date.now(),
      );
      foregroundError.value = "";
      reportPetConnection(true, hasUnfinishedCall());
      if (!mockEnabled) await acceptNextDispatch(foregroundDispatches.value);
    } catch (e) {
      if (!current()) return;
      foregroundDispatches.value = [];
      reportPetConnection(false);
      foregroundError.value = (e as Error).message || "派发刷新失败，请重试";
    }
  })().finally(() => {
    if (version === generation) inFlight = undefined;
  });
  return inFlight;
}
function reset() {
  generation++;
  if (timer) clearInterval(timer);
  timer = undefined;
  inFlight = undefined;
  foregroundDispatches.value = [];
  foregroundError.value = "";
}
export function startForeground() {
  visible = true;
  if (timer) return;
  void refreshDispatches();
  void retryPendingCompletions();
  timer = setInterval(() => {
    void refreshDispatches();
    void retryPendingCompletions();
  }, dispatchPollMs);
}
export function stopForeground() {
  visible = false;
  if (!canRunInBackground()) reset();
}
onSessionChange(() => {
  reportPetConnection(false);
  reset();
  if (visible) startForeground();
});
export function networkRestored() {
  if (!visible && !canRunInBackground()) return;
  void refreshDispatches();
  void retryPendingCompletions();
}

onPetChange(() => {
  if (visible) return;
  if (!canRunInBackground()) { reset(); return; }
  if (!timer) {
    void refreshDispatches();
    timer = setInterval(() => { void refreshDispatches(); void retryPendingCompletions(); }, dispatchPollMs);
  }
});
