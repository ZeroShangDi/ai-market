import {
  publicRequest,
  request,
  setAccessToken,
  clearAccessToken,
  hasAccessToken,
} from "@/api/http";
import { mockEnabled } from "@/config";
import { clearCallState } from "./calls";
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
  clearCallState();
  clearAccessToken();
  const result = await publicRequest<{
    accessToken: string;
    refreshToken: string;
  }>("POST", "/admin-api/system/auth/login", {
    username,
    password,
    captchaVerification,
  });
  if (!result?.accessToken || !result?.refreshToken)
    throw new Error("登录返回格式不正确");
  setAccessToken(result.accessToken, result.refreshToken);
}
export async function logout() {
  try {
    if (hasAccessToken())
      await request("POST", "/admin-api/system/auth/logout");
  } finally {
    clearCallState();
    clearAccessToken();
  }
}
