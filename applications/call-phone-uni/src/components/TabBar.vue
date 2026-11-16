<template>
  <view class="tab-safe"
    ><view class="tab-bar">
      <view class="indicator-track" :style="indicatorStyle" aria-hidden="true">
        <view class="indicator" />
      </view>
      <view
        v-for="(tab, index) in tabs"
        :key="tab.path"
        class="tab"
        :class="{ active: current === tab.key }"
        role="button"
        :aria-label="tab.label"
        :aria-current="current === tab.key ? 'page' : undefined"
        @tap="go(tab.key)"
      >
        <view class="icon-wrap">
          <AppIcon
            :name="current === tab.key ? tab.activeIcon : tab.icon"
            :size="20"
            :color="current === tab.key ? '#294fdb' : '#636e82'"
          />
        </view>
        <text class="label">{{ tab.label }}</text>
      </view>
    </view></view
  >
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { openRootTab, type RootTab } from "@/modules/root-navigation";
import AppIcon from "./AppIcon.vue";
const props = defineProps<{ current: "workbench" | "agent" | "mine" }>();
const tabs = [
  {
    key: "agent",
    label: "Agent",
    path: "/pages/contacts/index",
    icon: "message",
    activeIcon: "message",
  },
  {
    key: "workbench",
    label: "控制台",
    path: "/pages/index/index",
    icon: "home",
    activeIcon: "home-active",
  },
  {
    key: "mine",
    label: "我的",
    path: "/pages/mine/index",
    icon: "user",
    activeIcon: "user-active",
  },
] satisfies { key: RootTab; label: string; path: string; icon: string; activeIcon: string }[];

const activeIndex = computed(() => Math.max(0, tabs.findIndex((tab) => tab.key === props.current)));

// 每个 tab 都是独立根页面，reLaunch 会重建 TabBar。
// 跳转前把来源位置写入本地存储，新页面读出后从旧位置滑入高亮块。
const FROM_KEY = "tabbar-from-index";
type TabHandoff = { index: number; at: number };
let rawFrom: unknown = uni.getStorageSync(FROM_KEY);
uni.removeStorageSync(FROM_KEY);
if (typeof rawFrom === "string" && rawFrom) {
  try {
    rawFrom = JSON.parse(rawFrom);
  } catch {
    rawFrom = null;
  }
}
const from = rawFrom && typeof rawFrom === "object" ? (rawFrom as Partial<TabHandoff>) : null;
const startIndex =
  from &&
  typeof from.index === "number" &&
  Number.isInteger(from.index) &&
  from.index >= 0 &&
  from.index < tabs.length &&
  typeof from.at === "number" &&
  Date.now() - from.at < 5000
    ? from.index
    : activeIndex.value;
const indicatorIndex = ref(startIndex);
const indicatorStyle = computed(() => ({ transform: `translateX(${indicatorIndex.value * 100}%)` }));

let settleTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  const settle = () => {
    indicatorIndex.value = activeIndex.value;
  };
  // 页面切换后 WebView 可能暂时不派发 rAF，补一个兜底，避免高亮停在旧标签。
  requestAnimationFrame(() => requestAnimationFrame(settle));
  settleTimer = setTimeout(settle, 400);
});

onUnmounted(() => {
  clearTimeout(settleTimer);
});

function go(tab: RootTab) {
  if (tab === props.current) return;
  const handoff: TabHandoff = { index: activeIndex.value, at: Date.now() };
  uni.setStorageSync(FROM_KEY, handoff);
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
  position: relative;
  height: 64px;
  max-width: 500px;
  margin: auto;
  box-sizing: border-box;
  background: #fff;
  border-radius: 22px;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  display: flex;
  justify-content: space-around;
  align-items: center;
  overflow: hidden;
}
.indicator-track {
  position: absolute;
  z-index: 0;
  top: 0;
  left: 0;
  width: 33.3333%;
  height: 100%;
  pointer-events: none;
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}
.indicator {
  position: absolute;
  top: 8px;
  left: 6px;
  right: 6px;
  height: 48px;
  border-radius: 16px;
  background: linear-gradient(180deg, #eef4ff 0%, #e3ecff 100%);
  box-shadow: 0 4px 12px rgba(41, 79, 219, 0.1);
}
.tab {
  position: relative;
  z-index: 1;
  flex: 1;
  height: 64px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #636e82;
  font-size: 11px;
  transition: color 240ms ease;
}
.tab.active {
  color: #294fdb;
  font-weight: 500;
}
.icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.tab.active .icon-wrap {
  transform: translateY(-1px) scale(1.05);
  animation: tab-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes tab-pop {
  0% {
    transform: translateY(0) scale(0.9);
  }
  55% {
    transform: translateY(-2px) scale(1.12);
  }
  100% {
    transform: translateY(-1px) scale(1.05);
  }
}
.label {
  line-height: 1.2;
}
.tab :deep(.app-icon), .tab text {
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .indicator-track,
  .tab,
  .icon-wrap {
    transition: none;
  }
  .tab.active .icon-wrap {
    animation: none;
  }
}
</style>
