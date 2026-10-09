// Only non-secret connection preferences are persisted. Credentials remain in memory.
export const mockEnabled =
  import.meta.env.DEV && import.meta.env.VITE_MOBILE_MOCK === "true";
const defaults = {
  serviceUrl: import.meta.env.VITE_CUSTOMER_API_BASE_URL || "",
  tenantId: import.meta.env.VITE_CUSTOMER_TENANT_ID || "1",
};
export function normalizeServiceUrl(value: string) {
  const url = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s?#@]+(?::[0-9]+)?(?:\/[^\s?#]*)?$/.test(url))
    throw new Error("请输入有效的数据服务地址（http 或 https）");
  return url;
}
export function connectionSettings() {
  const saved = uni.getStorageSync("callphone.connection");
  return {
    serviceUrl: saved?.serviceUrl || defaults.serviceUrl,
    tenantId: saved?.tenantId || defaults.tenantId,
  };
}
export function saveConnectionSettings(serviceUrl: string, tenantId: string) {
  const normalized = normalizeServiceUrl(serviceUrl);
  if (!/^[0-9]{1,19}$/.test(tenantId.trim()))
    throw new Error("请输入有效的工作区编号");
  uni.setStorageSync("callphone.connection", {
    serviceUrl: normalized,
    tenantId: tenantId.trim(),
  });
}
export const dispatchPollMs = 15000;
