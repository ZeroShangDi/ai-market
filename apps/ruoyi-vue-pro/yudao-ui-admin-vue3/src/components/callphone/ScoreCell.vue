<script setup lang="ts">
defineOptions({ name: 'CallPhoneScoreCell' })
defineProps<{ value: number }>()
</script>

<template>
  <div class="score-cell">
    <el-progress :percentage="value" :show-text="false" :stroke-width="6" />
    <strong>{{ value }}</strong>
  </div>
</template>

<style scoped>
.score-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.score-cell :deep(.el-progress) {
  flex: 1;
}

.score-cell strong {
  width: 24px;
  font-size: 12px;
  color: var(--el-text-color-primary);
  text-align: right;
}
</style>
