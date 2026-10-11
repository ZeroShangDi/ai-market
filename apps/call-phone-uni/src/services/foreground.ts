import { ref } from "vue";
import { dispatchPollMs, mockEnabled } from "@/config";
import {
  getSessionVersion,
  hasAccessToken,
  hasCallphoneDeviceCredential,
  onSessionChange,
} from "@/api/http";
import { mobileService } from "./mobile";
import { retryPendingCompletions } from "./calls";
import type { Dispatch } from "@/types/mobile";

export const foregroundDispatches = ref<Dispatch[]>([]);
export const foregroundError = ref("");
let visible = false;
let generation = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let inFlight: Promise<void> | undefined;
export function refreshDispatches(): Promise<void> {
  if (
    !visible ||
    (!mockEnabled && (!hasAccessToken() || !hasCallphoneDeviceCredential()))
  ) {
    foregroundDispatches.value = [];
    return Promise.resolve();
  }
  if (inFlight) return inFlight;
  const version = generation,
    session = getSessionVersion();
  const current = () =>
    visible && version === generation && session === getSessionVersion();
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
    } catch (e) {
      if (!current()) return;
      foregroundDispatches.value = [];
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
  reset();
}
onSessionChange(() => {
  reset();
  if (visible) startForeground();
});
export function networkRestored() {
  if (!visible) return;
  void refreshDispatches();
  void retryPendingCompletions();
}
