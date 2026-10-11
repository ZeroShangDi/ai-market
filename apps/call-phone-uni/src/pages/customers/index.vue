<template>
  <view class="page"
    ><view class="wrap">
      <MobileHeader
        title="客户"
        action-icon="/static/figma/2-20-imgFrame.svg"
        action-label="刷新客户"
        @action="load(true)"
      />
      <PreviewBanner />
      <view class="filters"
        ><view
          v-for="filter in filters"
          :key="filter.scope"
          class="filter"
          :class="{ active: scope === filter.scope }"
          @tap="select(filter.scope)"
          >{{ filter.label }}</view
        ></view
      >
      <text class="summary"
        >{{ scopeLabel }} · {{ total }} 位客户产生沟通记录</text
      >
      <view v-if="dispatches.length" class="dispatch"
        ><text class="dispatch-title">电脑外呼 · 等待自动拨号</text
        ><text class="dispatch-name"
          >{{ dispatches[0].customer_name }} ·
          {{ dispatches[0].phone_display }}</text
        ><button
          :disabled="launching || !!activeCall"
          @tap="declineDispatch(dispatches[0])"
        >
          拒绝派发
        </button></view
      >
      <view v-if="dispatchProgress" class="dispatch-progress">{{
        dispatchProgress
      }}</view>
      <view v-if="loading && !customers.length" class="state"
        >正在加载客户…</view
      >
      <view v-else-if="errorMessage && !customers.length" class="state"
        ><text>{{ errorMessage }}</text
        ><button @tap="load(true)">重试</button></view
      >
      <view v-else-if="!customers.length" class="state">暂无可访问的客户</view>
      <view
        v-for="customer in customers"
        :key="customer.id"
        class="card"
        @tap="openDetail(customer.id)"
      >
        <view class="avatar">{{
          customer.avatar_initial || customer.name.slice(0, 1)
        }}</view>
        <view class="card-main"
          ><text class="name">{{ customer.name }}</text
          ><text class="phone">{{ customer.phone_display }}</text
          ><view class="last"
            ><image
              :src="
                customer.last_call_result === 'connected'
                  ? '/static/figma/2-20-imgFrame1.svg'
                  : when(customer.last_call_at).startsWith('今天')
                    ? '/static/figma/2-20-imgFrame3.svg'
                    : '/static/figma/2-20-imgFrame4.svg'
              "
            /><text
              :class="
                customer.last_call_result === 'connected' ? 'success' : 'muted'
              "
              >{{ when(customer.last_call_at) }} ·
              {{
                customer.last_call_result
                  ? resultLabels[customer.last_call_result]
                  : "暂无通话"
              }}
              {{
                customer.last_call_result === "connected"
                  ? duration(customer.last_call_duration_seconds)
                  : ""
              }}</text
            ></view
          ></view
        >
        <view
          v-if="customer.phone_dialable"
          class="call"
          @tap.stop="callCustomer(customer.id)"
          ><image src="/static/figma/2-20-imgFrame2.svg"
        /></view>
      </view>
      <text v-if="customers.length" class="foot"
        >仅显示当前账户与配对设备有权访问的客户</text
      >
      <text v-if="loading && customers.length" class="foot">加载更多…</text>
      <text
        v-if="errorMessage && customers.length"
        class="foot"
        @tap="load(false)"
        >加载失败，点击重试</text
      > </view
    ><TabBar current="customers" /><CallResultSheet
      :visible="!!activeCall && !launching"
      :call-id="activeCall?.callId || ''"
      :started-at="activeCall?.startedAt || ''"
      :dial-started="activeCall?.dialStarted || false"
      :dial-uncertain="activeCall?.dialUncertain"
      :suggested="suggested"
      :duration-seconds="observedDuration"
      :recording-path="recordingPath"
      :ended-at="observedEndAt"
      @saved="saved"
    />
  </view>
</template>
<script setup lang="ts">
import { ref } from "vue";
import {
  onShow,
  onUnload,
  onReachBottom,
  onBackPress,
} from "@dcloudio/uni-app";
import MobileHeader from "@/components/MobileHeader.vue";
import TabBar from "@/components/TabBar.vue";
import PreviewBanner from "@/components/PreviewBanner.vue";
import CallResultSheet from "@/components/CallResultSheet.vue";
import { mobileService } from "@/services/mobile";
import { beginCall, type StartedCall } from "@/services/calls";
import { phoneCapability } from "@/native/phone";
import { messageOf, getSessionVersion, onSessionChange } from "@/api/http";
import { resultLabels, when, duration, toast } from "@/ui/format";
import { ensureSession } from "@/services/session";
import {
  foregroundDispatches as dispatches,
  refreshDispatches,
} from "@/services/foreground";
import type { Customer, Dispatch, ResultCode, Scope } from "@/types/mobile";
const filters: { scope: Scope; label: string }[] = [
  { scope: "today", label: "今天" },
  { scope: "recent", label: "最近" },
  { scope: "all", label: "全部" },
];
const scope = ref<Scope>("today"),
  scopeLabel = ref("今天"),
  customers = ref<Customer[]>([]),
  total = ref(0),
  page = ref(1),
  loading = ref(false),
  hasMore = ref(true),
  errorMessage = ref("");
const activeCall = ref<StartedCall | null>(null),
  suggested = ref<ResultCode>(),
  observedDuration = ref(0),
  recordingPath = ref(""),
  observedEndAt = ref("");
const dispatchProgress = ref("");
let listGeneration = 0;
const launching = ref(false);
let stopObserve: (() => void) | undefined;
async function load(reset = false) {
  if (loading.value && !reset) return;
  if (reset) listGeneration++;
  const generation = listGeneration,
    session = getSessionVersion();
  const requestedScope = scope.value;
  if (reset) {
    page.value = 1;
    hasMore.value = true;
    customers.value = [];
  }
  if (!hasMore.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await mobileService.customers(requestedScope, page.value);
    if (generation !== listGeneration || session !== getSessionVersion())
      return;
    customers.value = reset
      ? result.items
      : [...customers.value, ...result.items];
    total.value = result.total ?? customers.value.length;
    hasMore.value = result.items.length >= 20 || !!result.next_cursor;
    page.value++;
  } catch (e) {
    if (generation === listGeneration && session === getSessionVersion())
      errorMessage.value = messageOf(e);
  } finally {
    if (generation === listGeneration && session === getSessionVersion())
      loading.value = false;
  }
}
function select(value: Scope) {
  scope.value = value;
  scopeLabel.value = filters.find((f) => f.scope === value)!.label;
  void load(true);
}
function openDetail(id: string) {
  if (launching.value || activeCall.value) return toast("请先保存当前通话结果");
  uni.navigateTo({
    url: `/pages/customers/detail?id=${encodeURIComponent(id)}`,
  });
}
async function launch(source: "customer_list" | "pc_dispatch", id: string) {
  if (launching.value || activeCall.value) return toast("请先保存当前通话结果");
  launching.value = true;
  try {
    await doLaunch(source, id);
  } finally {
    launching.value = false;
  }
}
async function doLaunch(source: "customer_list" | "pc_dispatch", id: string) {
  const session = getSessionVersion();
  const ok = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: source === "pc_dispatch" ? "接受电脑派发" : "确认拨打",
      content:
        source === "pc_dispatch"
          ? "接受后将由服务端校验派发与号码权限，再调用本机拨号。"
          : "将先创建通话记录，再调用本机拨号。",
      success: (r) => resolve(!!r.confirm),
    }),
  );
  if (!ok || session !== getSessionVersion()) return;
  try {
    suggested.value = undefined;
    observedDuration.value = 0;
    recordingPath.value = "";
    observedEndAt.value = "";
    activeCall.value = await beginCall(source, id, (call) => {
      if (session === getSessionVersion()) activeCall.value = call;
    });
    if (source === "pc_dispatch")
      dispatchProgress.value = activeCall.value.dialStarted
        ? "手机已接受 · 已开始拨号，接通待确认"
        : activeCall.value.dialUncertain
          ? "手机已接受 · 等待核对本机拨号状态"
          : "手机已接受 · 拨号未启动";
    if (!activeCall.value.dialStarted)
      toast(
        activeCall.value.dialUncertain
          ? "拨号插件未回应，请检查本机通话状态并记录实际结果"
          : "拨号未能启动，请确认结果",
      );
  } catch (e) {
    if (session === getSessionVersion()) toast(messageOf(e));
  }
}
function callCustomer(id: string) {
  void launch("customer_list", id);
}
async function declineDispatch(item: Dispatch) {
  if (launching.value || activeCall.value) return;
  const ok = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: "拒绝电脑派发",
      content: "拒绝后不会拨打该号码，电脑端会显示已拒绝。",
      success: (r) => resolve(!!r.confirm),
    }),
  );
  if (!ok) return;
  launching.value = true;
  try {
    if (
      !(await mobileService.declineDispatch(
        item.id,
        "decline-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      ))
    )
      throw new Error("派发状态已变化，请刷新");
    dispatches.value = dispatches.value.filter((row) => row.id !== item.id);
    await refreshDispatches();
  } catch (e) {
    toast(messageOf(e));
  } finally {
    launching.value = false;
  }
}
function saved(result: ResultCode) {
  if (activeCall.value?.dispatchId)
    dispatchProgress.value =
      result === "connected"
        ? "已接通（用户确认）"
        : `通话结束 · ${resultLabels[result]}`;
  activeCall.value = null;
  recordingPath.value = "";
  void load(true);
  void refreshDispatches();
}
const stopSession = onSessionChange(() => {
  activeCall.value = null;
  recordingPath.value = "";
  observedEndAt.value = "";
  stopObserve?.();
  stopObserve = undefined;
});
onShow(() => {
  if (!ensureSession()) return;
  void load(true);
  void refreshDispatches();
  if (!stopObserve)
    stopObserve = phoneCapability.observe((event) => {
      if (!activeCall.value) return;
      if (event.endedAt) observedEndAt.value = event.endedAt;
      if (event.kind === "unanswered") suggested.value = "no_answer";
      if (event.kind === "ended") {
        observedDuration.value = event.durationSeconds || 0;
        recordingPath.value = event.recordingPath || "";
      }
    });
});
onBackPress(() => {
  if (activeCall.value || launching.value) {
    toast("请先保存当前通话结果");
    return true;
  }
  return false;
});
onUnload(() => {
  stopSession();
  listGeneration++;
  stopObserve?.();
  stopObserve = undefined;
});
onReachBottom(() => void load(false));
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
}
.head {
  height: 46px;
  margin: 0 19px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 25px;
  font-weight: 500;
}
.action {
  width: 36px;
  height: 36px;
  background: white;
  border-radius: 18px;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}
.action image {
  width: 20px;
  height: 20px;
}
.filters {
  margin: 14px 19px 0;
  display: flex;
  gap: 8px;
}
.filter {
  min-width: 58px;
  height: 30px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  border: 1px solid #e3e8f2;
  background: white;
  color: #636e82;
  font-size: 12px;
}
.filter.active {
  border-color: #294fdb;
  color: white;
  background: #294fdb;
  font-weight: 500;
}
.summary {
  display: block;
  margin: 15px 19px 14px;
  color: #636e82;
  font-size: 12px;
}
.card {
  margin: 0 15px 10px;
  min-height: 88px;
  padding: 14px;
  background: white;
  border-radius: 18px;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 22px;
  background: #e8f0ff;
  color: #294fdb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 500;
}
.card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.name {
  font-size: 15px;
  font-weight: 500;
}
.phone {
  font-size: 12px;
  color: #636e82;
}
.last {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.last image {
  width: 13px;
  height: 13px;
  flex: none;
}
.last text {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.success {
  color: #149661;
}
.muted {
  color: #636e82;
}
.call {
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 18px;
  background: #294fdb;
  display: flex;
  align-items: center;
  justify-content: center;
}
.call image {
  width: 18px;
  height: 18px;
}
.foot {
  display: block;
  margin: 29px 19px;
  color: #636e82;
  font-size: 12px;
}
.state {
  margin: 22px 15px;
  padding: 30px;
  border-radius: 18px;
  background: #fff;
  color: #636e82;
  text-align: center;
  font-size: 13px;
}
.state button {
  margin-top: 14px;
  font-size: 13px;
  color: #294fdb;
}
.dispatch {
  margin: 0 15px 12px;
  padding: 14px;
  border-radius: 18px;
  background: #e8f0ff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dispatch-title {
  color: #294fdb;
  font-size: 12px;
  font-weight: 600;
}
.dispatch-name {
  font-size: 12px;
}
.dispatch button {
  margin: 2px 0 0;
  background: #294fdb;
  color: white;
  border-radius: 12px;
  font-size: 12px;
}
.dispatch-progress {
  margin: 0 15px 12px;
  padding: 10px 14px;
  border-radius: 12px;
  color: #294fdb;
  background: #e8f0ff;
  font-size: 12px;
}
</style>
