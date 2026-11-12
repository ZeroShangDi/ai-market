/** Business-free coordinator. Platform APIs and version transport are injected. */
export interface AppIdentity {
  appId: string;
  platform: string;
  architecture: string;
  /** Android's ordered supported ABIs; absent for adapters with one target ABI. */
  supportedArchitectures?: string[];
  channel: string;
  versionCode: number;
  versionName: string;
  baseVersionCode: number;
  packageName: string;
}
export interface Release {
  id: string;
  appId: string;
  platform: string;
  architecture: string;
  channel: string;
  versionCode: number;
  versionName: string;
  publishedAt: string;
  notes: string;
  mandatory: boolean;
  minBaseVersionCode: number;
  artifact: {
    type: "apk";
    url: string;
    bytes: number;
    sha256: string;
    packageName: string;
  };
}
// Only the cancellation contract used by uni.request / plus.downloader.
// App's logic runtime does not guarantee browser AbortController / EventTarget.
export interface UpdateSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}
function createUpdateController() {
  let aborted = false;
  const listeners = new Set<() => void>();
  const signal: UpdateSignal = {
    get aborted() { return aborted; },
    addEventListener(_type, listener) { if (!aborted) listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
  };
  return {
    signal,
    abort() {
      if (aborted) return;
      aborted = true;
      const pending = [...listeners];
      listeners.clear();
      pending.forEach(listener => listener());
    },
  };
}
export interface VersionSource {
  latest(identity: AppIdentity, signal: UpdateSignal): Promise<Release | null>;
}
export interface PlatformAdapter {
  identity(): Promise<AppIdentity>;
  download(
    release: Release,
    signal: UpdateSignal,
    progress: (percent: number) => void,
  ): Promise<string>;
  verify(
    path: string,
    release: Release,
    identity: AppIdentity,
  ): Promise<boolean>;
  install(
    path: string,
  ): Promise<"requested" | "cancelled" | "permissionDenied">;
  cleanup(path: string): Promise<void>;
}
export type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "verifying"
  | "readyToInstall"
  | "installing"
  | "installationRequested"
  | "cancelled"
  | "failed";
export interface UpdateState {
  status: UpdateStatus;
  release?: Release;
  progress?: number;
  message?: string;
  stage?: "check" | "download" | "verify" | "install";
  retryable?: boolean;
}
export function validateRelease(value: Release, app: AppIdentity) {
  if (
    !value ||
    !value.id ||
    typeof value.notes !== "string" ||
    typeof value.mandatory !== "boolean" ||
    !Number.isFinite(Date.parse(value.publishedAt)) ||
    !value.versionName ||
    !Number.isSafeInteger(value.versionCode) ||
    value.versionCode <= 0 ||
    !Number.isSafeInteger(value.minBaseVersionCode)
  )
    throw new Error("版本发布信息格式无效");
  if (value.appId !== app.appId) throw new Error("更新应用标识不匹配，请检查是否安装了同一应用的正式包");
  if (value.platform !== app.platform) throw new Error("更新平台不匹配，请使用 Android 安装包");
  if (value.channel !== app.channel) throw new Error("更新渠道不匹配，请使用当前渠道的安装包");
  if (
    value.artifact?.type !== "apk" ||
    value.artifact.packageName !== app.packageName ||
    !Number.isSafeInteger(value.artifact.bytes) ||
    value.artifact.bytes <= 0 ||
    !/^[a-f0-9]{64}$/i.test(value.artifact.sha256) ||
    // The signed VersionSource enforces HTTPS / explicitly pinned LAN origins.
    !/^https?:\/\//.test(value.artifact.url)
  )
    throw new Error("更新制品信息不完整或不受支持");
  // A stale feed offers nothing to install. ABI/base requirements apply only
  // to a newer candidate; app/channel/package and artifact validation still run.
  if (value.versionCode > app.versionCode) {
    if (!(app.supportedArchitectures || [app.architecture]).includes(value.architecture))
      throw new Error("更新架构不匹配，安装包不支持此手机的处理器");
    if (value.minBaseVersionCode > app.baseVersionCode)
      throw new Error("当前安装基座版本过低，请下载完整安装包覆盖安装");
  }
}
export function createUpdateService(
  source: VersionSource,
  platform: PlatformAdapter,
) {
  let state: UpdateState = { status: "idle" };
  const listeners = new Set<(state: UpdateState) => void>();
  let version = 0,
    disposed = false,
    controller: ReturnType<typeof createUpdateController> | undefined;
  let checking: Promise<void> | undefined,
    downloading: Promise<void> | undefined,
    installing: Promise<void> | undefined;
  let path: string | undefined, identity: AppIdentity | undefined;
  function set(next: UpdateState) {
    if (!disposed) {
      state = next;
      listeners.forEach((fn) => fn(state));
    }
  }
  function live(v: number) {
    return !disposed && v === version;
  }
  async function clean(file?: string) {
    if (file) await platform.cleanup(file);
  }
  function fail(stage: UpdateState["stage"], cause: unknown, retryable = true) {
    set({
      status: "failed",
      release: state.release,
      stage,
      retryable,
      message: cause instanceof Error ? cause.message : "更新失败，请重试",
    });
  }
  function check(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (checking) return checking;
    if (downloading || installing || path) return Promise.resolve();
    const v = ++version;
    controller = createUpdateController();
    const signal = controller.signal;
    set({ status: "checking", release: state.release });
    checking = (async () => {
      try {
        const app = await platform.identity();
        if (!live(v)) return;
        identity = app;
        const release = await source.latest(app, signal);
        if (!live(v)) return;
        if (release) validateRelease(release, app);
        set(
          release && release.versionCode > app.versionCode
            ? { status: "available", release }
            : { status: "upToDate" },
        );
      } catch (e) {
        if (live(v)) fail("check", e);
      } finally {
        if (live(v)) checking = undefined;
      }
    })();
    return checking;
  }
  function download(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (downloading) return downloading;
    const release = state.release;
    if (!release || !identity || path || installing || checking) return Promise.resolve();
    const v = ++version;
    controller = createUpdateController();
    const signal = controller.signal;
    downloading = (async () => {
      let file: string | undefined;
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (!live(v)) return;
          set({ status: "downloading", release, progress: 0 });
          try {
            file = await platform.download(release, signal, (progress) => {
              if (live(v)) set({ status: "downloading", release, progress });
            });
            break;
          } catch (e) {
            if (!live(v)) return;
            if (attempt === 2) throw e;
          }
        }
        if (!file) throw new Error("未取得更新文件");
        if (!live(v)) {
          await clean(file);
          return;
        }
        set({ status: "verifying", release });
        const valid = await platform.verify(file, release, identity!);
        if (!live(v)) {
          await clean(file);
          return;
        }
        if (!valid) {
          await clean(file);
          file = undefined;
          fail("verify", new Error("安装包校验失败，已禁止安装"), false);
          return;
        }
        path = file;
        set({ status: "readyToInstall", release });
      } catch (e) {
        await clean(file);
        if (live(v))
          fail(state.status === "verifying" ? "verify" : "download", e);
      } finally {
        if (live(v)) downloading = undefined;
      }
    })();
    return downloading;
  }
  function install(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (installing) return installing;
    if (
      !path ||
      !["readyToInstall", "failed", "cancelled"].includes(
        state.status,
      )
    )
      return Promise.resolve();
    const v = version,
      file = path,
      release = state.release;
    set({ status: "installing", release });
    installing = (async () => {
      let verified = false;
      try {
        if (!release || !identity || !(await platform.verify(file, release, identity))) {
          path = undefined;
          await clean(file);
          if (live(v)) fail("verify", new Error("安装前校验失败，已禁止安装"), false);
          return;
        }
        verified = true;
        if (!live(v)) return;
        const result = await platform.install(file);
        if (!live(v)) return;
        if (result === "requested")
          set({
            status: "installationRequested",
            release,
            message: "已请求系统安装，请完成系统操作；重新打开后核对版本",
          });
        else if (result === "cancelled")
          set({ status: "readyToInstall", release, message: "已取消系统安装，可重新安装或取消更新" });
        else
          fail(
            "install",
            new Error("系统未允许安装，请开启此来源安装权限后重试"),
          );
      } catch (e) {
        if (!verified) {
          path = undefined;
          try { await clean(file); } catch { /* The rejected file must never remain installable. */ }
        }
        if (live(v)) fail(verified ? "install" : "verify", e, verified);
      } finally {
        if (live(v)) installing = undefined;
      }
    })();
    return installing;
  }
  async function cancel() {
    if (
      state.status === "installing" ||
      state.status === "installationRequested"
    )
      return;
    version++;
    controller?.abort();
    checking = downloading = undefined;
    const file = path;
    path = undefined;
    set({ status: "cancelled", release: state.release, message: "已取消更新" });
    await clean(file);
  }
  async function reconcileInstallation() {
    if (disposed || state.status !== "installationRequested" || !state.release)
      return;
    const app = await platform.identity();
    if (app.versionCode >= state.release.versionCode) {
      const file = path;
      path = undefined;
      await clean(file);
      set({ status: "upToDate", message: "已核对安装版本" });
    } else
      set({
        status: "readyToInstall",
        release: state.release,
        message: "当前版本尚未更新，可继续安装或取消",
      });
  }
  return {
    getState: () => state,
    check,
    download,
    install,
    cancel,
    reconcileInstallation,
    subscribe(fn: (state: UpdateState) => void) {
      listeners.add(fn);
      fn(state);
      return () => {
        listeners.delete(fn);
      };
    },
    async dispose() {
      const installingNow =
        state.status === "installing" ||
        state.status === "installationRequested";
      disposed = true;
      version++;
      controller?.abort();
      listeners.clear();
      const file = path;
      path = undefined;
      if (!installingNow) await clean(file);
    },
  };
}
