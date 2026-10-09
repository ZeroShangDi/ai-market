<script setup lang="ts">
defineOptions({ name: 'CallPhoneStatusTag' })
defineProps<{ status: string; labels: Record<string, string> }>()
</script>

<template>
  <el-tag :type="status === 'new' ? 'warning' : 'success'" effect="light">
    {{ labels[status] || status }}
  </el-tag>
</template>
