import { mockEnabled } from "@/config";
import { mobileApi } from "@/api/mobile";
import { mock } from "./mock";
import type { Scope } from "@/types/mobile";
export const mobileService = {
  bootstrap: () => (mockEnabled ? mock.bootstrap() : mobileApi.bootstrap()),
  claimPairing: (
    pairingCode: string,
    displayName: string,
    platform: "android" | "ios",
  ) =>
    mockEnabled
      ? mock.claimPairing(pairingCode, displayName, platform)
      : mobileApi.claimPairing(pairingCode, displayName, platform),
  customers: (scope: Scope, page = 1) =>
    mockEnabled
      ? mock.customers(scope, page)
      : mobileApi.customers(scope, page),
  customer: (id: string) =>
    mockEnabled ? mock.customer(id) : mobileApi.customer(id),
  dispatches: () => (mockEnabled ? mock.dispatches() : mobileApi.dispatches()),
  declineDispatch: (id: string, eventId: string) =>
    mockEnabled
      ? Promise.resolve(true)
      : mobileApi.declineDispatch(id, eventId),
  heartbeat: () =>
    mockEnabled ? Promise.resolve(true) : mobileApi.heartbeat(),
  recordingAccess: (id: string) =>
    mockEnabled ? mock.recordingAccess() : mobileApi.recordingAccess(id),
  uploadRecording: (id: string, filePath: string, uploadId: string) =>
    mockEnabled
      ? Promise.resolve()
      : mobileApi.uploadRecording(id, filePath, uploadId),
  downloadRecording: (path: string) => mobileApi.downloadRecording(path),
  device: () => (mockEnabled ? mock.device() : mobileApi.device()),
  diagnostics: () =>
    mockEnabled ? mock.diagnostics() : mobileApi.diagnostics(),
  unpair: (key: string) =>
    mockEnabled ? mock.unpair() : mobileApi.unpair(key),
};
