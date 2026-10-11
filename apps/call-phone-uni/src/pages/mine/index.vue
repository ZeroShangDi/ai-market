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
          ><text>账户与连接</text><text>账户、服务器与电脑配对</text></view
        ><image class="arrow" src="/static/figma/2-112-imgFrame2.svg"
      /></view>
      <view class="setting" @tap="open('diagnostics')"
        ><view class="setting-icon"
          ><image src="/static/figma/2-112-imgFrame3.svg" /></view
        ><view class="setting-text"
          ><text>拨号与录音</text
          ><text>权限、录音与通话结果同步</text></view
        ><image class="arrow" src="/static/figma/2-112-imgFrame2.svg"
      /></view>
      <view class="setting" @tap="open('device')"
        ><view class="setting-icon"
          ><image src="/static/figma/2-112-imgFrame4.svg" /></view
        ><view class="setting-text"
          ><text>辅助功能</text><text>后台运行、悬浮窗与手机宠</text></view
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
      <view v-if="panel" class="panel-scrim" @tap="panel = ''"
        ><view class="panel" @tap.stop>
          <view class="panel-heading"
            ><text class="panel-title">{{ panelTitle }}</text
            ><button class="panel-dismiss" aria-label="关闭" @tap="panel = ''">
              <text aria-hidden="true">×</text>
            </button></view
          >
          <template v-if="panel === 'account'">
            <view class="card-list">
              <ReadinessCard title="当前账户" :status="bootstrap?.user?.name || '未连接'" :state="bootstrap ? 'ready' : 'unknown'" />
              <ReadinessCard title="工作空间" :status="bootstrap?.workspace?.name || '未连接'" :state="bootstrap ? 'ready' : 'unknown'" />
              <ReadinessCard title="服务授权" :status="licenseStatus" :state="bootstrap?.license?.status === 'active' ? 'ready' : 'unknown'" description="AI 服务套餐与有效期，不代表手机电话权限" />
              <ReadinessCard title="电脑配对" :status="device?.paired ? '已配对' : '未配对'" :state="device?.paired ? 'ready' : 'action'" action="去配对" @action="scanPairing" />
              <ReadinessCard title="服务器连接" :description="serviceAddress || (mockEnabled ? '当前为预览模式' : '扫码配对后自动配置服务器地址')" :status="checkingConnectivity ? '检查中' : connectivityStatus" :state="checkingConnectivity ? 'checking' : connectivityStatus.includes('可达') ? 'ready' : 'unknown'" action="测试连接" @action="testConnectivity" />
              <ReadinessCard title="扫码相机" :state="readiness.camera" :status="checkLabel(readiness.camera)" action="去授权" @action="systemSettings('app')" />
              <ReadinessCard title="本机安全存储" :state="persistenceStatus.includes('已启用') ? 'ready' : 'unknown'" :status="persistenceStatus.includes('已启用') ? '已启用' : '待确认'" />
            </view>
            <text class="group-note">{{ pairedText }}。配对身份会安全保存，重新打开自动连接。</text>
            <text class="group-note">最后验证：{{ bootstrap?.license?.last_verified_at ? when(bootstrap.license.last_verified_at) : '暂无' }}</text>
            <view class="group-actions"><button v-if="device?.paired" class="secondary" @tap="unpair">解除配对</button><button v-if="hasAccessToken()" class="secondary" @tap="signOut">退出账户</button></view>
          </template>
          <template v-if="panel === 'diagnostics'">
            <view class="card-list">
              <ReadinessCard v-for="item in preparationCards" :key="item.key" :title="item.title" :state="item.state" :status="item.status" :action="item.action" :description="item.description" @action="runCardAction(item.key)" />
              <ReadinessCard title="通话插件" :state="readiness.plugin" :status="checkLabel(readiness.plugin)" :description="readiness.plugin !== 'ready' ? '请在安装后的 App 中检查通话插件，浏览器无法使用原生通话能力。' : undefined" />
              <ReadinessCard title="通话结果同步" :state="pendingCompletionCount() ? 'action' : 'ready'" :status="pendingCompletionCount() ? pendingCompletionCount() + ' 条待同步' : '无待处理'" action="重试" @action="retry" />
            </view>
            <text v-if="readiness.error" class="group-note">{{ readiness.error }}</text>
            <view v-for="item in pending" :key="item.key" class="group-note"><text>通话 {{ item.id }}：{{ item.message || '等待同步' }}</text><button v-if="item.failure === 'permanent'" class="secondary" @tap="disposeTask(item.id)">处置无法同步的任务</button></view>
            <view class="group-actions"><button class="secondary" @tap="checkNative">重新检查</button><button class="secondary" :disabled="testCallBusy" @tap="testCall">测试拨号 10086</button></view>
            <text class="group-note">拨号测试：{{ testCallStatus }}</text>
          </template>
          <template v-if="panel === 'device'">
            <view class="card-list">
              <ReadinessCard title="悬浮窗权限" :state="stateOf(mobilePet.permission)" :status="checkLabel(stateOf(mobilePet.permission), '已允许')" action="去开启" @action="overlaySettings" />
              <ReadinessCard title="电池优化" :state="readiness.battery" :status="checkLabel(readiness.battery, '已豁免')" action="去设置" description="此项仅检查电池优化；自启动、后台弹出界面需在手机系统中另行允许。" @action="systemSettings('battery')" />
              <ReadinessCard title="手机宠" :state="mobilePet.visible ? 'ready' : mobilePet.enabled ? 'action' : 'unknown'" :status="mobilePet.visible ? '已开启' : mobilePet.enabled ? '待开启权限' : '未开启'" :action="mobilePet.enabled ? '去设置' : '开启'" description="可拖动，点击返回 App，长按关闭。" @action="retryPet" />
            </view>
            <text class="group-note">{{ mobilePet.message || '这些功能可按需开启。后台运行效果取决于手机系统设置，清理进程后可能中断。' }}</text>
            <view class="group-actions"><button class="secondary" @tap="checkNative">重新检查</button><button v-if="mobilePet.enabled" class="secondary" @tap="togglePet">关闭手机宠</button></view>
          </template>
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
import ReadinessCard from "@/components/ReadinessCard.vue";
import { readiness, stateOf, refreshReadiness, openSystemSettings, configureFiles, type CheckState } from "@/modules/device-readiness";
import { mobilePet, refreshMobilePet, setMobilePetEnabled, openOverlaySettings } from "@/modules/mobile-pet";
import MobileHeader from "@/components/MobileHeader.vue";
import TabBar from "@/components/TabBar.vue";
import PreviewBanner from "@/components/PreviewBanner.vue";
import { mobileService } from "@/services/mobile";
import {
  checkDataService,
  clearAccessToken,
  clearCallphoneDeviceCredential,
  messageOf,
  getSessionVersion,
  hasAccessToken,
} from "@/api/http";

import { scanAndPair } from "@/services/pairing-actions";
import { logout } from "@/services/session";
import { mockEnabled, connectionSettings } from "@/config";
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
import { forgetRememberedDevice } from "@/services/remembered-device";
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
  pairingDeviceName = ref("我的手机"),
  connectivityStatus = ref("未检查"),
  checkingConnectivity = ref(false),
  testCallStatus = ref("未测试"),
  testCallBusy = ref(false);
const serviceAddress = ref(connectionSettings().serviceUrl);
const preparationCards = computed(() => [
  { key: 'phone', title: '电话与通话记录', state: readiness.phone, status: checkLabel(readiness.phone), action: '去授权' },
  { key: 'microphone', title: '麦克风', state: readiness.microphone, status: checkLabel(readiness.microphone), action: '去授权' },
  { key: 'recording', title: '自动录音', state: readiness.recording, status: checkLabel(readiness.recording, '已开启'), action: '去设置',
    description: readiness.recording === 'unknown' ? '当前设备无法自动确认录音设置，请在系统通话设置中检查。' : undefined },
  { key: 'files', title: '录音文件访问', state: readiness.files, status: checkLabel(readiness.files, '已允许'), action: '去开启' },
]);
function runCardAction(key: string) {
  if (key === 'recording') openNativeSettings('recording');
  else if (key === 'files') openNativeSettings('files');
  else systemSettings('app');
}
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
      account: "账户与连接",
      device: "辅助功能",
      diagnostics: "拨号与录音",
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
  void checkNative();
  if (hasAccessToken() || mockEnabled) {
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
  serviceAddress.value = connectionSettings().serviceUrl;
  void checkNative();
  if (value === "diagnostics") {
    void checkNative();
    if (!hasAccessToken() && !mockEnabled) return;
    try {
      diagnostics.value = await mobileService.diagnostics();
    } catch (e) {
      toast(messageOf(e));
    }
  }
}
function checkLabel(state: CheckState, ready = '已就绪') {
  return state === 'ready' ? ready : state === 'action' ? '需设置' : state === 'checking' ? '检查中' : '无法确认';
}
async function retryPet() {
  try { await setMobilePetEnabled(true); } catch (e) { toast(messageOf(e)); }
}
async function checkNative() { await Promise.all([refreshReadiness(), refreshMobilePet()]); }
function systemSettings(kind: 'app' | 'battery') {
  try { openSystemSettings(kind); } catch (e) { toast(messageOf(e)); }
}
async function togglePet() {
  try { await setMobilePetEnabled(!mobilePet.enabled); } catch (e) { toast(messageOf(e)); }
}
function overlaySettings() { try { openOverlaySettings(); } catch (e) { toast(messageOf(e)); } }
function openNativeSettings(kind: "recording" | "files") {
  try {
    kind === "recording"
      ? phoneCapability.openRecordingSettings()
      : configureFiles();
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
    forgetRememberedDevice();
    clearCallphoneDeviceCredential();
    clearCallState();
    panel.value = "";
    clearAccessToken();
    toast("本机已解绑");
    uni.reLaunch({ url: "/pages/index/index" });
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
  uni.reLaunch({ url: "/pages/index/index" });
}
async function scanPairing() {
  try {
    if (await scanAndPair(pairingDeviceName.value.trim() || "我的手机")) {
      await load();
      toast("手机已配对，电脑外呼将自动拨打");
    }
  } catch (e) {
    toast(messageOf(e));
  }
}
</script>
<style scoped lang="scss">
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.panel .panel-dismiss {
  margin: 0;
  padding: 0;
  width: 40px;
  height: 40px;
  line-height: 38px;
  background: transparent;
  font-size: 28px;
  color: #687386;
}
.panel-dismiss::after {
  border: none;
}

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
  background: #f5f7fa;
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

<style scoped>
.check-group { padding: 0 14px; background: #f7f9fc; border-radius: 14px; }
.group-heading { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 14px; font-weight: 600; color: #273247; }
.group-heading text:last-child { font-size: 11px; color: #8b95a6; font-weight: 400; }
.group-note { color: #788397; font-size: 12px; line-height: 1.65; }
.group-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.panel .group-actions button { width: auto; flex: 1 1 42%; margin: 0; min-height: 44px; line-height: 44px; font-size: 12px; }
.panel .danger-action { background: #fff1f0; color: #bd4545; }
</style>



<style scoped>
.card-list { display: flex; flex-direction: column; gap: 9px; }
.card-list :deep(.check-card) { margin-bottom: 0; }
</style>
