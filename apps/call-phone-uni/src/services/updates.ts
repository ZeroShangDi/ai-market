import { ref } from "vue";
import {
  createUpdateService,
  type UpdateState,
} from "@/modules/app-update/core";
import { createSignedReleaseSource } from "@/modules/app-update/source";
import {
  createAndroidUpdateAdapter,
  verifyReleaseSignature,
} from "@/modules/app-update/android";
import {
  hasUnfinishedCall,
  hasUnsafeResults,
  setCallStartGuard,
} from "./calls";
const url = import.meta.env.VITE_UPDATE_MANIFEST_URL || "";
const origins = (import.meta.env.VITE_UPDATE_DOWNLOAD_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const source = createSignedReleaseSource(url, origins, (payload, signature) =>
  verifyReleaseSignature(
    import.meta.env.VITE_UPDATE_PUBLIC_KEY || "",
    payload,
    signature,
  ),
);
export const updates = createUpdateService(
  source,
  createAndroidUpdateAdapter(import.meta.env.VITE_UPDATE_CHANNEL || "stable"),
  () => !hasUnfinishedCall() && !hasUnsafeResults(),
);
export const updateState = ref<UpdateState>(updates.getState());
updates.subscribe((state) => {
  updateState.value = state;
});
setCallStartGuard(() => {
  if (["installing", "installationRequested"].includes(updateState.value.status)) return "请先完成或取消系统安装并返回核对版本，再拨号";
  return updateState.value.release?.mandatory && updateState.value.status !== "upToDate"
    ? "当前版本需要更新，请在我的页面完成升级后再拨号" : "";
});

let lastCheck = 0;
const prompted = new Set<string>();
export async function checkUpdates(manual = false) {
  await updates.reconcileInstallation().catch(() => {});
  if (
    !manual &&
    (Date.now() - lastCheck < 60 * 60 * 1000 ||
      typeof plus === "undefined" ||
      !url)
  )
    return;
  lastCheck = Date.now();
  await updates.check();
  const state = updates.getState();
  if (state.status === "available" && state.release && !hasUnfinishedCall()) {
    const release = state.release;
    if (!manual && prompted.has(release.id)) return;
    prompted.add(release.id);
    uni.showModal({
      title: release.mandatory
        ? "需要更新应用"
        : "发现新版本 " + release.versionName,
      content: release.notes || "可在我的页面下载并安装更新。",
      confirmText: "下载更新",
      cancelText: "稍后处理",
      success: (result) => {
        if (result.confirm) void updates.download();
      },
    });
  } else if (manual && state.status === "upToDate")
    uni.showToast({ title: "已是最新版本", icon: "none" });
}
export const updateLabels: Record<string, string> = {
  idle: "尚未检查",
  checking: "正在检查更新",
  upToDate: "已是最新版本",
  available: "有新版本可用",
  downloading: "正在下载安装包",
  verifying: "正在校验安装包",
  readyToInstall: "安装包已校验，可安装",
  installing: "正在请求系统安装",
  installationRequested: "请完成系统安装后返回核对版本",
  cancelled: "已取消更新",
  failed: "更新失败",
  deferred: "等待通话结束并安全保存结果",
};
