import { phoneCapability } from "@/native/phone";
import { ref } from "vue";
import { beginCall, hasUnfinishedCall, type StartedCall } from "./calls";
import { getSessionVersion, onSessionChange } from "@/api/http";
import type { ResultCode, Dispatch } from "@/types/mobile";

export const automaticCall = ref<StartedCall | null>(null);
export const automaticCallError = ref("");
export const automaticObservation = ref<{
  suggested?: ResultCode;
  endedAt?: string;
  durationSeconds?: number;
  recordingPath?: string;
}>({});
let stopObservation: (() => void) | undefined;
let launching = false;
const attempted = new Set<string>();
onSessionChange(() => {
  automaticCall.value = null;
  automaticCallError.value = "";
  attempted.clear();
  automaticObservation.value = {};
  stopObservation?.();
});
export async function acceptNextDispatch(items: Dispatch[]) {
  if (launching || automaticCall.value || hasUnfinishedCall()) return;
  const item = items.find(
    (row) =>
      !attempted.has(row.id) &&
      (row.status === "queued" || row.status === "pending") &&
      Date.parse(row.expires_at) > Date.now(),
  );
  if (!item) return;
  const session = getSessionVersion();
  launching = true;
  attempted.add(item.id);
  automaticCallError.value = "";
  automaticObservation.value = {};
  stopObservation?.();
  try {
    stopObservation = phoneCapability.observe((event) => {
      if (session !== getSessionVersion() || !automaticCall.value) return;
      if (event.kind === "unanswered")
        automaticObservation.value.suggested = "no_answer";
      if (event.endedAt) automaticObservation.value.endedAt = event.endedAt;
      if (event.kind === "ended") {
        automaticObservation.value.durationSeconds = event.durationSeconds;
        automaticObservation.value.recordingPath = event.recordingPath;
      }
    });
    const call = await beginCall("pc_dispatch", item.id, (call) => {
      if (session === getSessionVersion()) automaticCall.value = call;
    });
    if (session !== getSessionVersion()) return;
    automaticCall.value = call;
    if (!call.dialStarted)
      automaticCallError.value = call.dialUncertain
        ? "拨号状态待核对，请检查系统通话界面"
        : "拨号未启动，请检查电话权限后保存实际结果";
  } catch (error) {
    if (session === getSessionVersion()) {
      automaticCallError.value =
        (error as Error).message || "自动拨号失败，请在电脑重新发起";
      uni.showToast({ title: automaticCallError.value, icon: "none" });
    }
  } finally {
    launching = false;
  }
}
export function finishAutomaticCall() {
  stopObservation?.();
  automaticObservation.value = {};
  automaticCall.value = null;
  automaticCallError.value = "";
}
