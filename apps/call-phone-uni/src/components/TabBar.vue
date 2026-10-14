<template>
  <view class="tab-safe"
    ><view class="tab-bar">
      <view
        v-for="tab in tabs"
        :key="tab.path"
        class="tab"
        :class="{ active: current === tab.key }"
        role="button"
        :aria-label="tab.label"
        @tap="go(tab.key)"
      >
        <AppIcon :name="current === tab.key ? tab.activeIcon : tab.icon" :size="20" :color="current === tab.key ? '#294fdb' : '#636e82'" />
        <text>{{ tab.label }}</text>
      </view>
    </view></view
  >
</template>
<script setup lang="ts">
import { openRootTab, type RootTab } from "@/modules/root-navigation";
import AppIcon from "./AppIcon.vue";
const props = defineProps<{ current: "workbench" | "apps" | "mine" }>();
const tabs = [
  {
    key: "workbench",
    label: "工作台",
    path: "/pages/index/index",
    icon: "home",
    activeIcon: "home-active",
  },
  {
    key: "apps",
    label: "应用",
    path: "/pages/apps/index",
    icon: "apps",
    activeIcon: "apps-active",
  },
  {
    key: "mine",
    label: "我的",
    path: "/pages/mine/index",
    icon: "user",
    activeIcon: "user-active",
  },
] satisfies { key: RootTab; label: string; path: string; icon: string; activeIcon: string }[];
function go(tab: RootTab) {
  if (tab === props.current) return;
  openRootTab(tab);
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
}
.tab {
  flex: 1;
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
.tab :deep(.app-icon), .tab text { pointer-events: none; }
.tab-icon {
  width: 18px;
  height: 18px;
}
</style>
