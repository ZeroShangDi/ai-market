import { mockEnabled } from "@/config";
import { mobileApi } from "@/api/mobile";
import { mock } from "./mock";
import { dial } from "@/native/phone";
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
interface RetryItem {
  id: string;
  body: CompleteCall;
  key: string;
  recordingPath?: string;
  uploadId?: string;
}
// Sensitive pending events stay in memory until a platform secure-store adapter is available.
const pending: RetryItem[] = [];
const beginAttempts = new Map<string, { key: string; eventId: string }>();
const activeBegins = new Set<string>();
export interface StartedCall {
  callId: string;
  startedAt: string;
  dialStarted: boolean;
  dispatchId?: string;
}
export async function beginCall(
  source: Source,
  targetId: string,
): Promise<StartedCall> {
  const attemptId = `${source}:${targetId}`;
  if (activeBegins.has(attemptId)) throw new Error("正在处理本次拨号，请稍候");
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
    beginAttempts.delete(attemptId);
    const startedAt = new Date().toISOString();
    try {
      await dial(result.phone_number);
      if (!mockEnabled) {
        try {
          await mobileApi.callStarted(result.call_id, startedAt, uuid());
        } catch {
          /* completion can still reconcile the call */
        }
      }
      return {
        callId: result.call_id,
        startedAt,
        dialStarted: true,
        dispatchId: result.dispatch_id,
      };
    } catch (cause) {
      // The record already exists. The user confirms a failed/other result with the same call ID.
      return {
        callId: result.call_id,
        startedAt,
        dialStarted: false,
        dispatchId: result.dispatch_id,
      };
    }
  } finally {
    activeBegins.delete(attemptId);
  }
}
export async function completeCall(
  callId: string,
  resultCode: ResultCode,
  startedAt: string,
  durationSeconds = 0,
  note = "",
  recordingPath?: string,
) {
  const body: CompleteCall = {
    device_event_id: uuid(),
    result_code: resultCode,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    duration_seconds: Math.max(0, durationSeconds),
    recording_available: !!recordingPath,
    note,
  };
  const item = {
    id: callId,
    body,
    key: uuid(),
    recordingPath,
    uploadId: recordingPath ? uuid() : undefined,
  };
  let resultSynced = false;
  let recordingSynced = false;
  try {
    if (mockEnabled) {
      await mock.completeCall();
      return "mock" as const;
    } else {
      const completed = await mobileApi.completeCall(
        item.id,
        item.body,
        item.key,
      );
      if (!completed) throw new Error("通话结果未被服务端接受");
      resultSynced = true;
      if (item.recordingPath && item.uploadId)
        await mobileApi.uploadRecording(
          item.id,
          item.recordingPath,
          item.uploadId,
        );
      if (item.recordingPath) recordingSynced = true;
    }
    return recordingSynced ? ("recording_synced" as const) : ("synced" as const);
  } catch {
    pending.push(item);
    return resultSynced ? ("recording_pending" as const) : ("pending" as const);
  }
}
export async function retryPendingCompletions() {
  for (const item of [...pending]) {
    try {
      if (mockEnabled) await mock.completeCall();
      else {
        const completed = await mobileApi.completeCall(
          item.id,
          item.body,
          item.key,
        );
        if (!completed) throw new Error("通话结果未被服务端接受");
        if (item.recordingPath && item.uploadId)
          await mobileApi.uploadRecording(
            item.id,
            item.recordingPath,
            item.uploadId,
          );
      }
      pending.splice(pending.indexOf(item), 1);
    } catch {
      break;
    }
  }
}
export function pendingCompletionCount() {
  return pending.length;
}
export function clearCallState() {
  pending.length = 0;
  beginAttempts.clear();
}
