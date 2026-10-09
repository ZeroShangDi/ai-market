<template>
  <view class="header-space"
    ><view class="mobile-header"
      ><view class="header-row">
        <view v-if="backIcon" class="header-back" @tap="back"
          ><image :src="backIcon"
        /></view>
        <text class="header-title" :class="{ detail: backIcon }">{{
          title
        }}</text>
        <view
          v-if="actionIcon"
          class="header-action"
          role="button"
          :aria-label="actionLabel"
          @tap="$emit('action')"
          ><image :src="actionIcon"
        /></view> </view></view
  ></view>
</template>
<script setup lang="ts">
import { hasUnfinishedCall } from "@/services/calls";
defineProps<{
  title: string;
  actionIcon?: string;
  actionLabel?: string;
  backIcon?: string;
}>();
defineEmits<{ (event: "action"): void }>();
function back() {
  if (hasUnfinishedCall()) {
    uni.showToast({ title: "请先完成当前通话并保存结果", icon: "none" });
    return;
  }
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: "/pages/customers/index" }),
  });
}
</script>
<style scoped lang="scss">
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
