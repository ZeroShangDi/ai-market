<script setup lang="ts">
import { Icon } from '@/components/Icon'

export type PageButtonItem = {
  key: string
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  icon?: string
  disabled?: boolean
  visible?: boolean
  onClick?: () => void
}

defineOptions({ name: 'CallPhonePageButtons' })

withDefaults(defineProps<{ items?: PageButtonItem[]; menuItems?: PageButtonItem[] }>(), {
  items: () => [],
  menuItems: () => []
})

function run(item: PageButtonItem) {
  item.onClick?.()
}
</script>

<template>
  <div class="page-buttons">
    <el-button
      v-for="item in items.filter((entry) => entry.visible !== false)"
      :key="item.key"
      :type="item.type"
      :disabled="item.disabled"
      @click="run(item)"
    >
      <Icon v-if="item.icon" :icon="item.icon" />
      {{ item.label }}
    </el-button>
    <el-dropdown v-if="menuItems.some((entry) => entry.visible !== false)" trigger="click">
      <el-button> 更多操作<Icon class="more-icon" icon="ep:arrow-down" /> </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="item in menuItems.filter((entry) => entry.visible !== false)"
            :key="item.key"
            :disabled="item.disabled"
            @click="run(item)"
          >
            <Icon v-if="item.icon" :icon="item.icon" />
            {{ item.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <slot></slot>
  </div>
</template>

<style scoped>
.page-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.more-icon {
  margin-left: 5px;
}
</style>
