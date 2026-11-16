<template>
  <view v-if="visible" class="voice-overlay">
    <view class="box">
      <view class="ripple">
        <view class="ring r1" /><view class="ring r2" />
        <ChatIcon name="mic" :size="30" color="#fff" />
      </view>
      <text class="tip">{{ text }}</text>
      <text class="sec">{{ seconds }}s</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import ChatIcon from './ChatIcon.vue';

withDefaults(
  defineProps<{ visible: boolean; seconds?: number; text?: string }>(),
  { seconds: 0, text: '松开发送，上滑取消' }
);
</script>

<style scoped lang="scss">
.voice-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(16, 24, 40, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
}
.box {
  width: 168px;
  height: 168px;
  border-radius: 22px;
  background: rgba(23, 31, 46, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
}
.ripple {
  position: relative;
  width: 66px;
  height: 66px;
  border-radius: 50%;
  background: #294fdb;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}
.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgba(66, 103, 245, 0.65);
  animation: pulse 1.5s ease-out infinite;
}
.r2 { animation-delay: 0.45s; }
@keyframes pulse {
  0% { transform: scale(1); opacity: 0.9; }
  100% { transform: scale(1.7); opacity: 0; }
}
.tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.92);
}
.sec {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.56);
}
</style>
