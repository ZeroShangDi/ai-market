<script setup lang="ts">
import PageOperationColumn, { type PageRowAction } from './PageOperationColumn.vue'

export type PageTableColumn = {
  prop: string
  label: string
  width?: string | number
  minWidth?: string | number
  align?: 'left' | 'center' | 'right'
  fixed?: boolean | 'left' | 'right'
  type?: 'selection' | 'index' | 'actions'
  formatter?: (row: Record<string, any>) => string | number
  actions?: PageRowAction[]
}

defineOptions({ name: 'CallPhonePageTable' })

const props = withDefaults(
  defineProps<{
    columns: PageTableColumn[]
    data: Record<string, any>[]
    total: number
    page: number
    pageSize: number
    loading?: boolean
    rowKey?: string
    actions?: PageRowAction[]
    emptyText?: string
  }>(),
  { loading: false, rowKey: 'id', actions: () => [], emptyText: '暂无数据' }
)

const emit = defineEmits<{
  'update:page': [value: number]
  'update:pageSize': [value: number]
  'page-change': [value: { page: number; limit: number }]
  'selection-change': [rows: Record<string, any>[]]
}>()

function rowActions(column: PageTableColumn) {
  return column.actions || props.actions
}
</script>

<template>
  <div class="page-table">
    <div class="page-table-grid">
      <el-table
        :data="data"
        :row-key="rowKey"
        v-loading="loading"
        height="100%"
        border
        @selection-change="emit('selection-change', $event)"
      >
        <el-table-column
          v-for="(column, index) in columns"
          :key="column.prop || `${column.type}-${index}`"
          :type="column.type === 'actions' ? undefined : column.type"
          :label="column.label"
          :prop="column.type === 'actions' ? undefined : column.prop"
          :width="column.width"
          :min-width="column.minWidth"
          :align="column.align || 'left'"
          :fixed="column.fixed"
          :show-overflow-tooltip="column.type !== 'actions'"
        >
          <template v-if="column.type === 'actions'" #default="{ row }">
            <PageOperationColumn :row="row" :actions="rowActions(column)" />
          </template>
          <template
            v-else-if="column.type !== 'selection' && column.type !== 'index'"
            #default="scope"
          >
            <slot :name="column.prop" :row="scope.row" :column="column" :index="scope.$index">
              {{ column.formatter ? column.formatter(scope.row) : (scope.row[column.prop] ?? '—') }}
            </slot>
          </template>
        </el-table-column>
        <template #empty
          ><slot name="empty">{{ emptyText }}</slot></template
        >
      </el-table>
    </div>
    <footer class="page-table-footer">
      <slot name="footer"></slot>
      <Pagination
        :total="total"
        :page="page"
        :limit="pageSize"
        @update:page="emit('update:page', $event)"
        @update:limit="emit('update:pageSize', $event)"
        @pagination="emit('page-change', $event)"
      />
    </footer>
  </div>
</template>

<style scoped>
.page-table {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.page-table-grid {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.page-table-grid :deep(.el-table) {
  height: 100%;
}

.page-table-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding-top: 8px;
}

.page-table-footer :deep(.el-pagination) {
  margin: 0;
}
</style>
