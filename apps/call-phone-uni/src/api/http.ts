import { connectionSettings } from "@/config";
import type { ApiError } from "@/types/mobile";

let accessToken = "",
  refreshToken = "";
let callphoneDevice: { id: string; key: string } | undefined;
let refreshing: Promise<void> | undefined;
let sessionVersion = 0;
let deviceVersion = 0;
const sessionObservers = new Set<() => void>();
export const getSessionVersion = () => sessionVersion;
export function onSessionChange(observer: () => void) {
  sessionObservers.add(observer);
  return () => {
    sessionObservers.delete(observer);
  };
}
function changedSession() {
  sessionVersion++;
  refreshing = undefined;
  sessionObservers.forEach((observer) => observer());
}
export function setAccessToken(token: string, refresh = "") {
  accessToken = token;
  refreshToken = refresh;
  changedSession();
}
export function clearAccessToken() {
  accessToken = "";
  refreshToken = "";
  callphoneDevice = undefined;
  changedSession();
}
export function hasAccessToken() {
  return !!accessToken;
}
export function setCallphoneDeviceCredential(id: string, key: string) {
  callphoneDevice = { id, key };
  deviceVersion++;
}
export function clearCallphoneDeviceCredential() {
  callphoneDevice = undefined;
  deviceVersion++;
}
export function hasCallphoneDeviceCredential() {
  return !!callphoneDevice;
}
export function error(
  code: string,
  message: string,
  status?: number,
): ApiError {
  return Object.assign(new Error(message), { code, status });
}
export function messageOf(err: unknown) {
  return err instanceof Error ? err.message : "请求失败，请重试";
}

function headers(idempotencyKey?: string) {
  return {
    "tenant-id": connectionSettings().tenantId,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(callphoneDevice
      ? {
          "X-Callphone-Device-Id": callphoneDevice.id,
          "X-Callphone-Device-Key": callphoneDevice.key,
        }
      : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}
function responseError(value: any, status: number) {
  const code =
    value?.error?.code ||
    (value?.code === 401 || status === 401
      ? "AUTH_REQUIRED"
      : value?.code === 403 || status === 403
        ? "FORBIDDEN"
        : value?.code === 1_031_000_001
          ? "DEVICE_REVOKED"
          : String(value?.code || "SERVICE_UNAVAILABLE"));
  return error(
    code,
    value?.error?.message || value?.msg || "服务暂时不可用",
    status,
  );
}
export function unwrapResponse<T>(value: any, status: number): T {
  if (
    status < 200 ||
    status >= 300 ||
    value?.error ||
    (value?.code !== undefined && value.code !== 0)
  )
    throw responseError(value, status);
  if (!value || typeof value !== "object" || !("data" in value))
    throw error("INVALID_RESPONSE", "客户侧数据服务返回格式不正确");
  return value.data as T;
}
async function send(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  key?: string,
) {
  const { serviceUrl } = connectionSettings();
  if (!serviceUrl)
    throw error("API_NOT_CONFIGURED", "请先在登录页配置客户侧数据服务地址");
  return new Promise<UniApp.RequestSuccessCallbackResult>((resolve, reject) =>
    uni.request({
      url: serviceUrl + path,
      method,
      data: body as any,
      timeout: 15000,
      header: headers(key),
      success: resolve,
      fail: () =>
        reject(error("SERVICE_UNAVAILABLE", "客户侧数据服务暂时不可达")),
    }),
  );
}
export async function publicRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const result = await send(method, path, body);
  return unwrapResponse<T>(result.data, result.statusCode);
}
// Yudao captcha uses its own ResponseModel rather than the business API envelope.
export async function captchaRequest<T>(
  action: "get" | "check",
  body: unknown,
): Promise<T> {
  const result = await send(
    "POST",
    "/admin-api/system/captcha/" + action,
    body,
  );
  const value = result.data as any;
  if (result.statusCode !== 200 || value?.repCode !== "0000")
    throw error(
      "CAPTCHA_FAILED",
      value?.repMsg || value?.msg || "登录验证失败，请重试",
    );
  return value.repData as T;
}
async function refreshSession() {
  if (!refreshToken) throw error("AUTH_REQUIRED", "登录已过期，请重新登录");
  if (!refreshing) {
    const version = sessionVersion;
    refreshing = publicRequest<{ accessToken: string; refreshToken: string }>(
      "POST",
      "/admin-api/system/auth/refresh-token?refreshToken=" +
        encodeURIComponent(refreshToken),
    )
      .then((result) => {
        if (version !== sessionVersion)
          throw error("AUTH_REQUIRED", "账户会话已变更");
        if (!result?.accessToken || !result?.refreshToken)
          throw error("INVALID_RESPONSE", "登录刷新返回格式不正确");
        accessToken = result.accessToken;
        refreshToken = result.refreshToken;
      })
      .finally(() => {
        if (version === sessionVersion) refreshing = undefined;
      });
  }
  return refreshing;
}
function assertSession(version: number, device: number) {
  if (version !== sessionVersion || device !== deviceVersion)
    throw error("AUTH_REQUIRED", "账户或设备会话已变更，请重新加载");
}
// JSON and file requests share refresh coordination and credential-generation checks.
async function authenticated<T>(
  operation: () => Promise<{ statusCode: number; data?: any }>,
  accept: (result: any) => T,
): Promise<T> {
  if (!accessToken)
    throw error("AUTH_REQUIRED", "请先登录并获取客户侧数据服务授权");
  const version = sessionVersion,
    device = deviceVersion,
    token = accessToken;
  try {
    let result = await operation();
    assertSession(version, device);
    if (
      result.statusCode === 401 ||
      result.data?.code === 401 ||
      result.data?.error?.code === "AUTH_REQUIRED"
    ) {
      // Another concurrent request may already have refreshed this token.
      if (token === accessToken) await refreshSession();
      assertSession(version, device);
      result = await operation();
    }
    assertSession(version, device);
    return accept(result);
  } catch (e) {
    assertSession(version, device);
    if ((e as ApiError).code === "AUTH_REQUIRED") clearAccessToken();
    if ((e as ApiError).code === "DEVICE_REVOKED")
      clearCallphoneDeviceCredential();
    throw e;
  }
}
export function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  return authenticated(
    () => send(method, path, body, key),
    (result) => unwrapResponse<T>(result.data, result.statusCode),
  );
}
export async function checkDataService(): Promise<string> {
  if (!connectionSettings().serviceUrl) return "未配置客户侧数据服务地址";
  const result = await send("GET", "/api/v1/mobile/bootstrap");
  const code = (result.data as any)?.code;
  if (
    result.statusCode === 401 ||
    result.statusCode === 403 ||
    code === 401 ||
    code === 403
  )
    return "服务可达，需完成账户授权";
  if (result.statusCode === 404 || code === 404)
    return "服务可达，但移动端接口尚未实现";
  unwrapResponse(result.data, result.statusCode);
  return "客户侧数据服务可达";
}
export async function uploadRecording(
  callId: string,
  filePath: string,
  uploadId: string,
): Promise<void> {
  if (!accessToken || !callphoneDevice)
    throw error("AUTH_REQUIRED", "请先登录并连接配对设备");
  if (!filePath || /^https?:\/\//i.test(filePath))
    throw error("UPLOAD_INCOMPLETE", "本机录音文件不可用");
  return authenticated(
    async () => {
      const result = await new Promise<UniApp.UploadFileSuccessCallbackResult>(
        (resolve, reject) =>
          uni.uploadFile({
            url: `${connectionSettings().serviceUrl}/api/v1/mobile/calls/${encodeURIComponent(callId)}/recording`,
            filePath,
            name: "file",
            formData: { upload_id: uploadId },
            timeout: 60000,
            header: headers(),
            success: resolve,
            fail: () =>
              reject(error("SERVICE_UNAVAILABLE", "录音上传失败，请稍后重试")),
          }),
      );
      let data: any;
      try {
        data =
          typeof result.data === "string"
            ? JSON.parse(result.data)
            : result.data;
      } catch {
        if (result.statusCode >= 200 && result.statusCode < 300)
          throw error("INVALID_RESPONSE", "客户侧数据服务返回格式不正确");
      }
      return { ...result, data };
    },
    (result) => {
      if (unwrapResponse<boolean>(result.data, result.statusCode) !== true)
        throw error("UPLOAD_INCOMPLETE", "录音上传未完成");
    },
  );
}

export async function downloadRecording(path: string): Promise<string> {
  if (!accessToken || !callphoneDevice)
    throw error("AUTH_REQUIRED", "请先登录并连接配对设备");
  if (!/^\/api\/v1\/mobile\/calls\/\d+\/recording$/.test(path))
    throw error("INVALID_RESPONSE", "录音地址无效");
  let temporaryPath = "";
  try {
    return await authenticated(
      () =>
        new Promise<UniApp.DownloadSuccessData>((resolve, reject) =>
          uni.downloadFile({
            url: connectionSettings().serviceUrl + path,
            timeout: 60000,
            header: headers(),
            success: (result) => {
              temporaryPath = result.tempFilePath || "";
              resolve(result);
            },
            fail: () =>
              reject(error("SERVICE_UNAVAILABLE", "录音下载失败，请稍后重试")),
          }),
        ),
      (result: UniApp.DownloadSuccessData) => {
        if (
          result.statusCode < 200 ||
          result.statusCode >= 300 ||
          !result.tempFilePath
        )
          throw error(
            result.statusCode === 401
              ? "AUTH_REQUIRED"
              : result.statusCode === 403
                ? "FORBIDDEN"
                : result.statusCode === 404
                  ? "NOT_FOUND"
                  : "SERVICE_UNAVAILABLE",
            result.statusCode === 401
              ? "登录已过期，请重新登录"
              : result.statusCode === 403
                ? "当前账号无权播放录音"
                : result.statusCode === 404
                  ? "录音不存在或尚未上传"
                  : "录音服务暂时不可用，请重试",
            result.statusCode,
          );
        return result.tempFilePath;
      },
    );
  } catch (e) {
    if (temporaryPath && typeof plus !== "undefined")
      plus.io.resolveLocalFileSystemURL(
        temporaryPath,
        (entry) =>
          entry.remove(
            () => {},
            () => {},
          ),
        () => {},
      );
    throw e;
  }
}
