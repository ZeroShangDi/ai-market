// The QR carries an expiring code only, never an account token or a device key.
export interface PairingPayload {
  type: "callphone-pairing";
  version: 1 | 2;
  pairingId?: string;
  loginSecret?: string;
  code: string;
  tenantId?: string;
  serviceUrl?: string;
}
export function parsePairingPayload(raw: string): PairingPayload {
  const text = raw.trim();
  if (text.length > 4096) throw new Error("配对二维码过长");
  if (/^\d{6}$/.test(text))
    return { type: "callphone-pairing", version: 1, code: text };
  let value: any;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("这不是 Call Phone 配对二维码");
  }
  if (
    value?.type !== "callphone-pairing" ||
    (value.version !== 1 && value.version !== 2) ||
    !/^\d{6}$/.test(value.code)
  )
    throw new Error("配对二维码格式不正确或版本不受支持");
  if (value.version === 2 && (!/^[0-9]{1,19}$/.test(value.pairingId || "") || !/^[A-Za-z0-9_-]{43}$/.test(value.loginSecret || "") || !value.tenantId || !value.serviceUrl))
    throw new Error("登录二维码不完整，请在电脑重新生成");
  if (value.tenantId !== undefined && !/^\d{1,19}$/.test(value.tenantId))
    throw new Error("二维码工作区无效");
  if (value.serviceUrl !== undefined && typeof value.serviceUrl !== "string")
    throw new Error("二维码服务地址无效");
  return {
    type: value.type,
    version: value.version,
    code: value.code,
    pairingId: value.pairingId,
    loginSecret: value.loginSecret,
    tenantId: value.tenantId,
    serviceUrl: value.serviceUrl,
  };
}
