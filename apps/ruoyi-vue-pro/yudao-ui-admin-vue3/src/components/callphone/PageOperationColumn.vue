<script setup lang="ts">
export type PageRowAction = {
  key: string
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  visible?: (row: Record<string, any>) => boolean
  disabled?: (row: Record<string, any>) => boolean
  loading?: (row: Record<string, any>) => boolean
  onClick: (row: Record<string, any>) => void
}

defineOptions({ name: 'CallPhonePageOperationColumn' })

defineProps<{ row: Record<string, any>; actions: PageRowAction[] }>()
</script>

<template>
  <div class="page-row-actions">
    <el-button
      v-for="action in actions.filter((item) => item.visible?.(row) !== false)"
      :key="action.key"
      link
      :type="action.type || 'primary'"
      :disabled="action.disabled?.(row)"
      :loading="action.loading?.(row)"
      @click="action.onClick(row)"
    >
      {{ action.label }}
    </el-button>
  </div>
</template>

<style scoped>
.page-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.page-row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
