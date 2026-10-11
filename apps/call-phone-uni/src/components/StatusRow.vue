<template>
  <view class="status-row">
    <view class="status-copy"><text class="status-title">{{ title }}</text><text v-if="detail" class="status-detail">{{ detail }}</text></view>
    <view class="status-value" :class="state"><text class="status-symbol" aria-hidden="true">{{ symbol }}</text><text>{{ label }}</text></view>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ title: string; detail?: string; state: 'ready' | 'action' | 'unknown' | 'checking'; label: string }>();
const symbol = computed(() => ({ ready: '✓', action: '!', unknown: '—', checking: '↻' })[props.state]);
</script>
<style scoped>
.status-row { display: flex; align-items: center; gap: 14px; min-height: 62px; padding: 13px 0; border-bottom: 1px solid #edf0f5; }
.status-row:last-child { border-bottom: none; }
.status-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.status-title { color: #202838; font-size: 14px; font-weight: 500; }
.status-detail { font-size: 11px; color: #788397; line-height: 1.5; }
.status-value { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #798397; max-width: 45%; }
.status-symbol { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #eef1f5; flex-shrink: 0; font-weight: 700; }
.ready { color: #138464; }.ready .status-symbol { background: #e5f6ed; }
.action { color: #b76b11; }.action .status-symbol { background: #fff3df; }
.checking { color: #294fdb; }
</style>
