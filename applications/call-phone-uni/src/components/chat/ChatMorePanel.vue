<template>
  <view class="more-panel">
    <view class="grid">
      <view v-for="item in items" :key="item.key" class="cell" @tap="$emit('action', item.key)">
        <view class="tile"><ChatIcon :name="item.icon" :size="24" color="#3d4a63" /></view>
        <text class="label">{{ item.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import ChatIcon from './ChatIcon.vue';

const items = [
  { key: 'album', label: '相册', icon: 'image' },
  { key: 'camera', label: '拍摄', icon: 'camera' },
  { key: 'video-call', label: '视频通话', icon: 'video' },
  { key: 'voice-call', label: '语音通话', icon: 'phone' },
  { key: 'file', label: '文件', icon: 'file' },
  { key: 'location', label: '位置', icon: 'location' }
];

defineEmits<{ (event: 'action', key: string): void }>();
</script>

<style scoped lang="scss">
.more-panel {
  height: calc(232px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #eef1f6;
  padding: 18px 10px 0;
  flex-shrink: 0;
}
.grid {
  display: flex;
  flex-wrap: wrap;
}
.cell {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  margin-bottom: 18px;
}
.tile {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: #f3f5fa;
  display: flex;
  align-items: center;
  justify-content: center;
}
.label {
  font-size: 11px;
  color: #7b8598;
  line-height: 14px;
}
</style>
