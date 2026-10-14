import type { Release, VersionSource } from "./core";
export function httpsOrigin(url: string) {
  const match = /^https:\/\/([a-z0-9.-]+(?::\d+)?)(?:\/[^\s#]*)?$/i.exec(url);
  if (!match) throw new Error("更新地址必须使用受信 HTTPS 地址");
  return "https://" + match[1].toLowerCase();
}
// HTTP is permitted only for an explicitly pinned private / tailnet IPv4 origin.
export function updateOrigin(url: string, lanOrigins: readonly string[] = []) {
  if (/^https:\/\//i.test(url)) return httpsOrigin(url);
  const match = /^http:\/\/((?:\d{1,3}\.){3}\d{1,3})(:\d{1,5})?(?:\/[^\s#]*)?$/.exec(url);
  if (!match) throw new Error('更新地址必须使用 HTTPS 或已配置的局域网地址');
  const parts = match[1].split('.');
  const ip = parts.map(Number);
  if (parts.some((part, i) => String(ip[i]) !== part || ip[i] > 255) ||
      !(ip[0] === 10 || ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31 || ip[0] === 192 && ip[1] === 168 || ip[0] === 100 && ip[1] >= 64 && ip[1] <= 127) ||
      match[2] && (Number(match[2].slice(1)) < 1 || Number(match[2].slice(1)) > 65535)) {
    throw new Error('HTTP 更新仅允许明确配置的私有局域网 IP');
  }
  const origin = 'http://' + match[1] + (match[2] || '');
  if (!lanOrigins.includes(origin)) throw new Error('局域网更新地址未获配置授权');
  return origin;
}
// Signature covers the exact UTF-8 payload string, before parsing release metadata.
// The public key is provisioned with the app, never taken from the server response.
export function createSignedReleaseSource(
  url: string,
  allowedOrigins: string[],
  verify: (payload: string, signature: string) => boolean,
  lanOrigins: readonly string[] = [],
): VersionSource {
  return {
    async latest(_identity, signal) {
      if (!url) throw new Error("尚未配置版本发布源，请联系管理员");
      updateOrigin(url, lanOrigins);
      const envelope = await new Promise<{
        payload: string;
        signature: string;
      }>((resolve, reject) => {
        const abort = () => {
          task.abort();
          reject(new Error("已取消检查"));
        };
        const task = uni.request({
          url,
          method: "GET",
          timeout: 15000,
          success: (result) => {
            if (result.statusCode !== 200)
              return reject(new Error("版本服务暂时不可用，请重试"));
            resolve(result.data as any);
          },
          fail: () => reject(new Error("无法连接版本服务，请检查网络后重试")),
          complete: () => signal.removeEventListener("abort", abort),
        });
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
      if (
        typeof envelope?.payload !== "string" ||
        envelope.payload.length > 100000 ||
        typeof envelope.signature !== "string" ||
        !verify(envelope.payload, envelope.signature)
      )
        throw new Error("版本发布签名校验失败，已拒绝更新");
      const manifest = JSON.parse(envelope.payload) as {
        release: Release | null;
      };
      if (!("release" in manifest)) throw new Error("版本发布信息格式无效");
      if (manifest.release !== null) {
        const origin = updateOrigin(manifest.release?.artifact?.url || "", lanOrigins);
        if (!allowedOrigins.includes(origin))
          throw new Error("安装包下载域名未获发布配置授权");
      }
      return manifest.release;
    },
  };
}
