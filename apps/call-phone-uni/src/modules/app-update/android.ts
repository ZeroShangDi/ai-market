import type { AppIdentity, PlatformAdapter, Release } from "./core";
function native() {
  if (
    typeof plus === "undefined" ||
    uni.getSystemInfoSync().platform !== "android"
  )
    throw new Error("当前平台不支持安装更新，请使用 Android 正式应用");
  const a: any = plus.android;
  const invoke = (object: any, method: string, ...args: any[]) =>
    a.invoke(object, method, ...args);
  const activity = a.runtimeMainActivity();
  const manager = invoke(activity, "getPackageManager");
  return { a, invoke, activity, manager };
}
export function verifyReleaseSignature(
  publicKey: string,
  payload: string,
  signature: string,
) {
  if (!publicKey) throw new Error("尚未配置版本签名公钥，请联系管理员");
  try {
    const { a, invoke } = native();
    const decode = (value: string) =>
      invoke("android.util.Base64", "decode", value, 2);
    const keyFactory = invoke("java.security.KeyFactory", "getInstance", "RSA");
    const key = invoke(
      keyFactory,
      "generatePublic",
      a.newObject("java.security.spec.X509EncodedKeySpec", decode(publicKey)),
    );
    const verifier = invoke(
      "java.security.Signature",
      "getInstance",
      "SHA256withRSA",
    );
    invoke(verifier, "initVerify", key);
    invoke(
      verifier,
      "update",
      invoke(a.newObject("java.lang.String", payload), "getBytes", "UTF-8"),
    );
    return !!invoke(verifier, "verify", decode(signature));
  } catch {
    return false;
  }
}
export function createAndroidUpdateAdapter(channel: string): PlatformAdapter {
  async function cleanup(path: string) {
    const { a, invoke } = native();
    if (!path.includes("/callphone-updates/"))
      throw new Error("更新清理路径无效");
    const file = a.newObject(
      "java.io.File",
      plus.io.convertLocalFileSystemURL(path),
    );
    if (invoke(file, "exists") && !invoke(file, "delete"))
      throw new Error("安装包清理失败，请重试");
  }
  return {
    async identity(): Promise<AppIdentity> {
      const { a, invoke, activity, manager } = native();
      const packageName = String(invoke(activity, "getPackageName"));
      const info = invoke(manager, "getPackageInfo", packageName, 0);
      const versionCode = Number(a.getAttribute(info, "versionCode"));
      const abi = a.getAttribute("android.os.Build", "CPU_ABI");
      return {
        appId: String(plus.runtime.appid || ""),
        platform: "android",
        architecture: String(abi),
        channel,
        versionCode,
        versionName: String(a.getAttribute(info, "versionName")),
        baseVersionCode: versionCode,
        packageName,
      };
    },
    download(release: Release, signal, progress) {
      native();
      return new Promise<string>((resolve, reject) => {
        const filename = `_doc/callphone-updates/${Date.now()}-${Math.random().toString(36).slice(2)}.apk`;
        let settled = false;
        const task = plus.downloader.createDownload(
          release.artifact.url,
          { filename, timeout: 60, retry: 0 },
          async (download: any, status: number) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", abort);
            if (status === 200 && !signal.aborted) resolve(download.filename);
            else {
              try {
                await cleanup(filename);
              } catch {}
              reject(new Error("安装包下载失败，请重试"));
            }
          },
        );
        const abort = () => {
          if (settled) return;
          settled = true;
          task.abort();
          void cleanup(filename).then(
            () => reject(new Error("下载已取消")),
            () => reject(new Error("下载已取消，但临时文件清理失败")),
          );
        };
        task.addEventListener("statechanged", (download: any) => {
          if (!settled)
            progress(
              Math.min(
                100,
                Math.round(
                  (Number(download.downloadedSize || 0) /
                    release.artifact.bytes) *
                    100,
                ),
              ),
            );
        });
        if (signal.aborted) abort();
        else {
          signal.addEventListener("abort", abort, { once: true });
          task.start();
        }
      });
    },
    async verify(path, release, identity) {
      const { a, invoke, manager } = native();
      const local = plus.io.convertLocalFileSystemURL(path);
      const file = a.newObject("java.io.File", local);
      if (Number(invoke(file, "length")) !== release.artifact.bytes)
        return false;
      const input = a.newObject("java.io.FileInputStream", file);
      try {
        const channel = invoke(input, "getChannel");
        const mapMode = a.getAttribute(
          "java.nio.channels.FileChannel$MapMode",
          "READ_ONLY",
        );
        const buffer = invoke(
          channel,
          "map",
          mapMode,
          0,
          release.artifact.bytes,
        );
        const digest = invoke(
          "java.security.MessageDigest",
          "getInstance",
          "SHA-256",
        );
        invoke(digest, "update", buffer);
        const number = a.newObject(
          "java.math.BigInteger",
          1,
          invoke(digest, "digest"),
        );
        const actual = String(invoke(number, "toString", 16)).padStart(64, "0");
        if (actual.toLowerCase() !== release.artifact.sha256.toLowerCase())
          return false;
      } finally {
        invoke(input, "close");
      }
      const archive = invoke(manager, "getPackageArchiveInfo", local, 64);
      const installed = invoke(
        manager,
        "getPackageInfo",
        identity.packageName,
        64,
      );
      if (
        !archive ||
        String(a.getAttribute(archive, "packageName")) !==
          identity.packageName ||
        Number(a.getAttribute(archive, "versionCode")) !== release.versionCode
      )
        return false;
      // Conservative same-signer policy. Signing-key rotation needs a dedicated adapter.
      const expected = a.getAttribute(installed, "signatures"),
        actual = a.getAttribute(archive, "signatures");
      if (!expected?.length || expected.length !== actual?.length) return false;
      return expected.every((signature: any, i: number) =>
        invoke(signature, "equals", actual[i]),
      );
    },
    async install(path) {
      const { a, invoke, manager } = native();
      const sdk = Number(a.getAttribute("android.os.Build$VERSION", "SDK_INT"));
      if (sdk >= 26 && !invoke(manager, "canRequestPackageInstalls"))
        return "permissionDenied";
      return new Promise((resolve, reject) =>
        plus.runtime.install(
          path,
          { force: false },
          () => resolve("requested"),
          (cause: any) => {
            if (/cancel/i.test(String(cause?.message))) resolve("cancelled");
            else
              reject(new Error("系统安装未完成，请检查安装权限和安装包兼容性"));
          },
        ),
      );
    },
    cleanup,
  };
}

export function openAndroidInstallSettings() {
  const { a, invoke, activity } = native();
  const intent = a.newObject(
    "android.content.Intent",
    "android.settings.MANAGE_UNKNOWN_APP_SOURCES",
  );
  const uri = invoke(
    "android.net.Uri",
    "parse",
    "package:" + String(invoke(activity, "getPackageName")),
  );
  invoke(intent, "setData", uri);
  invoke(activity, "startActivity", intent);
}
