import { loginWithQr } from "./session";
import { secureStore } from "@/native/secure-store";
import { parsePairingPayload } from "./pairing";
import { connectionSettings, normalizeServiceUrl } from "@/config";
import { getSessionVersion } from "@/api/http";
import { mobileService } from "./mobile";
import {
  clearCallState,
  restoreCallQueue,
  hasUnfinishedCall,
  hasUnsafeResults,
} from "./calls";

let busy = false;
export async function scanAndPair(displayName = "我的手机") {
  // #ifdef H5
  if (typeof document !== "undefined")
    throw new Error("扫码登录请使用 Android 手机 App");
  // #endif
  // #ifndef H5
  if (busy) return false;
  if (hasUnfinishedCall() || hasUnsafeResults())
    throw new Error("请先安全保存当前通话结果，再连接设备");
  if (!secureStore.available()) throw new Error("扫码登录需要 Android 安全存储，请使用手机 App");
  busy = true;
  const session = getSessionVersion();
  try {
    const raw = await new Promise<string | null>((resolve, reject) =>
      uni.scanCode({
        onlyFromCamera: true,
        scanType: ["qrCode"],
        success: (result) => resolve(result.result),
        fail: (error) =>
          /cancel/i.test(error.errMsg || "")
            ? resolve(null)
            : reject(new Error("无法扫码，请检查相机权限")),
      }),
    );
    if (raw === null || session !== getSessionVersion()) return false;
    const payload = parsePairingPayload(raw),
      settings = connectionSettings();
    if (payload.version === 2) {
      await loginWithQr(payload, displayName);
      return true;
    }
    if (payload.tenantId && payload.tenantId !== settings.tenantId)
      throw new Error("二维码工作区与当前登录不同");
    if (
      payload.serviceUrl &&
      normalizeServiceUrl(payload.serviceUrl) !==
        normalizeServiceUrl(settings.serviceUrl)
    )
      throw new Error("二维码服务地址与当前登录不同，请登录对应服务");
    const confirmed = await new Promise<boolean>((resolve) =>
      uni.showModal({
        title: "连接电脑",
        content: "配对后，电脑发起的外呼将在本手机前台自动拨打。",
        success: (result) => resolve(!!result.confirm),
        fail: () => resolve(false),
      }),
    );
    if (!confirmed || session !== getSessionVersion()) return false;
    if (hasUnfinishedCall() || hasUnsafeResults())
      throw new Error("请先保存当前通话结果");
    await mobileService.claimPairing(
      payload.code,
      displayName,
      uni.getSystemInfoSync().platform === "ios" ? "ios" : "android",
    );
    clearCallState();
    restoreCallQueue();
    return true;
  } finally {
    busy = false;
  }
  // #endif
}
