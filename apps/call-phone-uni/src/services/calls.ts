import { reactive } from "vue";
import { readQueue, writeQueue } from "./vault";
import {
  secureStore,
  preserveRecording,
  removePreservedRecording,
} from "@/native/secure-store";
import { mockEnabled } from "@/config";
import { mobileApi } from "@/api/mobile";
import { mock } from "./mock";
import { phoneCapability, dial } from "@/native/phone";
import type {
  BeginCall,
  BeginCallRequest,
  CompleteCall,
  ResultCode,
  Source,
} from "@/types/mobile";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === "x" ? n : (n & 3) | 8).toString(16);
  });
}
export interface RetryItem {
  observation?: {
    device_event_id: string;
    ended_at: string;
    duration_seconds: number;
  };
  resultSynced?: boolean;
  recordingSynced?: boolean;
  observedDuration?: number;
  durable?: boolean;
  failure?: "temporary" | "auth" | "permanent";
  message?: string;
  attempts?: number;
  retryAt?: number;
  preserved?: boolean;
  id: string;
  body: CompleteCall;
  key: string;
  recordingPath?: string;
  uploadId?: string;
}
export const pending = reactive<RetryItem[]>([]);
function persist() {
  const durable = mockEnabled || writeQueue(pending);
  pending.forEach((item) => {
    item.durable =
      durable &&
      (!item.recordingPath ||
        item.recordingSynced ||
        item.preserved ||
        !secureStore.available());
  });
  return durable;
}
export function restoreCallQueue() {
  const stored = readQueue<RetryItem[]>();
  if (stored) {
    if (
      !Array.isArray(stored) ||
      stored.some(
        (item) => !item.id || !item.key || !item.body?.device_event_id,
      )
    )
      throw new Error("待同步任务格式无效，原数据已保留");
    pending.splice(
      0,
      pending.length,
      ...stored.map((item) => ({
        ...item,
        durable: true,
        failure: item.failure === "auth" ? undefined : item.failure,
        attempts: item.failure === "auth" ? 0 : item.attempts,
      })),
    );
  }
}
export function hasUnsafeResults() {
  return pending.some((item) => !item.durable);
}
function classify(item: RetryItem, cause: unknown) {
  const e = cause as { code?: string; status?: number; message?: string };
  item.failure =
    e.code === "AUTH_REQUIRED" || e.status === 401
      ? "auth"
      : e.code === "DEVICE_REVOKED" ||
          e.code === "FORBIDDEN" ||
          (e.status &&
            e.status >= 400 &&
            e.status < 500 &&
            e.status !== 408 &&
            e.status !== 429) ||
          (e.code && /^1031/.test(e.code))
        ? "permanent"
        : "temporary";
  item.message = e.message || "同步失败，请重试";
  item.attempts = (item.attempts || 0) + 1;
  item.retryAt =
    Date.now() + Math.min(60000, 1000 * 2 ** Math.min(item.attempts, 6));
}
export function discardPending(id: string) {
  if (retrying || completing) throw new Error("正在同步，请稍后处置");
  const index = pending.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [item] = pending.splice(index, 1);
  try {
    persist();
  } catch (e) {
    pending.splice(index, 0, item);
    throw e;
  }
  if (item.preserved && item.recordingPath)
    removePreservedRecording(item.recordingPath);
  if (currentCallId === id) currentCallId = undefined;
}
async function syncItem(item: RetryItem, version: number): Promise<void> {
  if (!item.resultSynced) {
    const accepted = mockEnabled
      ? (await mock.completeCall(), true)
      : await mobileApi.completeCall(item.id, item.body, item.key);
    assertCurrent(version);
    if (!accepted)
      throw Object.assign(new Error("通话状态已变化，请联系管理员核对"), {
        code: "CONFLICT",
        status: 409,
      });
    item.resultSynced = true;
    persist();
  }
  if (item.observation && !mockEnabled) {
    const observation = item.observation;
    if (!(await mobileApi.observedEnd(item.id, observation)))
      throw new Error("通话时长核对尚未完成");
    assertCurrent(version);
    item.observedDuration = observation.duration_seconds;
    if (item.observation === observation) item.observation = undefined;
    persist();
  }
  if (
    item.recordingPath &&
    item.uploadId &&
    !item.recordingSynced &&
    !mockEnabled
  ) {
    await mobileApi.uploadRecording(item.id, item.recordingPath, item.uploadId);
    assertCurrent(version);
    item.recordingSynced = true;
  }
  if (item.observation && !mockEnabled) return syncItem(item, version);
  completedCalls.set(item.id, item);
  const index = pending.findIndex((row) => row.key === item.key);
  if (index >= 0) pending.splice(index, 1);
  try {
    persist();
  } catch (e) {
    if (index >= 0) pending.splice(index, 0, item);
    throw e;
  }
  if (item.preserved && item.recordingPath) {
    try {
      removePreservedRecording(item.recordingPath);
    } catch {
      /* Private orphan cleanup can be retried separately. */
    }
  }
  if (currentCallId === item.id) currentCallId = undefined;
}
const beginAttempts = new Map<string, { key: string; eventId: string }>();
const activeBegins = new Set<string>();
let currentCallId: string | undefined;
let retrying: Promise<void> | undefined;
let generation = 0;
let completing = false;
let stopObserve: (() => void) | undefined;
const completedCalls = new Map<string, RetryItem>();
const endedCalls = new Map<
  string,
  { endedAt: string; durationSeconds?: number; recordingPath?: string }
>();
function assertCurrent(version: number) {
  if (version !== generation) throw new Error("账户会话已变更，请重新加载");
}
export function confirmCallEnded(callId: string) {
  if (currentCallId !== callId) throw new Error("当前通话已变更");
  if (!endedCalls.has(callId))
    endedCalls.set(callId, { endedAt: new Date().toISOString() });
  return endedCalls.get(callId)!.endedAt;
}
export function hasUnfinishedCall() {
  return !!currentCallId || activeBegins.size > 0;
}
export interface StartedCall {
  callId: string;
  startedAt: string;
  dialStarted: boolean;
  dialUncertain?: boolean;
  dispatchId?: string;
}
export async function beginCall(
  source: Source,
  targetId: string,
  onCreated?: (call: StartedCall) => void,
): Promise<StartedCall> {
  if (currentCallId || activeBegins.size)
    throw new Error("请先完成当前通话并保存结果");
  if (!mockEnabled && !phoneCapability.available())
    throw new Error(
      "当前设备没有 Android 拨号插件，请使用含原插件的自定义基座",
    );
  const attemptId = `${source}:${targetId}`;
  if (activeBegins.has(attemptId)) throw new Error("正在处理本次拨号，请稍候");
  const version = generation;
  activeBegins.add(attemptId);
  try {
    let attempt = beginAttempts.get(attemptId);
    if (!attempt) {
      attempt = { key: uuid(), eventId: uuid() };
      beginAttempts.set(attemptId, attempt);
    }
    const body: BeginCallRequest =
      source === "pc_dispatch"
        ? {
            source,
            dispatch_id: targetId,
            device_event_id: attempt.eventId,
          }
        : {
            source,
            customer_id: targetId,
            device_event_id: attempt.eventId,
          };
    const result: BeginCall = mockEnabled
      ? await mock.beginCall(
          source,
          source === "pc_dispatch" ? undefined : targetId,
          source === "pc_dispatch" ? targetId : undefined,
        )
      : await mobileApi.beginCall(body, attempt.key);
    assertCurrent(version);
    if (!result?.call_id || !result?.phone_number)
      throw new Error("派发已过期、被取消或目标已无法拨打，请刷新后重试");
    beginAttempts.delete(attemptId);
    currentCallId = result.call_id;
    stopObserve?.();
    completedCalls.clear();
    stopObserve = phoneCapability.observe((event) => {
      if (
        version !== generation ||
        (currentCallId && currentCallId !== result.call_id) ||
        !event.endedAt
      )
        return;
      const previous = endedCalls.get(result.call_id);
      endedCalls.set(result.call_id, {
        endedAt: previous?.endedAt || event.endedAt,
        durationSeconds: Math.max(
          event.durationSeconds || 0,
          previous?.durationSeconds || 0,
        ),
        recordingPath: event.recordingPath || previous?.recordingPath,
      });
      const item =
        pending.find((row) => row.id === result.call_id) ||
        completedCalls.get(result.call_id);
      if (!item) return;
      const duration = event.durationSeconds ?? 0;
      const needsDuration =
        duration >
        Math.max(
          item.body.duration_seconds,
          item.observation?.duration_seconds || 0,
          item.observedDuration || 0,
        );
      const needsRecording = !!event.recordingPath && !item.recordingPath;
      if (!needsDuration && !needsRecording) return;
      if (needsDuration)
        item.observation = {
          device_event_id: uuid(),
          ended_at: event.endedAt,
          duration_seconds: duration,
        };
      if (needsRecording) {
        item.uploadId ||= uuid();
        item.recordingPath = event.recordingPath;
        try {
          if (secureStore.available()) {
            item.recordingPath = preserveRecording(
              event.recordingPath!,
              item.uploadId,
            );
            item.preserved = true;
          }
        } catch {
          item.durable = false;
          item.message = "延迟录音尚未安全保存，请保持应用打开";
        }
      }
      if (!pending.some((row) => row.key === item.key)) pending.push(item);
      try {
        persist();
      } catch {
        item.durable = false;
      }
      if (!completing) void retryPendingCompletions(true);
    });
    const startedAt = new Date().toISOString();
    onCreated?.({
      callId: result.call_id,
      startedAt,
      dialStarted: false,
      dispatchId: result.dispatch_id,
    });
    try {
      await dial(result.phone_number);
      assertCurrent(version);
      if (!mockEnabled) {
        try {
          await mobileApi.callStarted(result.call_id, startedAt, uuid());
        } catch {
          /* completion can still reconcile the call */
        }
      }
      assertCurrent(version);
      return {
        callId: result.call_id,
        startedAt,
        dialStarted: true,
        dispatchId: result.dispatch_id,
      };
    } catch (cause) {
      assertCurrent(version);
      if ((cause as { code?: string })?.code !== "DIAL_TIMEOUT")
        confirmCallEnded(result.call_id);
      // A timeout does not prove that the native phone failed to start.
      assertCurrent(version);
      return {
        callId: result.call_id,
        startedAt,
        dialStarted: false,
        dialUncertain: (cause as { code?: string })?.code === "DIAL_TIMEOUT",
        dispatchId: result.dispatch_id,
      };
    }
  } finally {
    if (version === generation) activeBegins.delete(attemptId);
  }
}
export async function completeCall(
  callId: string,
  resultCode: ResultCode,
  startedAt: string,
  durationSeconds = 0,
  note = "",
  recordingPath?: string,
  endedAt?: string,
  userSavesEndedCall = false,
) {
  const version = generation;
  const alreadySaved = completedCalls.get(callId);
  if (
    !currentCallId &&
    alreadySaved?.resultSynced &&
    !pending.some((item) => item.id === callId)
  )
    return alreadySaved.recordingSynced
      ? ("recording_synced" as const)
      : ("synced" as const);
  if (currentCallId !== callId) throw new Error("当前通话已变更，请重新加载");
  // The single Save action also records the user's end-of-call assertion.
  if (userSavesEndedCall && !endedCalls.has(callId)) confirmCallEnded(callId);
  const observed = endedCalls.get(callId);
  if (!observed) throw new Error("通话尚未结束，请挂断后点击保存结果");
  if (completing || retrying) throw new Error("正在同步通话，请稍候再保存");
  completing = true;
  recordingPath = observed.recordingPath || recordingPath;
  durationSeconds = observed.durationSeconds ?? durationSeconds;
  endedAt = observed.endedAt;
  const body: CompleteCall = {
    device_event_id: uuid(),
    result_code: resultCode,
    started_at: startedAt,
    ended_at: endedAt || new Date().toISOString(),
    duration_seconds: Math.max(0, durationSeconds),
    recording_available: !!recordingPath,
    note,
  };
  let item = pending.find((row) => row.id === callId);
  try {
    if (!item) {
      item = {
        id: callId,
        body,
        key: uuid(),
        recordingPath,
        uploadId: recordingPath ? uuid() : undefined,
      };
      if (recordingPath && secureStore.available()) {
        item.recordingPath = preserveRecording(recordingPath, item.uploadId!);
        item.preserved = true;
      }
      pending.push(item);
    }
    persist();
    await syncItem(item, version);
    assertCurrent(version);
    return mockEnabled
      ? ("mock" as const)
      : recordingPath
        ? ("recording_synced" as const)
        : ("synced" as const);
  } catch (e) {
    assertCurrent(version);
    if (!item || !pending.some((row) => row.key === item!.key)) throw e;
    classify(item, e);
    try {
      persist();
    } catch {
      item.durable = false;
    }
    if (!item.durable)
      throw new Error(
        "结果尚未安全保存，请保持应用打开并重试。" + item.message,
      );
    currentCallId = undefined;
    return item.resultSynced
      ? ("recording_pending" as const)
      : ("pending" as const);
  } finally {
    if (version === generation) completing = false;
  }
}
export function retryPendingCompletions(manual = false): Promise<void> {
  if (!retrying) {
    const version = generation;
    retrying = drainPendingCompletions(version, manual).finally(() => {
      if (version === generation) retrying = undefined;
    });
  }
  return retrying;
}
async function drainPendingCompletions(version: number, manual: boolean) {
  for (const item of [...pending]) {
    if (version !== generation || completing) return;
    if (
      (!manual && item.failure === "permanent") ||
      (!manual &&
        (item.failure === "auth" ||
          (item.attempts || 0) >= 5 ||
          (item.retryAt || 0) > Date.now()))
    )
      continue;
    try {
      await syncItem(item, version);
    } catch (e) {
      if (version !== generation) return;
      classify(item, e);
      try {
        persist();
      } catch {
        item.durable = false;
      }
      if (item.failure === "auth") return;
    }
  }
}
export function pendingCompletionCount() {
  return pending.length;
}
export function clearCallState() {
  generation++;
  completing = false;
  retrying = undefined;
  activeBegins.clear();
  endedCalls.clear();
  completedCalls.clear();
  stopObserve?.();
  stopObserve = undefined;
  pending.length = 0;
  beginAttempts.clear();
  currentCallId = undefined;
}
