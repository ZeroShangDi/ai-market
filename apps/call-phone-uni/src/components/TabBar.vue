<template>
  <view class="tab-safe"
    ><view class="tab-bar">
      <view
        v-for="tab in tabs"
        :key="tab.path"
        class="tab"
        :class="{ active: current === tab.key }"
        @tap="go(tab.path)"
      >
        <image
          class="tab-icon"
          :src="current === tab.key ? tab.activeIcon : tab.icon"
          mode="aspectFit"
        />
        <text>{{ tab.label }}</text>
      </view>
    </view></view
  >
</template>
<script setup lang="ts">
import { hasUnfinishedCall } from "@/services/calls";
defineProps<{ current: "workbench" | "customers" | "mine" }>();
const tabs = [
  {
    key: "workbench",
    label: "工作台",
    path: "/pages/index/index",
    icon: "/static/figma/2-20-imgFrame5.svg",
    activeIcon: "/static/figma/2-2-imgFrame1.svg",
  },
  {
    key: "customers",
    label: "客户",
    path: "/pages/customers/index",
    icon: "/static/figma/2-2-imgFrame2.svg",
    activeIcon: "/static/figma/2-20-imgFrame6.svg",
  },
  {
    key: "mine",
    label: "我的",
    path: "/pages/mine/index",
    icon: "/static/figma/2-2-imgFrame3.svg",
    activeIcon: "/static/figma/2-112-imgFrame7.svg",
  },
];
function go(path: string) {
  if (hasUnfinishedCall()) {
    uni.showToast({ title: "请先完成当前通话并保存结果", icon: "none" });
    return;
  }
  uni.redirectTo({ url: path });
}
</script>
<style scoped lang="scss">
.tab-safe {
  position: fixed;
  z-index: 10;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 15px calc(16px + env(safe-area-inset-bottom));
  pointer-events: none;
}
.tab-bar {
  height: 64px;
  max-width: 500px;
  margin: auto;
  background: #fff;
  border-radius: 22px;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  display: flex;
  justify-content: space-around;
  align-items: center;
  pointer-events: auto;
}
.tab {
  width: 70px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #636e82;
  font-size: 11px;
}
.tab.active {
  background: #e8f0ff;
  color: #294fdb;
  font-weight: 500;
}
.tab-icon {
  width: 18px;
  height: 18px;
}
</style>
