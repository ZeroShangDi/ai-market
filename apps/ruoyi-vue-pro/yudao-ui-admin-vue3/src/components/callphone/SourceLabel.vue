<script setup lang="ts">
defineOptions({ name: 'CallPhoneSourceLabel' })
defineProps<{ value?: string; options: { value: string; label: string }[] }>()
</script>

<template>
  {{ options.find((item) => item.value === value)?.label || value || '—' }}
</template>
