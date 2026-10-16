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
function packageVersionCode(a: any, info: any): number | null {
  const value = nativeValue(a, info, "versionCode", positiveInteger);
  if (value !== null) return value;
  try { return positiveInteger(a.invoke(info, "getLongVersionCode")); } catch { return null; }
}
function rejectArtifact(code: string, message: string, details: Record<string, unknown> = {}): never {
  logger.warn("update", "artifact.rejected", { code, ...details });
  throw Object.assign(new Error(message), { code });
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
      const versionCode = packageVersionCode(a, info);
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
      try {
        const { a, invoke, manager } = native();
        const local = plus.io.convertLocalFileSystemURL(path);
        const file = a.newObject("java.io.File", local);
        const actualBytes = positiveInteger(invoke(file, "length"));
        if (actualBytes === null) rejectArtifact("APK_SIZE_UNREADABLE", "无法读取安装包大小，请重新下载");
        if (actualBytes !== release.artifact.bytes)
          rejectArtifact("APK_SIZE_MISMATCH", "安装包下载不完整，已禁止安装，请重新下载", { expectedBytes: release.artifact.bytes, actualBytes });
        const input = a.newObject("java.io.FileInputStream", file);
        try {
          const channel = invoke(input, "getChannel");
          const mapMode = nativeValue(a, "java.nio.channels.FileChannel$MapMode", "READ_ONLY",
            value => value && typeof value === "object" ? value : null);
          if (!mapMode) rejectArtifact("APK_HASH_UNREADABLE", "无法读取安装包校验数据，请重试");
          const buffer = invoke(channel, "map", mapMode, 0, release.artifact.bytes);
          const digest = invoke("java.security.MessageDigest", "getInstance", "SHA-256");
          invoke(digest, "update", buffer);
          const number = a.newObject("java.math.BigInteger", 1, invoke(digest, "digest"));
          const hash = invoke(number, "toString", 16);
          if (typeof hash !== "string" || !/^[a-f0-9]{1,64}$/i.test(hash))
            rejectArtifact("APK_HASH_UNREADABLE", "无法读取安装包校验数据，请重试");
          if (hash.padStart(64, "0").toLowerCase() !== release.artifact.sha256.toLowerCase())
            rejectArtifact("APK_HASH_MISMATCH", "安装包内容校验不一致，已禁止安装，请重新下载");
        } finally { invoke(input, "close"); }
        const archive = invoke(manager, "getPackageArchiveInfo", local, 64);
        if (!archive) rejectArtifact("APK_METADATA_UNREADABLE", "系统无法解析安装包，已禁止安装");
        const packageName = nativeValue(a, archive, "packageName", value => typeof value === "string" && /^[A-Za-z0-9_.]+$/.test(value) ? value : null);
        if (!packageName) rejectArtifact("APK_METADATA_UNREADABLE", "无法读取安装包信息，已禁止安装");
        if (packageName !== identity.packageName) rejectArtifact("APK_PACKAGE_MISMATCH", "安装包不属于当前应用，已禁止安装");
        const versionCode = packageVersionCode(a, archive);
        if (versionCode === null) rejectArtifact("APK_VERSION_UNREADABLE", "无法读取安装包版本，已禁止安装");
        if (versionCode !== release.versionCode)
          rejectArtifact("APK_VERSION_MISMATCH", "安装包版本与更新信息不一致，已禁止安装", { expectedVersion: release.versionCode, actualVersion: versionCode });
        const installed = invoke(manager, "getPackageInfo", identity.packageName, 64);
        // Read into JS strings; Native.js arrays do not guarantee Array.prototype.every.
        // Exact current certificates are still required; signing-key rotation is unsupported.
        const signatures = (info: any) => nativeValue<string[]>(a, info, "signatures", value => {
          if (!value || !Number.isInteger(value.length) || value.length < 1 || value.length > 16) return null;
          const result: string[] = [];
          for (let i = 0; i < value.length; i++) {
            const hex = invoke(value[i], "toCharsString");
            if (typeof hex !== "string" || hex.length > 65536 || !/^(?:[a-f0-9]{2})+$/i.test(hex)) return null;
            result.push(hex.toLowerCase());
          }
          return result.sort();
        });
        const expected = signatures(installed), actual = signatures(archive);
        if (!expected || !actual) rejectArtifact("APK_SIGNER_UNREADABLE", "无法读取安装包签名，已禁止安装");
        if (expected.length !== actual.length || expected.some((value, i) => value !== actual[i]))
          rejectArtifact("APK_SIGNER_MISMATCH", "安装包签名与当前应用不一致，已禁止安装");
        logger.info("update", "artifact.verified", { versionCode });
        return true;
      } catch (cause) {
        if (typeof (cause as any)?.code === "string" && (cause as any).code.startsWith("APK_")) throw cause;
        logger.error("update", "artifact.verify.failed", { code: "APK_NATIVE_VERIFY_FAILED", error: cause });
        throw Object.assign(new Error("安装包校验读取失败，请导出日志后重试"), { code: "APK_NATIVE_VERIFY_FAILED" });
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
