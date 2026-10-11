<template>
  <view class="page"
    ><view class="wrap">
      <MobileHeader title="我的" /><PreviewBanner />
      <view class="license"
        ><text class="edition">{{
          bootstrap?.license?.edition || "Call Phone"
        }}</text
        ><text>{{ licenseText }}</text
        ><text>{{ pairedText }}</text
        ><image src="/static/figma/2-112-imgFrame.svg"
      /></view>
      <view v-if="loading" class="state">正在加载账户与设备信息…</view>
      <view v-if="errorMessage" class="state" @tap="load"
        >{{ errorMessage }} · 点击重试</view
      >
      <view class="setting" @tap="open('account')"
        ><view class="setting-icon"
          ><image src="/static/figma/2-112-imgFrame1.svg" /></view
        ><view class="setting-text"
          ><text>账户与授权</text><text>查看有效期与设备授权</text></view
        ><image class="arrow" src="/static/figma/2-112-imgFrame2.svg"
      /></view>
      <view class="setting" @tap="open('device')"
        ><view class="setting-icon"
          ><image src="/static/figma/2-112-imgFrame3.svg" /></view
        ><view class="setting-text"
          ><text>本机与配对</text
          ><text
            >{{ device?.paired_computer || "尚未配对电脑" }} ·
            {{ device?.paired ? "已连接" : "未配对" }}</text
          ></view
        ><image class="arrow" src="/static/figma/2-112-imgFrame2.svg"
      /></view>
      <view class="setting" @tap="open('diagnostics')"
        ><view class="setting-icon"
          ><image src="/static/figma/2-112-imgFrame4.svg" /></view
        ><view class="setting-text"
          ><text>诊断与帮助</text><text>权限、录音、同步状态</text></view
        ><image class="arrow" src="/static/figma/2-112-imgFrame2.svg"
      /></view>
      <view class="setting" @tap="checkUpdates(true)"
        ><view class="setting-text"
          ><text>应用更新</text
          ><text
            >{{ updateLabels[updateState.status]
            }}{{
              updateState.progress != null ? ` ${updateState.progress}%` : ""
            }}</text
          ></view
        ></view
      >
      <view v-if="updateState.release || updateState.message" class="state">
        <text>{{ updateState.message || updateState.release?.notes }}</text>
        <button
          v-if="
            ['available', 'cancelled'].includes(updateState.status) ||
            (updateState.status === 'failed' &&
              updateState.stage === 'download')
          "
          @tap="updates.download()"
        >
          下载更新
        </button>
        <button
          v-if="
            updateState.status === 'failed' && updateState.stage === 'install'
          "
          @tap="installSettings"
        >
          打开安装权限设置
        </button>
        <button
          v-if="
            ['readyToInstall', 'deferred'].includes(updateState.status) ||
            (updateState.status === 'failed' && updateState.stage === 'install')
          "
          @tap="updates.install()"
        >
          继续安装
        </button>
        <button
          v-if="
            ['downloading', 'verifying', 'readyToInstall', 'deferred'].includes(
              updateState.status,
            )
          "
          @tap="updates.cancel()"
        >
          取消更新
        </button>
      </view>
      <view class="divider" /><text class="hint">{{
        pendingCompletionCount()
          ? `有 ${pendingCompletionCount()} 条通话结果待同步`
          : "发生同步异常时，这里会显示待处理项"
      }}</text>
      <view v-if="panel" class="panel-scrim" @tap="panel = ''"
        ><view class="panel" @tap.stop>
          <text class="panel-title">{{ panelTitle }}</text>
          <template v-if="panel === 'account'"
            ><text>账户：{{ bootstrap?.user?.name || "未登录" }}</text
            ><text>工作区：{{ bootstrap?.workspace?.name || "未配置" }}</text
            ><text>授权状态：{{ licenseStatus }}</text
            ><button class="secondary" @tap="signOut">退出登录</button
            ><text
              >最后验证：{{
                bootstrap?.license?.last_verified_at
                  ? when(bootstrap.license.last_verified_at)
                  : "暂无"
              }}</text
            ></template
          >
          <template v-if="panel === 'device'"
            ><text>本机：{{ device?.name || "未配置" }}</text
            ><text
              >配对电脑：{{
                device?.paired_computer || (device?.paired ? "已连接" : "无")
              }}</text
            ><text
              >上次同步：{{
                device?.last_sync_at ? when(device.last_sync_at) : "暂无"
              }}</text
            ><view v-if="!device?.paired" class="pairing-form"
              ><text class="pairing-title">连接电脑</text
              ><text>输入电脑“电脑与配对”页面显示的六位配对码</text
              ><button
                class="secondary"
                :disabled="claimingPairing"
                @tap="scanPairing"
              >
                扫码配对</button
              ><input
                v-model="pairingCode"
                class="pairing-input code-input"
                type="digit"
                maxlength="6"
                placeholder="六位配对码"
                @input="onPairingCodeInput"
              /><input
                v-model="pairingDeviceName"
                class="pairing-input"
                maxlength="40"
                placeholder="手机名称（如：销售手机）"
              /><button
                class="primary"
                :disabled="claimingPairing"
                @tap="claimPairing"
              >
                {{ claimingPairing ? "正在配对…" : "确认配对" }}</button
              ><text class="pairing-hint"
                >{{ persistenceStatus }}；重新登录同一账户后恢复本机配对。</text
              ></view
            ><text>连通性测试：{{ connectivityStatus }}</text
            ><button
              class="secondary"
              :disabled="checkingConnectivity"
              @tap="testConnectivity"
            >
              {{
                checkingConnectivity ? "检查中…" : "测试客户侧数据服务连通性"
              }}</button
            ><button v-if="device?.paired" class="secondary" @tap="unpair">
              解绑本机
            </button></template
          >
          <template v-if="panel === 'diagnostics'"
            ><text
              >数据服务：{{ diagnosticLabel(diagnostics?.data_service) }}</text
            ><text
              >授权检查：{{ diagnosticLabel(diagnostics?.license_check) }}</text
            ><text>待同步结果：{{ pendingCompletionCount() }}</text
            ><text
              >通话插件：{{
                phoneCapability.available() ? "已检测到" : "当前环境不可用"
              }}</text
            ><text>自动录音：{{ recordingStatus }}</text
            ><text>文件权限：{{ fileStatus }}</text
            ><text>拨号测试：{{ testCallStatus }}</text
            ><text>{{ persistenceStatus }}</text>
            <view v-for="item in pending" :key="item.key">
              <text
                >通话 {{ item.id }}：{{ item.message || "等待同步"
                }}{{
                  item.durable ? "（已安全保存）" : "（尚未安全保存）"
                }}</text
              >
              <button
                v-if="item.failure === 'permanent'"
                class="secondary"
                @tap="disposeTask(item.id)"
              >
                处置无法同步的任务
              </button>
            </view>
            <button
              v-if="recordingStatus !== '已开启'"
              class="secondary"
              @tap="openNativeSettings('recording')"
            >
              设置自动录音
            </button>
            <button
              v-if="fileStatus !== '已授权'"
              class="secondary"
              @tap="openNativeSettings('files')"
            >
              设置文件权限
            </button>
            <button class="secondary" @tap="checkNative">检查本机权限</button
            ><button class="secondary" :disabled="testCallBusy" @tap="testCall">
              测试拨号 10086</button
            ><button class="secondary" @tap="retry">重试同步</button></template
          >
          <button class="close" @tap="panel = ''">完成</button>
        </view></view
      > </view
    ><TabBar current="mine"
  /></view>
</template>
<script setup lang="ts">
import { openAndroidInstallSettings } from "@/modules/app-update/android";
import {
  checkUpdates,
  updateState,
  updateLabels,
  updates,
} from "@/services/updates";
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import MobileHeader from "@/components/MobileHeader.vue";
import TabBar from "@/components/TabBar.vue";
import PreviewBanner from "@/components/PreviewBanner.vue";
import { mobileService } from "@/services/mobile";
import {
  checkDataService,
  clearCallphoneDeviceCredential,
  messageOf,
  getSessionVersion,
  hasAccessToken,
} from "@/api/http";
import { connectionSettings, normalizeServiceUrl } from "@/config";
import { parsePairingPayload } from "@/services/pairing";
import { ensureSession, logout } from "@/services/session";
import { mockEnabled } from "@/config";
import {
  clearCallState,
  restoreCallQueue,
  pending,
  discardPending,
  hasUnfinishedCall,
  hasUnsafeResults,
  pendingCompletionCount,
  retryPendingCompletions,
} from "@/services/calls";
import { persistenceStatus, forgetDevice } from "@/services/vault";
import { refreshDispatches } from "@/services/foreground";
import { phoneCapability } from "@/native/phone";
import { when, toast } from "@/ui/format";
import type { Bootstrap, Device, Diagnostics } from "@/types/mobile";
function installSettings() {
  try {
    openAndroidInstallSettings();
  } catch (e) {
    toast(messageOf(e));
  }
}
const bootstrap = ref<Bootstrap>(),
  device = ref<Device>(),
  diagnostics = ref<Diagnostics>(),
  loading = ref(false),
  errorMessage = ref(""),
  panel = ref<"account" | "device" | "diagnostics" | "">(""),
  pairingCode = ref(""),
  pairingDeviceName = ref("我的手机"),
  claimingPairing = ref(false),
  recordingStatus = ref("未检查"),
  fileStatus = ref("未检查"),
  connectivityStatus = ref("未检查"),
  checkingConnectivity = ref(false),
  testCallStatus = ref("未测试"),
  testCallBusy = ref(false);
const licenseStatus = computed(
  () =>
    ({
      active: "有效",
      grace: "宽限期",
      expired: "已过期",
      unavailable: "暂不可用",
    })[bootstrap.value?.license?.status || "unavailable"],
);
const licenseText = computed(() =>
  bootstrap.value?.license?.expires_at
    ? `授权有效至 ${bootstrap.value.license.expires_at.slice(0, 10)}`
    : `授权状态：${licenseStatus.value}`,
);
const pairedText = computed(() =>
  device.value?.paired
    ? `已配对 ${device.value?.paired_computer || "当前员工账户"}`
    : "尚未配对电脑",
);
const panelTitle = computed(
  () =>
    ({
      account: "账户与授权",
      device: "本机与配对",
      diagnostics: "诊断与帮助",
      "": "",
    })[panel.value],
);
const diagnosticLabels: Record<string, string> = {
  available: "可用",
  unavailable: "暂不可用",
  simulated: "开发模拟模式",
  active: "有效",
  expired: "已过期",
  suspended: "已暂停",
  not_configured: "未配置",
};
function diagnosticLabel(value?: string) {
  return value ? diagnosticLabels[value] || "未知状态" : "未检查";
}
onShow(() => {
  if (ensureSession()) {
    void load();
    if (panel.value === "diagnostics") void checkNative();
  }
});
async function load() {
  const session = getSessionVersion();
  bootstrap.value = undefined;
  device.value = undefined;
  loading.value = true;
  errorMessage.value = "";
  try {
    const account = await mobileService.bootstrap();
    if (session !== getSessionVersion()) return;
    const currentDevice = await mobileService.device();
    if (session !== getSessionVersion()) return;
    bootstrap.value = account;
    device.value = currentDevice;
  } catch (e) {
    if (session === getSessionVersion()) errorMessage.value = messageOf(e);
  } finally {
    if (session === getSessionVersion()) loading.value = false;
  }
}
async function open(value: "account" | "device" | "diagnostics") {
  panel.value = value;
  if (value === "diagnostics") {
    void checkNative();
    try {
      diagnostics.value = await mobileService.diagnostics();
    } catch (e) {
      toast(messageOf(e));
    }
  }
}
let checkingPermissions = false;
async function checkNative() {
  if (checkingPermissions) return;
  checkingPermissions = true;
  recordingStatus.value = fileStatus.value = "检查中…";
  const [recording, files] = await Promise.allSettled([
    phoneCapability.recordingConfigured(),
    phoneCapability.filePermission(),
  ]);
  recordingStatus.value =
    recording.status === "rejected"
      ? messageOf(recording.reason)
      : recording.value === null
        ? "当前平台不支持"
        : recording.value
          ? "已开启"
          : "未开启";
  fileStatus.value =
    files.status === "rejected"
      ? messageOf(files.reason)
      : files.value === null
        ? "当前平台不支持"
        : files.value
          ? "已授权"
          : "未授权";
  checkingPermissions = false;
}
function openNativeSettings(kind: "recording" | "files") {
  try {
    kind === "recording"
      ? phoneCapability.openRecordingSettings()
      : phoneCapability.openFilePermissionSettings();
  } catch (e) {
    toast(messageOf(e));
  }
}
async function disposeTask(id: string) {
  const confirmed = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: "处置无法同步的任务",
      content:
        "请先联系管理员处理权限或数据问题。仅当确认不再同步时删除本机任务；未上传的结果和录音将无法恢复。",
      confirmText: "删除本机任务",
      success: (result) => resolve(!!result.confirm),
      fail: () => resolve(false),
    }),
  );
  if (!confirmed) return;
  try {
    discardPending(id);
  } catch (e) {
    toast(messageOf(e));
  }
}
async function testConnectivity() {
  if (mockEnabled) {
    connectivityStatus.value = "开发模拟模式，未检查真实服务";
    return;
  }
  checkingConnectivity.value = true;
  connectivityStatus.value = "检查中…";
  try {
    connectivityStatus.value = await checkDataService();
  } catch {
    connectivityStatus.value = "无法连接客户侧数据服务";
  } finally {
    checkingConnectivity.value = false;
  }
}
async function testCall() {
  if (hasUnfinishedCall()) return toast("请先结束当前客户通话并保存结果");
  if (!phoneCapability.available()) {
    testCallStatus.value = "当前环境没有 Android 通话插件";
    return;
  }
  const confirmed = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: "测试拨号 10086",
      content: "将使用本机电话插件直接拨打 10086。此测试不会生成客户通话记录。",
      success: (r) => resolve(!!r.confirm),
    }),
  );
  if (!confirmed) return;
  testCallBusy.value = true;
  try {
    await phoneCapability.dial("10086");
    testCallStatus.value = "拨号已启动，请在本机确认通话状态";
  } catch (e) {
    testCallStatus.value = messageOf(e);
  } finally {
    testCallBusy.value = false;
  }
}
async function retry() {
  await retryPendingCompletions(true);
  toast(pendingCompletionCount() ? "仍有结果待同步" : "待同步结果已处理");
}
function onPairingCodeInput(event: any) {
  const value = event?.detail?.value ?? event?.target?.value ?? event;
  pairingCode.value = String(value).replace(/\D/g, "").slice(0, 6);
}
async function claimPairing() {
  if (hasUnfinishedCall() || hasUnsafeResults())
    return toast("请先安全保存当前通话结果，再连接设备");
  const code = String(pairingCode.value).trim();
  if (!/^\d{6}$/.test(code)) return toast("请输入六位配对码");
  const system = uni.getSystemInfoSync();
  const platform =
    String(system.platform || "").toLowerCase() === "ios" ? "ios" : "android";
  const confirmed = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: "确认配对",
      content: "将本手机连接到当前账户下的电脑，并允许接收外呼派发。",
      success: (r) => resolve(!!r.confirm),
    }),
  );
  if (!confirmed) return;
  claimingPairing.value = true;
  try {
    await mobileService.claimPairing(
      code,
      pairingDeviceName.value.trim() || "我的手机",
      platform,
    );
    clearCallState();
    restoreCallQueue();
    pairingCode.value = "";
    await refreshDispatches();
    await load();
    toast("手机已配对");
  } catch (e) {
    toast(messageOf(e));
  } finally {
    claimingPairing.value = false;
  }
}
async function unpair() {
  if (hasUnfinishedCall() || pendingCompletionCount())
    return toast("请先保存并处理待同步结果，再解绑本机");
  const confirmed = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: "解绑本机",
      content: "解绑后会撤销本机配对并清理当前设备凭据和待处理结果。",
      success: (r) => resolve(!!r.confirm),
    }),
  );
  if (!confirmed) return;
  try {
    const result = await mobileService.unpair("mobile-unpair-" + Date.now());
    if (result === false) throw new Error("解绑未完成，请刷新后重试");
    forgetDevice();
    clearCallphoneDeviceCredential();
    clearCallState();
    panel.value = "";
    toast("本机已解绑");
    await load();
  } catch (e) {
    toast(messageOf(e));
  }
}
async function signOut() {
  if (hasUnfinishedCall() || hasUnsafeResults())
    return toast("请先结束通话并安全保存结果");
  if (pendingCompletionCount()) {
    const confirmed = await new Promise<boolean>((resolve) =>
      uni.showModal({
        title: "保留待同步结果并退出",
        content:
          "结果将加密保留在本机；再次登录相同服务、工作区和账户后继续处理。切换账户不会发送这些任务。",
        success: (result) => resolve(!!result.confirm),
        fail: () => resolve(false),
      }),
    );
    if (!confirmed) return;
  }
  try {
    await logout();
  } catch (e) {
    toast(messageOf(e));
    if (hasAccessToken()) return;
  }
  uni.reLaunch({ url: "/pages/login/index" });
}
async function scanPairing() {
  // #ifdef H5
  toast("浏览器预览请手动输入配对码；扫码请使用手机 App");
  return;
  // #endif
  // #ifndef H5
  if (claimingPairing.value) return;
  uni.scanCode({
    onlyFromCamera: true,
    scanType: ["qrCode"],
    success: (result) => {
      try {
        const payload = parsePairingPayload(result.result);
        const current = connectionSettings();
        if (payload.tenantId && payload.tenantId !== current.tenantId)
          throw new Error(
            "二维码工作区与当前登录不同，请使用电脑相同工作区登录",
          );
        if (
          payload.serviceUrl &&
          normalizeServiceUrl(payload.serviceUrl) !==
            normalizeServiceUrl(current.serviceUrl)
        )
          throw new Error(
            "二维码服务地址与当前登录不同，请先退出并登录对应服务",
          );
        pairingCode.value = payload.code;
        void claimPairing();
      } catch (e) {
        toast(messageOf(e));
      }
    },
    fail: (result) => {
      if (!/cancel/i.test(result.errMsg || ""))
        toast("无法扫码，请检查相机权限或输入配对码");
    },
  });
  // #endif
}
</script>
<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: #f7f8fc;
  padding-bottom: calc(110px + env(safe-area-inset-bottom));
}
.wrap {
  max-width: 500px;
  margin: auto;
  padding: 0 15px;
}
.head {
  height: 46px;
  margin: 0 4px;
  display: flex;
  align-items: center;
  font-size: 25px;
  font-weight: 500;
}
.license {
  height: 118px;
  margin-top: 12px;
  padding: 18px;
  border-radius: 22px;
  background: #294fdb;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  color: #dbe8ff;
  display: flex;
  flex-direction: column;
  gap: 11px;
  position: relative;
  font-size: 12px;
}
.license .edition {
  color: white;
  font-size: 15px;
  font-weight: 500;
}
.license image {
  position: absolute;
  right: 20px;
  top: 45px;
  width: 20px;
  height: 20px;
}
.setting {
  height: 68px;
  margin-top: 12px;
  padding: 14px;
  background: white;
  border-radius: 18px;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  display: flex;
  align-items: center;
  gap: 12px;
}
.setting:first-of-type {
  margin-top: 22px;
}
.setting-icon {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: #e8f0ff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.setting-icon image {
  width: 20px;
  height: 20px;
}
.setting-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.setting-text text:first-child {
  font-size: 14px;
  font-weight: 500;
}
.setting-text text:last-child {
  font-size: 11px;
  color: #636e82;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arrow {
  width: 18px;
  height: 18px;
}
.divider {
  height: 1px;
  margin: 25px 16px 15px;
  background: #e3e8f2;
}
.hint {
  margin: 0 4px;
  font-size: 12px;
  color: #636e82;
}
.state {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: white;
  color: #636e82;
  font-size: 12px;
}
.panel-scrim {
  position: fixed;
  z-index: 30;
  inset: 0;
  background: rgba(14, 22, 42, 0.42);
  display: flex;
  align-items: flex-end;
}
.panel {
  width: 100%;
  border-radius: 22px 22px 0 0;
  background: white;
  max-height: 88vh;
  overflow-y: auto;
  padding: 24px 20px calc(20px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 13px;
  color: #636e82;
}
.panel-title {
  color: #1a1f2e;
  font-size: 18px;
  font-weight: 600;
}
.panel button {
  width: 100%;
  border-radius: 14px;
  font-size: 13px;
}
.secondary {
  color: #294fdb;
  background: #e8f0ff;
}
.close {
  color: white;
  background: #294fdb;
}
</style>
<style scoped lang="scss">
.pairing-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: #f7f8fc;
}
.pairing-title {
  color: #1a1f2e;
  font-size: 14px;
  font-weight: 600;
}
.pairing-input {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 1px solid #e3e8f2;
  border-radius: 11px;
  background: #fff;
  color: #1a1f2e;
  font-size: 14px;
}
.code-input {
  text-align: center;
  letter-spacing: 8px;
  font-size: 18px;
}
.pairing-form .primary {
  background: #294fdb;
  color: #fff;
}
.pairing-form .primary[disabled] {
  opacity: 0.55;
}
.pairing-hint {
  color: #8490a5;
  font-size: 11px;
  line-height: 1.5;
}
</style>
