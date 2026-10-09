import { error } from "@/api/http";

export interface ObservedCallEvent {
  kind: "dialing" | "ended" | "unanswered";
  durationSeconds?: number;
  localRecordingAvailable?: boolean;
  recordingPath?: string;
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
      if (data.status === 2) emit({ kind: "dialing" });
      if (data.status === 3)
        emit({
          kind: "ended",
          durationSeconds: Math.max(
            0,
            Math.floor((Number(data.duration) || 0) / 1000),
          ),
          localRecordingAvailable: !!data.audioPath,
          recordingPath:
            typeof data.audioPath === "string" ? data.audioPath : undefined,
        });
      if (data.status === 5) emit({ kind: "unanswered" });
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
    try {
      plugin.callPhone!({ number: phoneNumber }, (result) =>
        result?.code === 0
          ? resolve()
          : reject(
              error("DIAL_FAILED", "拨号未能启动，请确认电话权限和设备状态"),
            ),
      );
    } catch {
      reject(error("DIAL_FAILED", "拨号未能启动，请确认电话权限和设备状态"));
    }
  });
}
function nativeCheck(
  method: "checkCallAutoRecorder" | "checkAllFilesPermission",
): Promise<boolean | null> {
  const plugin = module();
  if (!plugin?.[method]) return Promise.resolve(null);
  return new Promise((resolve) =>
    plugin[method]!((result: any) =>
      resolve(
        result?.code === 0
          ? !!(result.data?.isOpen ?? result.data?.status)
          : null,
      ),
    ),
  );
}
export const phoneCapability = {
  available: () => !!module()?.callPhone,
  observe: observePhone,
  dial,
  recordingConfigured: () => nativeCheck("checkCallAutoRecorder"),
  filePermission: () => nativeCheck("checkAllFilesPermission"),
  openRecordingSettings: () => module()?.toCallAutoRecorderPage?.(() => {}),
  openFilePermissionSettings: () =>
    module()?.toAllFilesPermissionPage?.(() => {}),
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
