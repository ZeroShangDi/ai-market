import type { Release, VersionSource } from "./core";
export function httpsOrigin(url: string) {
  const match = /^https:\/\/([a-z0-9.-]+(?::\d+)?)(?:\/[^\s#]*)?$/i.exec(url);
  if (!match) throw new Error("更新地址必须使用受信 HTTPS 地址");
  return "https://" + match[1].toLowerCase();
}
// Signature covers the exact UTF-8 payload string, before parsing release metadata.
// The public key is provisioned with the app, never taken from the server response.
export function createSignedReleaseSource(
  url: string,
  allowedOrigins: string[],
  verify: (payload: string, signature: string) => boolean,
): VersionSource {
  return {
    async latest(_identity, signal) {
      if (!url) throw new Error("尚未配置版本发布源，请联系管理员");
      httpsOrigin(url);
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
        const origin = httpsOrigin(manifest.release?.artifact?.url || "");
        if (!allowedOrigins.includes(origin))
          throw new Error("安装包下载域名未获发布配置授权");
      }
      return manifest.release;
    },
  };
}
