import {
  publicRequest,
  request,
  setAccessToken,
  clearAccessToken,
  hasAccessToken,
  setCallphoneDeviceCredential,
  clearCallphoneDeviceCredential,
  getSessionVersion,
} from "@/api/http";
import { verifyRememberedDeviceStorage, rememberDevice, readRememberedDevice, forgetRememberedDevice, type RememberedDevice } from "./remembered-device";
import type { PairingPayload } from "./pairing";
import { connectionSettings, saveConnectionSettings } from "@/config";
import { saveDevice } from "./vault";
import { mockEnabled } from "@/config";
import {
  clearCallState,
  restoreCallQueue,
  hasUnfinishedCall,
  hasUnsafeResults,
} from "./calls";
import {
  openVault,
  closeVault,
  readDevice,
  setVaultDevice,
  forgetDevice,
} from "./vault";
import type { Bootstrap } from "@/types/mobile";
let loginGeneration = 0;
export function ensureSession() {
  if (mockEnabled || hasAccessToken()) return true;
  uni.showToast({ title: "请先在工作台扫码连接电脑", icon: "none" });
  uni.reLaunch({ url: "/pages/index/index" });
  return false;
}
export async function login(
  username: string,
  password: string,
  captchaVerification?: string,
) {
  const attempt = ++loginGeneration;
  clearCallState();
  closeVault();
  clearAccessToken();
  const result = await publicRequest<{
    accessToken: string;
    refreshToken: string;
  }>("POST", "/admin-api/system/auth/login", {
    username,
    password,
    captchaVerification,
  });
  if (attempt !== loginGeneration) throw new Error("登录请求已被替换");
  if (!result?.accessToken || !result?.refreshToken)
    throw new Error("登录返回格式不正确");
  setAccessToken(result.accessToken, result.refreshToken);
  try {
    const bootstrap = await request<Bootstrap>(
      "GET",
      "/api/v1/mobile/bootstrap",
    );
    if (attempt !== loginGeneration) throw new Error("登录请求已被替换");
    openVault(bootstrap.user?.id || "");
    const credential = readDevice();
    if (credential) {
      setCallphoneDeviceCredential(credential.id, credential.key);
      try {
        await request("GET", "/api/v1/mobile/devices/current");
        if (attempt !== loginGeneration) throw new Error("登录请求已被替换");
        setVaultDevice(credential.id);
        restoreCallQueue();
      } catch (e) {
        if (attempt !== loginGeneration) throw e;
        clearCallphoneDeviceCredential();
        if ((e as any).code === "DEVICE_REVOKED") forgetDevice();
        else throw e;
      }
    }
  } catch (e) {
    if (attempt === loginGeneration) {
      clearAccessToken();
      closeVault();
    }
    throw e;
  }
}
export async function logout() {
  if (hasUnfinishedCall() || hasUnsafeResults())
    throw new Error("请先结束通话并安全保存结果");
  const version = getSessionVersion();
  ++loginGeneration;
  forgetRememberedDevice();
  try {
    if (hasAccessToken())
      await request("POST", "/admin-api/system/auth/logout");
  } finally {
    if (version === getSessionVersion()) {
      clearCallState();
      clearAccessToken();
      closeVault();
    }
  }
}

interface DeviceSessionResponse {
  userId: string; deviceId: string; deviceKey?: string; accessToken: string; refreshToken: string;
}
let restoring: Promise<boolean> | undefined;
async function installDeviceSession(result: DeviceSessionResponse, remembered: RememberedDevice, attempt: number) {
  if (attempt !== loginGeneration) throw new Error("登录请求已被替换");
  if (!result.accessToken || !result.refreshToken || result.userId !== remembered.userId || result.deviceId !== remembered.deviceId)
    throw new Error("设备登录响应不正确");
  setAccessToken(result.accessToken, result.refreshToken);
  setCallphoneDeviceCredential(remembered.deviceId, remembered.deviceKey);
  openVault(remembered.userId);
  saveDevice(remembered.deviceId, remembered.deviceKey);
  rememberDevice(remembered);
  await request("GET", "/api/v1/mobile/devices/current");
  if (attempt !== loginGeneration) throw new Error("登录请求已被替换");
  restoreCallQueue();
}
export async function loginWithQr(payload: PairingPayload, displayName: string) {
  if (payload.version !== 2 || !payload.serviceUrl || !payload.tenantId) throw new Error("请在电脑创建新版登录配对二维码");
  if (hasUnfinishedCall() || hasUnsafeResults()) throw new Error("请先安全保存当前通话结果");
  verifyRememberedDeviceStorage();
  const attempt = ++loginGeneration;
  clearCallState(); closeVault(); clearAccessToken();
  saveConnectionSettings(payload.serviceUrl, payload.tenantId);
  try {
    const result = await publicRequest<DeviceSessionResponse>("POST", "/api/v1/mobile/session/scan", {
      pairingId: payload.pairingId, pairingCode: payload.code, loginSecret: payload.loginSecret, displayName,
    });
    if (!result?.deviceKey) throw new Error("扫码登录失败，请在电脑重新生成二维码");
    await installDeviceSession(result, { ...connectionSettings(), userId: result.userId, deviceId: result.deviceId, deviceKey: result.deviceKey }, attempt);
  } catch (e) {
    if (attempt === loginGeneration) { clearAccessToken(); closeVault(); }
    throw e;
  }
}
export function resumeDeviceSession(): Promise<boolean> {
  if (hasAccessToken()) return Promise.resolve(true);
  if (restoring) return restoring;
  const attempt = ++loginGeneration;
  restoring = (async () => {
    const remembered = readRememberedDevice();
    if (!remembered) return false;
    clearCallState(); closeVault(); clearAccessToken();
    saveConnectionSettings(remembered.serviceUrl, remembered.tenantId);
    try {
      const result = await publicRequest<DeviceSessionResponse>("POST", "/api/v1/mobile/session/resume", {
        deviceId: remembered.deviceId, deviceKey: remembered.deviceKey,
      });
      await installDeviceSession(result, remembered, attempt);
      return true;
    } catch (e) {
      if (attempt === loginGeneration) {
        clearAccessToken(); closeVault();
        if (["AUTH_REQUIRED", "FORBIDDEN", "DEVICE_REVOKED"].includes((e as any).code)) forgetRememberedDevice();
      }
      throw e;
    }
  })().finally(() => { restoring = undefined; });
  return restoring;
}
