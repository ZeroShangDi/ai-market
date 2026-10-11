<template>
  <view class="check-card" :class="state">
    <view class="card-line">
      <view class="state-icon" :aria-label="status"><text aria-hidden="true">{{ symbol }}</text></view>
      <text class="card-title">{{ title }}</text>
      <button v-if="needsAction && !description" class="card-action" :disabled="busy" @tap="$emit('action')">{{ action }}</button>
      <text v-else class="card-status">{{ status }}</text>
    </view>
    <view v-if="description" class="card-extra">
      <text class="card-description">{{ description }}</text>
      <button v-if="needsAction" class="card-action" :disabled="busy" @tap="$emit('action')">{{ action }}</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ title: string; state: 'ready' | 'action' | 'unknown' | 'checking'; status: string; description?: string; action?: string; busy?: boolean }>();
defineEmits<{ (event: 'action'): void }>();
const symbol = computed(() => ({ ready: '✓', action: '!', unknown: '?', checking: '↻' })[props.state]);
const needsAction = computed(() => props.state !== 'ready' && props.state !== 'checking' && !!props.action);
</script>
<style scoped>
.check-card { background: #fff; border-radius: 14px; padding: 0 16px; margin-bottom: 9px; }
.card-line { display: flex; align-items: center; gap: 12px; min-height: 64px; }
.state-icon { flex-shrink: 0; width: 23px; height: 23px; border-radius: 50%; background: #eff1f4; color: #8b93a1; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.ready .state-icon { background: #e8f6ef; color: #219766; }.action .state-icon { background: #fff1dc; color: #ce851b; }.checking .state-icon { background: #eaf0ff; color: #365bd7; }
.card-title { flex: 1; min-width: 0; font-size: 15px; font-weight: 500; color: #202735; }
.card-status { font-size: 12px; color: #9098a5; flex-shrink: 0; }
.card-action { flex-shrink: 0; width: auto; margin: 0; padding: 0 14px; min-height: 34px; line-height: 34px; font-size: 12px; border-radius: 17px; background: #edf2ff; color: #315bd5; font-weight: 500; }
.card-action::after { border: none; }.card-action[disabled] { opacity: .45; }
.card-extra { margin: -4px 0 0 35px; padding-bottom: 16px; display: flex; align-items: flex-start; flex-direction: column; gap: 13px; }
.card-description { font-size: 12px; line-height: 1.75; color: #818a99; }
</style>
