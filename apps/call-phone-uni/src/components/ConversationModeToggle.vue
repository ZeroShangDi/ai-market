<template>
  <view class="mode-toggle" :class="{ locked }" :role="locked ? undefined : 'switch'" :aria-checked="mode === 'work'" :aria-label="locked ? (mode === 'work' ? '工作模式' : '聊天模式') : '切换聊天与工作模式'" @tap="!locked && $emit('change', mode === 'work' ? 'chat' : 'work')">
    <TIcon :name="mode === 'work' ? 'tools' : 'chat'" :color="mode === 'work' ? '#9a79c9' : '#5885ce'" size="15px" />
    <text>{{ mode === 'work' ? '工作' : '聊天' }}</text>
    <TIcon v-if="!locked" name="swap" size="14px" color="#8a8d93" />
  </view>
</template>
<script setup lang="ts">
import TIcon from '@tdesign/uniapp/icon/icon.vue';
defineProps<{ mode: 'chat' | 'work'; locked: boolean }>();
defineEmits<{ (event: 'change', mode: 'chat' | 'work'): void }>();
</script>
<style scoped>
.mode-toggle { display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 11px; border: 1px solid #e5e6e8; background: #fff; border-radius: 18px; color: #383b40; font-size: 12px; }
.mode-toggle.locked { border-color: transparent; background: transparent; padding: 0 4px; color: #797d84; }
</style>
