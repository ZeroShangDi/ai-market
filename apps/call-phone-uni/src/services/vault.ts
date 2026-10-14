import { ref } from "vue";
import { connectionSettings } from "@/config";
import { secureStore } from "@/native/secure-store";
export const persistenceStatus = ref("");
let accountSlot = "";
let deviceId = "";
export function openVault(userId: string) {
  if (!userId) throw new Error("无法确认当前账户身份");
  const settings = connectionSettings();
  accountSlot = JSON.stringify([
    settings.serviceUrl,
    settings.tenantId,
    userId,
  ]);
  deviceId = "";
  persistenceStatus.value = secureStore.available()
    ? "系统安全存储已启用"
    : "当前平台不支持安全存储，关闭应用会丢失未同步结果";
}
export function closeVault() {
  accountSlot = "";
  deviceId = "";
}
export function setVaultDevice(id: string) {
  deviceId = id;
}
export function vaultScope() {
  return accountSlot && deviceId ? JSON.stringify([accountSlot, deviceId]) : "";
}
/** Non-secret preference identity: server, workspace (tenant), account; no device key. */
export function accountPreferenceScope() {
  return accountSlot;
}
export function readDevice() {
  if (!accountSlot || !secureStore.available()) return undefined;
  return secureStore.read<{ id: string; key: string }>("device:" + accountSlot);
}
export function saveDevice(id: string, key: string) {
  if (!accountSlot) throw new Error("请先重新登录以确认账户身份");
  if (secureStore.available())
    secureStore.write("device:" + accountSlot, { id, key });
  setVaultDevice(id);
}
export function forgetDevice() {
  if (accountSlot && secureStore.available())
    secureStore.remove("device:" + accountSlot);
  deviceId = "";
}
export function readQueue<T>(): T | undefined {
  const scope = vaultScope();
  return scope && secureStore.available()
    ? secureStore.read<T>("queue:" + scope)
    : undefined;
}
export function writeQueue(value: unknown): boolean {
  if (!secureStore.available()) return false;
  const scope = vaultScope();
  if (!scope) throw new Error("未确认账户和设备，无法安全保存通话");
  try {
    secureStore.write("queue:" + scope, value);
    return true;
  } catch (e) {
    persistenceStatus.value = "安全保存失败，请保持应用打开并重试";
    throw e;
  }
}

export function verifyDeviceStorage() {
  if (!accountSlot) throw new Error("请先重新登录以确认账户身份");
  if (!secureStore.available()) return;
  const slot = "probe:" + accountSlot;
  const nonce = Date.now().toString(36) + Math.random().toString(36);
  secureStore.write(slot, { nonce });
  if (secureStore.read<{ nonce: string }>(slot)?.nonce !== nonce) throw new Error("设备安全存储校验失败，暂不能配对");
  secureStore.remove(slot);
}
