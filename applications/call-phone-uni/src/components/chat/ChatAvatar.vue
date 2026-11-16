<template>
  <view class="chat-avatar" :style="boxStyle">
    <image v-if="src" class="avatar-img" :src="src" mode="aspectFit" />
    <text v-else class="initial" :style="textStyle">{{ initial }}</text>
    <view v-if="online" class="online" />
    <view v-if="badge > 0" class="badge">{{ badge > 99 ? '99+' : badge }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    name: string;
    src?: string;
    color?: string;
    size?: number;
    radius?: number;
    badge?: number;
    online?: boolean;
  }>(),
  { src: '', color: '#4267f5', size: 48, radius: 14, badge: 0, online: false }
);

const initial = computed(() => (props.name ? props.name.slice(0, 1) : '?'));
const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${props.radius}px`,
  background: `linear-gradient(135deg, ${props.color}, ${shade(props.color, -18)})`
}));
const textStyle = computed(() => ({ fontSize: `${Math.round(props.size * 0.42)}px` }));

function shade(hex: string, percent: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
</script>

<style scoped lang="scss">
.chat-avatar {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  padding: 4px;
  box-sizing: border-box;
}
.initial {
  color: #fff;
  font-weight: 500;
  line-height: 1;
}
.badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: #f04438;
  color: #fff;
  font-size: 10px;
  line-height: 17px;
  text-align: center;
  border: 1.5px solid #fff;
}
.online {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #12b76a;
  border: 2px solid #fff;
}
</style>
