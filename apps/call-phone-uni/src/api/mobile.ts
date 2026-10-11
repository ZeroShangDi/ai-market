import { saveDevice, verifyDeviceStorage } from "@/services/vault";
import {
  error,
  downloadRecording as downloadRecordingFile,
  hasCallphoneDeviceCredential,
  request,
  setCallphoneDeviceCredential,
  uploadRecording as uploadRecordingFile,
} from "./http";
import type {
  BeginCall,
  BeginCallRequest,
  Bootstrap,
  CompleteCall,
  Customer,
  Device,
  Diagnostics,
  Dispatch,
  Page,
  Scope,
} from "@/types/mobile";
const base = "/api/v1/mobile";
const enc = encodeURIComponent;
export const mobileApi = {
  claimPairing: async (
    pairingCode: string,
    displayName: string,
    platform: "android" | "ios",
  ) => {
    verifyDeviceStorage();
    const result = await request<{
      device_id: string;
      device_key: string;
      display_name: string;
    }>("POST", `${base}/pairings/claim`, {
      pairing_code: pairingCode,
      display_name: displayName,
      platform,
    });
    if (!result?.device_id || !result?.device_key)
      throw error("PAIRING_INVALID", "配对码无效、已过期或不属于当前员工账户");
    saveDevice(result.device_id, result.device_key);
    setCallphoneDeviceCredential(result.device_id, result.device_key);
    return { device_id: result.device_id, display_name: result.display_name };
  },
  bootstrap: () => request<Bootstrap>("GET", `${base}/bootstrap`),
  customers: (scope: Scope, page = 1) =>
    request<Page<Customer>>(
      "GET",
      `${base}/customers?scope=${scope}&page=${page}&page_size=20`,
    ),
  customer: (id: string) =>
    request<Customer>("GET", `${base}/customers/${enc(id)}`),
  dispatches: () =>
    request<Page<Dispatch>>(
      "GET",
      `${base}/call-dispatches?status=pending&page=1&page_size=20`,
    ),
  heartbeat: () =>
    hasCallphoneDeviceCredential()
      ? request<boolean>("POST", `${base}/devices/heartbeat`)
      : Promise.resolve(false),
  declineDispatch: (id: string, deviceEventId: string) =>
    request<boolean>("POST", `${base}/call-dispatches/${enc(id)}/decline`, {
      device_event_id: deviceEventId,
      reason_code: "not_available",
    }),
  beginCall: (body: BeginCallRequest, key: string) =>
    request<BeginCall>("POST", `${base}/calls`, body, key),
  callStarted: (callId: string, startedAt: string, deviceEventId: string) =>
    request<boolean>("POST", `${base}/calls/started`, {
      call_id: callId,
      started_at: startedAt,
      device_event_id: deviceEventId,
    }),
  completeCall: (id: string, body: CompleteCall, key: string) =>
    request<boolean>("POST", `${base}/calls/${enc(id)}/complete`, body, key),
  observedEnd: (
    id: string,
    body: {
      device_event_id: string;
      ended_at: string;
      duration_seconds: number;
    },
  ) =>
    request<boolean>(
      "POST",
      `${base}/calls/${enc(id)}/observed-end`,
      body,
      body.device_event_id,
    ),
  recordingAccess: (id: string) =>
    request<{ url?: string; playback_url?: string; expires_at?: string }>(
      "GET",
      `${base}/calls/${enc(id)}/recording-access`,
    ),
  uploadRecording: (id: string, filePath: string, uploadId: string) =>
    uploadRecordingFile(id, filePath, uploadId),
  downloadRecording: (path: string) => downloadRecordingFile(path),
  device: () =>
    hasCallphoneDeviceCredential()
      ? request<Device>("GET", `${base}/devices/current`)
      : Promise.resolve({ paired: false }),
  unpair: (key: string) =>
    request<boolean>(
      "DELETE",
      `${base}/devices/current/pairing`,
      undefined,
      key,
    ),
  diagnostics: () => request<Diagnostics>("GET", `${base}/diagnostics`),
};
