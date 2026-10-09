<template>
  <view class="page"
    ><view class="wrap">
      <view class="head"
        ><text>客户</text
        ><view class="action" @tap="load(true)"
          ><image src="/static/figma/2-20-imgFrame.svg" /></view
      ></view>
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
        ><text class="dispatch-title">电脑已派发 · 待手机确认</text
        ><text class="dispatch-name"
          >{{ dispatches[0].customer_name }} ·
          {{ dispatches[0].phone_display }}</text
        ><button @tap="acceptDispatch(dispatches[0])">确认并拨号</button></view
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
      :visible="!!activeCall"
      :call-id="activeCall?.callId || ''"
      :started-at="activeCall?.startedAt || ''"
      :dial-started="activeCall?.dialStarted || false"
      :suggested="suggested"
      :duration-seconds="observedDuration"
      :recording-path="recordingPath"
      @saved="saved"
    />
  </view>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { onShow, onHide, onUnload, onReachBottom } from "@dcloudio/uni-app";
import TabBar from "@/components/TabBar.vue";
import PreviewBanner from "@/components/PreviewBanner.vue";
import CallResultSheet from "@/components/CallResultSheet.vue";
import { mobileService } from "@/services/mobile";
import { beginCall, type StartedCall } from "@/services/calls";
import { phoneCapability } from "@/native/phone";
import { messageOf } from "@/api/http";
import { resultLabels, when, duration, toast } from "@/ui/format";
import { dispatchPollMs } from "@/config";
import type { Customer, Dispatch, ResultCode, Scope } from "@/types/mobile";
const filters: { scope: Scope; label: string }[] = [
  { scope: "today", label: "今天" },
  { scope: "recent", label: "最近" },
  { scope: "all", label: "全部" },
];
const scope = ref<Scope>("today"),
  scopeLabel = ref("今天"),
  customers = ref<Customer[]>([]),
  dispatches = ref<Dispatch[]>([]),
  total = ref(0),
  page = ref(1),
  loading = ref(false),
  hasMore = ref(true),
  errorMessage = ref("");
const activeCall = ref<StartedCall | null>(null),
  suggested = ref<ResultCode>(),
  observedDuration = ref(0),
  recordingPath = ref("");
const dispatchProgress = ref("");
let pollTimer: ReturnType<typeof setInterval> | undefined,
  stopObserve: (() => void) | undefined;
async function load(reset = false) {
  if (loading.value) return;
  if (reset) {
    page.value = 1;
    hasMore.value = true;
    customers.value = [];
  }
  if (!hasMore.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await mobileService.customers(scope.value, page.value);
    customers.value = reset
      ? result.items
      : [...customers.value, ...result.items];
    total.value = result.total ?? customers.value.length;
    hasMore.value = result.items.length >= 20 || !!result.next_cursor;
    page.value++;
  } catch (e) {
    errorMessage.value = messageOf(e);
  } finally {
    loading.value = false;
  }
}
async function refreshDispatches() {
  try {
    await mobileService.heartbeat();
  } catch {
    /* Keep polling dispatches so a transient heartbeat failure does not hide an available request. */
  }
  try {
    dispatches.value = (await mobileService.dispatches()).items.filter(
      (item) =>
        (item.status === "queued" || item.status === "pending") &&
        new Date(item.expires_at).getTime() > Date.now(),
    );
  } catch {
    dispatches.value = [];
  }
}
function select(value: Scope) {
  scope.value = value;
  scopeLabel.value = filters.find((f) => f.scope === value)!.label;
  void load(true);
}
function openDetail(id: string) {
  uni.navigateTo({
    url: `/pages/customers/detail?id=${encodeURIComponent(id)}`,
  });
}
async function launch(source: "customer_list" | "pc_dispatch", id: string) {
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
  if (!ok) return;
  try {
    suggested.value = undefined;
    observedDuration.value = 0;
    recordingPath.value = "";
    activeCall.value = await beginCall(source, id);
    if (source === "pc_dispatch")
      dispatchProgress.value = activeCall.value.dialStarted
        ? "手机已接受 · 已开始拨号，接通待确认"
        : "手机已接受 · 拨号未启动";
    if (!activeCall.value.dialStarted)
      toast("拨号插件不可用或拨号失败，请确认结果");
  } catch (e) {
    toast(messageOf(e));
  }
}
function callCustomer(id: string) {
  void launch("customer_list", id);
}
function acceptDispatch(item: Dispatch) {
  void launch("pc_dispatch", item.id);
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
onShow(() => {
  void load(true);
  void refreshDispatches();
  pollTimer = setInterval(refreshDispatches, dispatchPollMs);
  if (!stopObserve)
    stopObserve = phoneCapability.observe((event) => {
      if (!activeCall.value) return;
      if (event.kind === "unanswered") suggested.value = "no_answer";
      if (event.kind === "ended") {
        observedDuration.value = event.durationSeconds || 0;
        recordingPath.value = event.recordingPath || "";
      }
    });
});
onHide(() => {
  if (pollTimer) clearInterval(pollTimer);
});
onUnload(() => {
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
  padding-top: calc(19px + var(--status-bar-height) + env(safe-area-inset-top));
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
