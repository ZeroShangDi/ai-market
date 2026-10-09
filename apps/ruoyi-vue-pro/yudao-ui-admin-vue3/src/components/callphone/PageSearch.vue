<script setup lang="ts">
import { Search } from '@/components/Search'
import type { FormSchema } from '@/types/form'

defineOptions({ name: 'CallPhonePageSearch' })

defineProps<{ schema: FormSchema[]; model: Record<string, any> }>()
const emit = defineEmits<{
  search: [values: Record<string, any>]
  reset: [values: Record<string, any>]
}>()
</script>

<template>
  <div class="page-search-form">
    <Search
      :schema="schema"
      :model="model"
      @search="emit('search', $event)"
      @reset="emit('reset', $event)"
    >
      <template #actionMore><slot name="actions"></slot></template>
      <template v-for="(_, name) in $slots" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps || {}"></slot>
      </template>
    </Search>
  </div>
</template>

<style scoped>
.page-search-form :deep(.el-form-item) {
  margin-bottom: 8px;
}
</style>
