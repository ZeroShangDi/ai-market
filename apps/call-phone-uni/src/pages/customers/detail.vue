<template>
  <view class="page"
    ><view class="wrap">
      <view class="detail-head"
        ><view class="back" @tap="back"
          ><image src="/static/figma/2-71-imgFrame.svg" /></view
        ><text>客户详情</text></view
      >
      <PreviewBanner />
      <view v-if="loading" class="state">正在加载客户资料…</view>
      <view v-else-if="errorMessage" class="state"
        ><text>{{ errorMessage }}</text
        ><button @tap="load">重试</button></view
      >
      <template v-else-if="customer">
        <view class="identity"
          ><view class="avatar">{{
            customer.avatar_initial || customer.name.slice(0, 1)
          }}</view
          ><view class="identity-main"
            ><text class="name">{{ customer.name }}</text
            ><text class="phone">{{ customer.phone_display }}</text
            ><text v-if="customer.stage" class="stage">{{
              customer.stage
            }}</text></view
          ></view
        >
        <view class="actions"
          ><view class="action" @tap="call"
            ><image src="/static/figma/2-71-imgFrame1.svg" /><text
              >拨打</text
            ></view
          ><view class="action" @tap="copy"
            ><image src="/static/figma/2-71-imgFrame2.svg" /><text
              >复制号码</text
            ></view
          ><view class="action" @tap="wechat"
            ><image src="/static/figma/2-71-imgFrame3.svg" /><text
              >打开微信</text
            ></view
          ></view
        >
        <view class="section-head"
          ><text>沟通记录</text
          ><text>共 {{ customer.calls?.length || 0 }} 条</text></view
        >
        <view v-if="!customer.calls?.length" class="state">暂无通话记录</view>
        <view
          v-for="record in customer.calls || []"
          :key="record.id"
          class="record"
          ><view
            class="record-icon"
            :class="{ missed: record.result_code !== 'connected' }"
            ><image
              :src="
                record.result_code === 'connected'
                  ? '/static/figma/2-71-imgFrame4.svg'
                  : '/static/figma/2-71-imgFrame6.svg'
              " /></view
          ><view class="record-main"
            ><text class="record-name">{{
              record.result_code
                ? resultLabels[record.result_code]
                : "通话待确认"
            }}</text
            ><text class="record-date"
              >{{ when(record.started_at) }} ·
              {{ duration(record.duration_seconds) }}</text
            ></view
          ><view
            v-if="
              record.recording_state === 'ready' ||
              (record.has_recording && !record.recording_state)
            "
            class="play"
            @tap="play(record)"
            ><image src="/static/figma/2-71-imgFrame5.svg" /></view
          ><text v-else class="recording-state">{{
            record.recording_state === "pending" ? "待同步" : "无录音"
          }}</text></view
        >
        <text class="foot"
          >结束通话后可快速选择结果；客户状态由 PC 统一处理</text
        >
        <view v-if="playbackState" class="feedback">{{ playbackState }}</view>
      </template> </view
    ><CallResultSheet
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
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import PreviewBanner from "@/components/PreviewBanner.vue";
import CallResultSheet from "@/components/CallResultSheet.vue";
import { mobileService } from "@/services/mobile";
import { beginCall, type StartedCall } from "@/services/calls";
import { phoneCapability } from "@/native/phone";
import { messageOf } from "@/api/http";
import { resultLabels, when, duration, toast } from "@/ui/format";
import type { CallRecord, Customer, ResultCode } from "@/types/mobile";
const customerId = ref(""),
  customer = ref<Customer>(),
  loading = ref(true),
  errorMessage = ref(""),
  playbackState = ref("");
const activeCall = ref<StartedCall | null>(null),
  suggested = ref<ResultCode>(),
  observedDuration = ref(0),
  recordingPath = ref("");
let audio: UniApp.InnerAudioContext | undefined,
  stopObserve: (() => void) | undefined;
onLoad((options) => {
  customerId.value = String(options?.id || "");
  void load();
});
onShow(() => {
  if (customerId.value) void load();
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
  audio?.stop();
  audio?.destroy();
  audio = undefined;
});
onUnload(() => {
  stopObserve?.();
  stopObserve = undefined;
});
async function load() {
  if (!customerId.value) {
    errorMessage.value = "缺少客户编号";
    loading.value = false;
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  try {
    customer.value = await mobileService.customer(customerId.value);
  } catch (e) {
    customer.value = undefined;
    errorMessage.value = messageOf(e);
  } finally {
    loading.value = false;
  }
}
function back() {
  uni.navigateBack();
}
async function call() {
  if (!customer.value?.phone_dialable)
    return toast("当前账户无拨号权限或号码不可用");
  const confirmed = await new Promise<boolean>((resolve) =>
    uni.showModal({
      title: "确认拨打",
      content: `拨打 ${customer.value?.name}？将先创建通话记录。`,
      success: (r) => resolve(!!r.confirm),
    }),
  );
  if (!confirmed) return;
  try {
    suggested.value = undefined;
    observedDuration.value = 0;
    recordingPath.value = "";
    activeCall.value = await beginCall("customer_detail", customer.value.id);
    if (!activeCall.value.dialStarted)
      toast("拨号插件不可用或拨号失败，请确认结果");
  } catch (e) {
    toast(messageOf(e));
  }
}
function copy() {
  if (!customer.value?.phone_dialable) return toast("当前账户无权读取完整号码");
  uni.setClipboardData({
    data: customer.value.phone_dialable,
    success: () => toast("号码已复制"),
    fail: () => toast("复制失败"),
  });
}
async function wechat() {
  if (!(await phoneCapability.openWeChat()))
    toast("微信不可用，请检查是否安装并允许打开");
}
async function play(record: CallRecord) {
  playbackState.value = "正在检查录音权限…";
  try {
    const access = await mobileService.recordingAccess(record.id);
    const url = access.playback_url || access.url;
    if (!url) {
      playbackState.value = "录音尚未同步或没有可播放文件";
      return;
    }
    const localUrl = await mobileService.downloadRecording(url);
    audio?.stop();
    audio?.destroy();
    audio = uni.createInnerAudioContext();
    audio.src = localUrl;
    audio.onPlay(() => {
      playbackState.value = "正在播放录音";
    });
    audio.onEnded(() => {
      playbackState.value = "播放结束";
    });
    audio.onError(() => {
      playbackState.value = "录音播放失败或授权已过期";
    });
    audio.play();
  } catch (e) {
    const code = (e as any)?.code;
    playbackState.value =
      code === "RECORDING_FORBIDDEN" || code === "FORBIDDEN"
        ? "当前账户无录音播放权限"
        : code === "UPLOAD_INCOMPLETE"
          ? "录音尚未同步，请稍后重试"
          : code === "RECORDING_EXPIRED" || code === "NOT_FOUND"
            ? "没有可播放录音"
            : messageOf(e);
  }
}
function saved() {
  activeCall.value = null;
  recordingPath.value = "";
  void load();
}
</script>
<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: #f7f8fc;
}
.wrap {
  max-width: 500px;
  margin: auto;
  padding: calc(19px + var(--status-bar-height) + env(safe-area-inset-top)) 15px
    40px;
}
.detail-head {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 15px;
  font-size: 18px;
  font-weight: 500;
}
.back {
  height: 36px;
  width: 36px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: white;
  border-radius: 18px;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
}
.back image {
  width: 20px;
  height: 20px;
}
.identity {
  height: 118px;
  margin-top: 18px;
  padding: 20px 18px;
  background: white;
  border-radius: 22px;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  display: flex;
  gap: 16px;
}
.avatar {
  width: 54px;
  height: 54px;
  border-radius: 27px;
  background: #e8f0ff;
  color: #294fdb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 500;
}
.identity-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.name {
  font-size: 20px;
  font-weight: 500;
}
.phone {
  color: #636e82;
  font-size: 13px;
}
.stage {
  align-self: flex-start;
  padding: 4px 15px;
  border-radius: 12px;
  background: #e8f0ff;
  color: #294fdb;
  font-size: 11px;
}
.actions {
  display: flex;
  gap: 20px;
  margin-top: 18px;
}
.action {
  height: 72px;
  flex: 1;
  min-width: 0;
  border-radius: 18px;
  background: white;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
}
.action image {
  width: 20px;
  height: 20px;
}
.section-head {
  margin: 25px 4px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-head text:first-child {
  font-size: 17px;
  font-weight: 500;
}
.section-head text:last-child {
  font-size: 12px;
  color: #636e82;
}
.record {
  height: 76px;
  margin-bottom: 12px;
  padding: 14px;
  border-radius: 18px;
  background: white;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  display: flex;
  align-items: center;
  gap: 12px;
}
.record-icon {
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background: #e8f0ff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.record-icon.missed {
  background: #fff2e3;
}
.record-icon image {
  width: 16px;
  height: 16px;
}
.record-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.record-name {
  font-size: 14px;
  font-weight: 500;
}
.record-date {
  font-size: 11px;
  color: #636e82;
}
.play {
  width: 30px;
  height: 30px;
  border-radius: 15px;
  background: #e8f0ff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.play image {
  width: 14px;
  height: 14px;
}
.recording-state {
  color: #636e82;
  font-size: 11px;
}
.foot {
  display: block;
  margin: 28px 4px;
  color: #636e82;
  font-size: 11px;
}
.feedback {
  margin: 12px 4px;
  color: #636e82;
  font-size: 12px;
}
.state {
  margin-top: 20px;
  padding: 25px;
  background: white;
  border-radius: 18px;
  color: #636e82;
  text-align: center;
  font-size: 13px;
}
.state button {
  margin-top: 10px;
  font-size: 13px;
}
</style>
