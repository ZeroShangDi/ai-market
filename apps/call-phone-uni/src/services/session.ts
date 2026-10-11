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
  uni.reLaunch({ url: "/pages/login/index" });
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
