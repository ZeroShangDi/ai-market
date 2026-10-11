import { error } from "@/api/http";

export interface ObservedCallEvent {
  kind: "dialing" | "ended" | "unanswered";
  durationSeconds?: number;
  localRecordingAvailable?: boolean;
  recordingPath?: string;
  endedAt?: string;
}
type NativeModule = {
  callPhone?: (
    args: { number: string },
    callback: (result: any) => void,
  ) => void;
  registerListener?: (callback: (result: any) => void) => void;
  unRegisterListener?: (callback: (result: any) => void) => void;
  checkCallAutoRecorder?: (callback: (result: any) => void) => void;
  checkAllFilesPermission?: (callback: (result: any) => void) => void;
  toCallAutoRecorderPage?: (callback: (result: any) => void) => void;
  toAllFilesPermissionPage?: (callback: (result: any) => void) => void;
};

let nativeModule: NativeModule | undefined;
let listenerRegistered = false;
let dialedNumber = "";
let incomingCall = false;
const normalizeNumber = (value: string) => value.replace(/[^+0-9]/g, "");
const observers = new Set<(event: ObservedCallEvent) => void>();
function module(): NativeModule | undefined {
  // #ifdef APP-PLUS
  if (uni.getSystemInfoSync().platform === "android") {
    try {
      nativeModule ||= uni.requireNativePlugin(
        "leven-call-CallModule",
      ) as NativeModule;
    } catch {
      return undefined;
    }
  }
  // #endif
  return nativeModule;
}
function emit(event: ObservedCallEvent) {
  observers.forEach((fn) => fn(event));
}
export function observePhone(fn: (event: ObservedCallEvent) => void) {
  observers.add(fn);
  const plugin = module();
  if (plugin?.registerListener && !listenerRegistered) {
    plugin.registerListener((result) => {
      if (result?.code !== 0 || !result?.data) return;
      const data = result.data;
      if (data.status === 1) {
        incomingCall = true;
        return;
      }
      if (data.isIncoming === true) incomingCall = true;
      if (incomingCall && (!data.phoneNumber || normalizeNumber(String(data.phoneNumber)) !== dialedNumber || data.isIncoming === true)) {
        if (data.status === 3 || data.status === 4) incomingCall = false;
        return;
      }
      if (
        !dialedNumber ||
        (data.phoneNumber &&
          normalizeNumber(String(data.phoneNumber)) !== dialedNumber)
      )
        return;
      if (data.status === 2) emit({ kind: "dialing" });
      if (data.status === 3)
        emit({
          kind: "ended",
          endedAt: new Date().toISOString(),
          durationSeconds: Math.max(
            0,
            Math.floor((Number(data.duration) || 0) / 1000),
          ),
          localRecordingAvailable: !!data.audioPath,
          recordingPath:
            typeof data.audioPath === "string" ? data.audioPath : undefined,
        });
      if (data.status === 5)
        emit({ kind: "unanswered", endedAt: new Date().toISOString() });
    });
    listenerRegistered = true;
  }
  return () => {
    observers.delete(fn);
    if (!observers.size && listenerRegistered) {
      plugin?.unRegisterListener?.(() => {});
      listenerRegistered = false;
    }
  };
}
export function dial(phoneNumber: string): Promise<void> {
  const plugin = module();
  if (!plugin?.callPhone)
    return Promise.reject(
      error(
        "NATIVE_PLUGIN_UNAVAILABLE",
        "当前设备未安装 Android 拨号插件，请使用含插件的自定义基座",
      ),
    );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(error("DIAL_TIMEOUT", "拨号插件未回应，请检查本机实际通话状态")),
      15000,
    );
    try {
      dialedNumber = normalizeNumber(phoneNumber);
      incomingCall = false;
      plugin.callPhone!({ number: phoneNumber }, (result) => {
        clearTimeout(timer);
        return result?.code === 0
          ? resolve()
          : reject(
              error("DIAL_FAILED", "拨号未能启动，请确认电话权限和设备状态"),
            );
      });
    } catch {
      clearTimeout(timer);
      reject(error("DIAL_FAILED", "拨号未能启动，请确认电话权限和设备状态"));
    }
  });
}
function nativeCheck(
  method: "checkCallAutoRecorder" | "checkAllFilesPermission",
): Promise<boolean | null> {
  const plugin = module();
  if (!plugin?.[method]) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(error("PERMISSION_TIMEOUT", "权限检查超时，请返回后重试")),
      8000,
    );
    try {
      plugin[method]!((result: any) => {
        clearTimeout(timer);
        if (result?.code !== 0)
          reject(
            error("PERMISSION_CHECK_FAILED", "权限检查失败，请检查系统设置"),
          );
        else resolve(!!(result.data?.isOpen ?? result.data?.status));
      });
    } catch {
      clearTimeout(timer);
      reject(error("PERMISSION_CHECK_FAILED", "无法读取权限，请重试"));
    }
  });
}
function openSettings(
  method: "toCallAutoRecorderPage" | "toAllFilesPermissionPage",
) {
  const plugin = module();
  if (!plugin?.[method])
    throw error("NATIVE_PLUGIN_UNAVAILABLE", "当前平台不支持此设置入口");
  try {
    plugin[method]!((result: any) => {
      if (result?.code && result.code !== 0)
        uni.showToast({ title: "打开系统设置失败，请手工检查", icon: "none" });
    });
  } catch {
    throw error("SETTINGS_FAILED", "打开系统设置失败，请手工检查");
  }
}

export const phoneCapability = {
  available: () => !!module()?.callPhone,
  observe: observePhone,
  dial,
  recordingConfigured: () => nativeCheck("checkCallAutoRecorder"),
  filePermission: () => nativeCheck("checkAllFilesPermission"),
  openRecordingSettings: () => openSettings("toCallAutoRecorderPage"),
  openFilePermissionSettings: () => openSettings("toAllFilesPermissionPage"),
  async openWeChat() {
    // #ifdef APP-PLUS
    try {
      const app = plus.runtime.isApplicationExist({
        pname: "com.tencent.mm",
        action: "weixin://",
      });
      if (!app) return false;
      plus.runtime.openURL("weixin://");
      return true;
    } catch {
      return false;
    }
    // #endif
    return false;
  },
};
