import { apiBaseUrl } from "@/config";
import type { ApiError } from "@/types/mobile";

let accessToken = "";
let callphoneDevice: { id: string; key: string } | undefined;
export function setAccessToken(token: string) {
  accessToken = token;
}
export function clearAccessToken() {
  accessToken = "";
  callphoneDevice = undefined;
}
// Pairing credentials are memory-only until the platform secure-store adapter is wired.
export function setCallphoneDeviceCredential(id: string, key: string) {
  callphoneDevice = { id, key };
}
export function clearCallphoneDeviceCredential() {
  callphoneDevice = undefined;
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

// A read-only reachability probe. An auth rejection still proves the configured
// customer data plane is reachable; it does not expose protected response data.
export async function checkDataService(): Promise<string> {
  if (!apiBaseUrl) return "未配置客户侧数据服务地址";
  const response = await new Promise<UniApp.RequestSuccessCallbackResult>(
    (resolve, reject) => {
      uni.request({
        url: apiBaseUrl + "/api/v1/mobile/bootstrap",
        method: "GET",
        timeout: 10000,
        success: resolve,
        fail: () =>
          reject(error("SERVICE_UNAVAILABLE", "无法连接客户侧数据服务")),
      });
    },
  );
  if (response.statusCode === 401 || response.statusCode === 403)
    return "服务可达，需完成账户授权";
  if (response.statusCode === 404) return "服务可达，但移动端接口尚未实现";
  if (response.statusCode >= 200 && response.statusCode < 300)
    return "客户侧数据服务可达";
  return `服务已响应，但返回异常状态（${response.statusCode}）`;
}

export async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  if (!apiBaseUrl)
    throw error("API_NOT_CONFIGURED", "尚未配置客户侧数据服务地址");
  if (!accessToken)
    throw error("AUTH_REQUIRED", "请先登录并获取客户侧数据服务授权");
  // Never log the URL, token, body or response: they may contain protected customer data.
  const response = await new Promise<UniApp.RequestSuccessCallbackResult>(
    (resolve, reject) => {
      uni.request({
        url: apiBaseUrl + path,
        method,
        data: body as any,
        timeout: 15000,
        header: {
          Authorization: `Bearer ${accessToken}`,
          ...(callphoneDevice
            ? {
                "X-Callphone-Device-Id": callphoneDevice.id,
                "X-Callphone-Device-Key": callphoneDevice.key,
              }
            : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        success: resolve,
        fail: () =>
          reject(error("SERVICE_UNAVAILABLE", "客户侧数据服务暂时不可达")),
      });
    },
  );
  const value = response.data as any;
  if (response.statusCode >= 400 || value?.error)
    throw error(
      value?.error?.code || "SERVICE_UNAVAILABLE",
      value?.error?.message || "服务暂时不可用",
      response.statusCode,
    );
  if (!value || !("data" in value))
    throw error("INVALID_RESPONSE", "客户侧数据服务返回格式不正确");
  return value.data as T;
}

export async function uploadRecording(
  callId: string,
  filePath: string,
  uploadId: string,
): Promise<void> {
  if (!apiBaseUrl)
    throw error("API_NOT_CONFIGURED", "尚未配置客户侧数据服务地址");
  if (!accessToken || !callphoneDevice)
    throw error("AUTH_REQUIRED", "请先登录并连接配对设备");
  const deviceCredential = callphoneDevice;
  if (!filePath || /^https?:\/\//i.test(filePath))
    throw error("UPLOAD_INCOMPLETE", "本机录音文件不可用");
  const response = await new Promise<UniApp.UploadFileSuccessCallbackResult>(
    (resolve, reject) => {
      uni.uploadFile({
        url: `${apiBaseUrl}/api/v1/mobile/calls/${encodeURIComponent(callId)}/recording`,
        filePath,
        name: "file",
        formData: { upload_id: uploadId },
        timeout: 60000,
        header: {
          Authorization: `Bearer ${accessToken}`,
          "X-Callphone-Device-Id": deviceCredential.id,
          "X-Callphone-Device-Key": deviceCredential.key,
        },
        success: resolve,
        fail: () =>
          reject(error("UPLOAD_INCOMPLETE", "录音上传失败，请稍后重试")),
      });
    },
  );
  let value: any;
  try {
    value =
      typeof response.data === "string"
        ? JSON.parse(response.data)
        : response.data;
  } catch {
    throw error("INVALID_RESPONSE", "客户侧数据服务返回格式不正确");
  }
  if (
    response.statusCode < 200 ||
    response.statusCode >= 300 ||
    value?.code !== 0 ||
    value?.data !== true
  ) {
    throw error(
      value?.code === 1_031_000_078
        ? "UPLOAD_INCOMPLETE"
        : "SERVICE_UNAVAILABLE",
      value?.msg || "录音上传失败",
      response.statusCode,
    );
  }
}

export async function downloadRecording(path: string): Promise<string> {
  if (!apiBaseUrl)
    throw error("API_NOT_CONFIGURED", "尚未配置客户侧数据服务地址");
  if (!accessToken || !callphoneDevice)
    throw error("AUTH_REQUIRED", "请先登录并连接配对设备");
  const deviceCredential = callphoneDevice;
  if (
    !path.startsWith("/api/v1/mobile/calls/") ||
    path.includes("..") ||
    path.startsWith("//")
  ) {
    throw error("INVALID_RESPONSE", "录音地址无效");
  }
  const response = await new Promise<UniApp.DownloadSuccessData>(
    (resolve, reject) => {
      uni.downloadFile({
        url: apiBaseUrl + path,
        timeout: 60000,
        header: {
          Authorization: `Bearer ${accessToken}`,
          "X-Callphone-Device-Id": deviceCredential.id,
          "X-Callphone-Device-Key": deviceCredential.key,
        },
        success: resolve,
        fail: () =>
          reject(error("SERVICE_UNAVAILABLE", "录音下载失败，请稍后重试")),
      });
    },
  );
  if (
    response.statusCode < 200 ||
    response.statusCode >= 300 ||
    !response.tempFilePath
  ) {
    throw error(
      "RECORDING_FORBIDDEN",
      "当前账号无权播放录音或录音不存在",
      response.statusCode,
    );
  }
  return response.tempFilePath;
}
