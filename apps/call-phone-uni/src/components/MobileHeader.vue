<template>
  <view class="header-space"
    ><view class="mobile-header"
      ><view class="header-row">
        <view v-if="(actionIcon || actionIconName) && actionPosition === 'left'" class="header-action" role="button" :aria-label="actionLabel" @tap="$emit('action')"><AppIcon v-if="actionIconName" :name="actionIconName" :size="20" color="#1a1f2e" /><image v-else :src="actionIcon" /></view>
        <view v-if="backIcon || backIconName" class="header-back" role="button" aria-label="返回" @tap="back"><AppIcon v-if="backIconName" :name="backIconName" :size="20" color="#1a1f2e" /><image v-else :src="backIcon" /></view>
        <text class="header-title" :class="{ detail: backIcon || backIconName }">{{
          title
        }}</text>
        <view
          v-if="foregroundDispatches.length"
          class="dispatch-entry"
          role="button"
          @tap="openDispatches"
          >等待拨号 {{ foregroundDispatches.length }}</view
        >
        <view
          v-if="(actionIcon || actionIconName) && actionPosition !== 'left'"
          class="header-action"
          role="button"
          :aria-label="actionLabel"
          @tap="$emit('action')"
          ><AppIcon v-if="actionIconName" :name="actionIconName" :size="20" color="#1a1f2e" /><image v-else :src="actionIcon" /></view>
        <view v-if="actionText" class="header-text-action" :class="{ disabled: actionDisabled }" role="button" :aria-label="actionLabel || actionText" :aria-disabled="actionDisabled" @tap="!actionDisabled && $emit('action')">{{ actionText }}</view>
        </view></view
  ></view>
  <CallResultSheet
    v-if="automaticCall"
    :visible="true"
    v-bind="automaticObservation"
    :call-id="automaticCall.callId"
    :started-at="automaticCall.startedAt"
    :dial-started="automaticCall.dialStarted"
    :dial-uncertain="automaticCall.dialUncertain"
    @saved="finishAutomaticCall"
  />
</template>
<script setup lang="ts">
import CallResultSheet from "./CallResultSheet.vue";
import AppIcon from "./AppIcon.vue";
import {
  automaticCall,
  automaticObservation,
  finishAutomaticCall,
} from "@/services/automatic-call";
import { foregroundDispatches } from "@/services/foreground";
import { hasUnfinishedCall } from "@/services/calls";
const props = defineProps<{
  title: string;
  actionIcon?: string;
  actionIconName?: string;
  actionLabel?: string;
  actionText?: string;
  actionDisabled?: boolean;
  interceptBack?: boolean;
  actionPosition?: "left" | "right";
  backIcon?: string;
  backIconName?: string;
  backFallback?: string;
}>();
const emit = defineEmits<{ (event: "action"): void; (event: "back"): void }>();
function openDispatches() {
  if (hasUnfinishedCall())
    return uni.showToast({ title: "请先完成当前通话", icon: "none" });
  if (getCurrentPages().at(-1)?.route === "pages/customers/index") return;
  uni.navigateTo({ url: "/pages/customers/index" });
}
function back() {
  if (hasUnfinishedCall()) {
    uni.showToast({ title: "请先完成当前通话并保存结果", icon: "none" });
    return;
  }
  if (props.interceptBack) { emit('back'); return; }
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: props.backFallback || "/pages/customers/index" }),
  });
}
</script>
<style scoped lang="scss">
.dispatch-entry {
  color: #294fdb;
  font-size: 12px;
  padding: 8px;
  background: #e8f0ff;
  border-radius: 12px;
}
.header-text-action { padding: 10px 0 10px 8px; font-size: 14px; font-weight: 500; color: #294fdb; flex-shrink: 0; }
.header-text-action.disabled { opacity: .4; }
.header-space {
  height: calc(
    52px + max(var(--status-bar-height, 0px), env(safe-area-inset-top, 0px))
  );
}
.mobile-header {
  position: fixed;
  z-index: 20;
  left: 0;
  right: 0;
  top: 0;
  background: #f7f8fc;
  padding-top: max(
    var(--status-bar-height, 0px),
    env(safe-area-inset-top, 0px)
  );
}
.header-row {
  max-width: 500px;
  height: 52px;
  margin: auto;
  padding: 0 19px;
  display: flex;
  align-items: center;
  gap: 15px;
}
.header-title {
  flex: 1;
  font-size: 25px;
  font-weight: 500;
}
.header-title.detail {
  font-size: 18px;
}
.header-action,
.header-back {
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
}
.header-action image,
.header-back image {
  width: 20px;
  height: 20px;
}
</style>
