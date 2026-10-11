import { secureStore } from "@/native/secure-store";
const slot = "remembered-mobile-device:v1";
export interface RememberedDevice {
  serviceUrl: string; tenantId: string; userId: string; deviceId: string; deviceKey: string;
}
export function readRememberedDevice() {
  const value = secureStore.available() ? secureStore.read<RememberedDevice>(slot) : undefined;
  if (!value || !value.serviceUrl || !/^\d+$/.test(value.tenantId) || !/^\d+$/.test(value.userId) ||
      !/^\d+$/.test(value.deviceId) || !/^[A-Za-z0-9_-]{43}$/.test(value.deviceKey)) return undefined;
  return value;
}
export function rememberDevice(value: RememberedDevice) {
  if (!secureStore.available()) throw new Error("扫码登录需要 Android 安全存储，请使用手机 App");
  secureStore.write(slot, value);
  const saved = secureStore.read<RememberedDevice>(slot);
  if (saved?.deviceId !== value.deviceId || saved?.deviceKey !== value.deviceKey) throw new Error("安全保存设备失败，请重新扫码");
}
export function forgetRememberedDevice() {
  if (secureStore.available()) secureStore.remove(slot);
}

export function verifyRememberedDeviceStorage() {
  if (!secureStore.available()) throw new Error("扫码登录需要 Android 安全存储，请使用手机 App");
  const probe = slot + ":probe";
  const nonce = Date.now().toString(36) + Math.random().toString(36);
  try {
    secureStore.write(probe, { nonce });
    if (secureStore.read<{ nonce: string }>(probe)?.nonce !== nonce) throw new Error("设备安全存储不可用，请重试");
  } finally { secureStore.remove(probe); }
}
