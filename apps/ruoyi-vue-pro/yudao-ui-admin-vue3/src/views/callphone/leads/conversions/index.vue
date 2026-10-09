<template>
  <div class="conversion-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="本地生成的转化记录保存在此浏览器，并与线索池、客户列表共享演示数据。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading"
        ><div><h1>线索转化记录</h1><p>追踪线索转为客户的负责人、渠道和处理说明。</p></div
        ><el-tag effect="plain">{{ total }} 条转化</el-tag></header
      >
      <el-form :inline="true" :model="query" class="filter-bar" @submit.prevent="load">
        <el-form-item label="号码后四位"
          ><el-input
            v-model="query.query"
            maxlength="4"
            clearable
            placeholder="输入号码后四位"
            @keyup.enter="load"
        /></el-form-item>
        <el-form-item
          ><el-button type="primary" @click="load">查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="原线索" min-width="145"
          ><template #default="{ row }"
            ><strong>{{ row.leadName }}</strong
            ><small class="subline">{{ row.phoneDisplay }}</small></template
          ></el-table-column
        >
        <el-table-column label="转入客户" min-width="145"
          ><template #default="{ row }"
            ><strong>{{ row.customerName }}</strong
            ><small class="subline">客户编号 {{ row.customerId }}</small></template
          ></el-table-column
        >
        <el-table-column label="来源渠道" min-width="130"
          ><template #default="{ row }">{{
            sourceLabel(row.sourceCode)
          }}</template></el-table-column
        >
        <el-table-column label="转化人" prop="converterName" width="130" />
        <el-table-column label="转化时间" min-width="170"
          ><template #default="{ row }">{{
            formatTime(row.convertedAt)
          }}</template></el-table-column
        >
        <el-table-column label="说明" min-width="160" show-overflow-tooltip
          ><template #default="{ row }">{{ row.note || '—' }}</template></el-table-column
        >
        <el-table-column label="操作" width="100" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="openDetail(row)">查看详情</el-button></template
          ></el-table-column
        >
        <template #empty
          ><el-empty :description="error || '暂无转化记录。在线索池领取线索后可将其转为客户。'"
        /></template>
      </el-table>
      <footer class="table-footer"
        ><span>共 {{ total.toLocaleString() }} 条</span
        ><el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="load"
      /></footer>
    </section>
    <el-drawer v-model="drawerVisible" title="线索转化详情" size="480px">
      <template v-if="detail"
        ><el-descriptions :column="1" border
          ><el-descriptions-item label="原线索">{{ detail.leadName }}</el-descriptions-item
          ><el-descriptions-item label="联系电话">{{ detail.phoneDisplay }}</el-descriptions-item
          ><el-descriptions-item label="转入客户">{{ detail.customerName }}</el-descriptions-item
          ><el-descriptions-item label="客户编号">{{ detail.customerId }}</el-descriptions-item
          ><el-descriptions-item label="来源渠道">{{
            sourceLabel(detail.sourceCode)
          }}</el-descriptions-item
          ><el-descriptions-item label="转化人">{{
            detail.converterName || '—'
          }}</el-descriptions-item
          ><el-descriptions-item label="转化时间">{{
            formatTime(detail.convertedAt)
          }}</el-descriptions-item
          ><el-descriptions-item label="转化说明">{{
            detail.note || '—'
          }}</el-descriptions-item></el-descriptions
        ><div class="drawer-footer"
          ><el-button @click="goCustomers">前往客户列表</el-button></div
        ></template
      >
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import * as LeadApi from '@/api/callphone/lead'
import * as PreviewStore from '@/api/callphone/preview-store'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
defineOptions({ name: 'CallPhoneLeadConversions' })
const route = useRoute(),
  router = useRouter(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false),
  error = ref(''),
  drawerVisible = ref(false),
  detail = ref<any>(),
  rows = ref<any[]>([]),
  total = ref(0)
const query = reactive({ pageNo: 1, pageSize: 10, query: '' })
const sources = [
  { value: 'manual', label: '手工录入' },
  { value: 'web_form', label: '网站表单' },
  { value: 'referral', label: '客户转介绍' },
  { value: 'channel', label: '渠道获客' }
]
async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = { ...query, query: query.query || undefined }
    const result = previewMode
      ? PreviewStore.previewLeadConversions(params)
      : await LeadApi.getLeadConversionPage(params)
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.message || '转化记录加载失败'
  } finally {
    loading.value = false
  }
}
function reset() {
  query.pageNo = 1
  query.query = ''
  load()
}
function openDetail(row: any) {
  detail.value = row
  drawerVisible.value = true
}
function sourceLabel(code?: string) {
  return sources.find((item) => item.value === code)?.label || code || '—'
}
function formatTime(value?: string) {
  return value ? parseCallPhoneDateTime(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
function goCustomers() {
  router.push({
    path: previewMode ? '/callphone-preview/customers' : '/callphone/customers/list',
    query: previewMode ? { preview: '1' } : undefined
  })
}
onMounted(load)
</script>

<style scoped>
.conversion-page {
  padding: 20px;
}

.preview-banner {
  margin-bottom: 14px;
}

.page-panel {
  padding: 22px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: var(--el-text-color-primary);
}

.page-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.filter-bar {
  margin-bottom: 8px;
}

.subline {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  color: var(--el-text-color-secondary);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
