import type { AppIdentity, PlatformAdapter, Release } from "./core";
import { logger } from "@/services/logger";

// Native.js can return null without throwing. Validate each access path before
// falling back to the imported class, as in device-readiness's SDK probe.
function nativeValue<T>(a: any, target: any, field: string, parse: (value: any) => T | null): T | null {
  try {
    const value = parse(a.getAttribute(target, field));
    if (value !== null) return value;
  } catch { /* Try the imported class below. */ }
  try {
    const imported = a.importClass(target);
    const object = typeof target === "string" ? imported : target;
    const value = parse(object?.[field]);
    if (value !== null) return value;
    return parse(object?.plusGetAttribute?.(field));
  } catch { return null; }
}
const abiNames = new Set(["arm64-v8a", "armeabi-v7a", "armeabi", "x86_64", "x86", "mips64", "mips", "riscv64"]);
function abiName(value: unknown): string | null {
  return typeof value === "string" && abiNames.has(value.trim()) ? value.trim() : null;
}
function abiList(value: any): string[] | null {
  if (!value || typeof value === "string" || !Number.isInteger(value.length) || value.length < 1 || value.length > 16) return null;
  const result: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const abi = abiName(value[i]);
    if (abi && !result.includes(abi)) result.push(abi);
  }
  return result.length ? result : null;
}
function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
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
      const packageName = invoke(activity, "getPackageName");
      if (typeof packageName !== "string" || !/^[A-Za-z0-9_.]+$/.test(packageName))
        throw new Error("无法读取当前应用包名，请重新打开应用后重试");
      const info = invoke(manager, "getPackageInfo", packageName, 0);
      let versionCode = nativeValue(a, info, "versionCode", positiveInteger);
      if (versionCode === null) {
        // Android 9+ exposes the actual installed APK version as a public method.
        try { versionCode = positiveInteger(invoke(info, "getLongVersionCode")); } catch { /* Fail explicitly below. */ }
      }
      if (versionCode === null) throw new Error("无法读取当前安装版本，请重新打开应用后重试");
      const versionName = nativeValue(a, info, "versionName", value => typeof value === "string" && value.trim() ? value.trim() : null);
      if (!versionName) throw new Error("无法读取当前版本名称，请重新打开应用后重试");
      const appId = plus.runtime.appid;
      if (appId === "HBuilder") throw new Error("调试基座不支持正式更新，请安装正式应用包");
      if (typeof appId !== "string" || !appId.trim()) throw new Error("无法读取当前应用标识，请重新打开应用后重试");
      // SUPPORTED_ABIS describes what can actually be installed on this device;
      // CPU_ABI is deprecated and can describe only the current 32-bit process.
      const supported = nativeValue(a, "android.os.Build", "SUPPORTED_ABIS", abiList);
      const legacy = supported ? null : nativeValue(a, "android.os.Build", "CPU_ABI", abiName);
      const supportedArchitectures = supported || (legacy ? [legacy] : null);
      if (!supportedArchitectures) throw new Error("无法读取手机支持的架构，请重新打开应用后重试");
      const identity: AppIdentity = {
        appId: appId.trim(),
        platform: "android",
        architecture: supportedArchitectures[0],
        supportedArchitectures,
        channel,
        versionCode,
        versionName,
        baseVersionCode: versionCode,
        packageName,
      };
      logger.info("update", "identity.read", {
        appId: identity.appId, packageName, platform: identity.platform,
        architecture: identity.architecture, supportedArchitectures, channel, versionCode,
      });
      return identity;
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
      let stage = "file";
      const reject = (code: string, message: string): never => {
        logger.warn("update", "artifact.verify_failed", { stage, code });
        throw new Error(message);
      };
      try {
        const local = plus.io.convertLocalFileSystemURL(path);
        const file = a.newObject("java.io.File", local);
        if (Number(invoke(file, "length")) !== release.artifact.bytes)
          reject("SIZE_MISMATCH", "安装包大小不符，请重新下载");
        stage = "digest";
        const input = a.newObject("java.io.FileInputStream", file);
        try {
          const channel = invoke(input, "getChannel");
          const mapMode = nativeValue(a, "java.nio.channels.FileChannel$MapMode", "READ_ONLY", value => value == null ? null : value);
          if (mapMode === null) reject("MAP_MODE_UNAVAILABLE", "无法读取文件校验接口，请重新打开应用后重试");
          const buffer = invoke(channel, "map", mapMode, 0, release.artifact.bytes);
          const digest = invoke("java.security.MessageDigest", "getInstance", "SHA-256");
          invoke(digest, "update", buffer);
          const number = a.newObject("java.math.BigInteger", 1, invoke(digest, "digest"));
          const actual = String(invoke(number, "toString", 16)).padStart(64, "0");
          if (actual.toLowerCase() !== release.artifact.sha256.toLowerCase())
            reject("DIGEST_MISMATCH", "安装包内容校验不符，请重新下载");
        } finally { invoke(input, "close"); }
        stage = "package";
        const archive = invoke(manager, "getPackageArchiveInfo", local, 64);
        if (!archive) reject("ARCHIVE_UNREADABLE", "系统无法识别安装包，请重新下载");
        const packageName = nativeValue(a, archive, "packageName", value => typeof value === "string" && value ? value : null);
        let versionCode = nativeValue(a, archive, "versionCode", positiveInteger);
        if (versionCode === null) {
          try { versionCode = positiveInteger(invoke(archive, "getLongVersionCode")); } catch { /* Fail closed below. */ }
        }
        if (packageName === null || versionCode === null)
          reject("PACKAGE_INFO_UNAVAILABLE", "无法读取安装包版本或包名，已禁止安装");
        if (packageName !== identity.packageName || packageName !== release.artifact.packageName)
          reject("PACKAGE_MISMATCH", "安装包与当前应用不匹配，已禁止安装");
        if (versionCode !== release.versionCode)
          reject("VERSION_MISMATCH", "安装包版本与更新清单不符，已禁止安装");
        stage = "certificate";
        const installed = invoke(manager, "getPackageInfo", identity.packageName, 64);
        // Native.js may expose Java arrays as array-like objects without .every().
        const signatures = (value: any): any[] | null => {
          if (!value || typeof value === "string" || !Number.isInteger(value.length) || value.length < 1 || value.length > 16) return null;
          const result = [];
          for (let i = 0; i < value.length; i++) { if (!value[i]) return null; result.push(value[i]); }
          return result;
        };
        const expected = nativeValue(a, installed, "signatures", signatures);
        const actual = nativeValue(a, archive, "signatures", signatures);
        if (!expected || !actual) reject("CERTIFICATE_UNAVAILABLE", "无法读取安装包签名证书，已禁止安装");
        // Compare signer sets, not Android's incidental array ordering. No key rotation bypass.
        if (expected!.length !== actual!.length || !expected!.every(signature => actual!.some(candidate => invoke(signature, "equals", candidate) === true)))
          reject("CERTIFICATE_MISMATCH", "安装包签名与已安装应用不一致，已禁止安装");
        logger.info("update", "artifact.verified", { versionCode: release.versionCode });
        return true;
      } catch (error) {
        if (error instanceof Error && /安装包|文件校验接口/.test(error.message)) throw error;
        logger.warn("update", "artifact.verify_error", { stage });
        throw new Error(`安装包校验接口异常（${stage}），请重试或导出诊断日志`);
      }
    },
    async install(path) {
      const { a, invoke, manager } = native();
      const sdk = nativeValue(a, "android.os.Build$VERSION", "SDK_INT", positiveInteger);
      if (sdk === null) throw new Error("无法读取 Android 版本，请重试后再安装更新");
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
