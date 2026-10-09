<template>
  <main class="diagnostics-page">
    <header class="page-heading">
      <div>
        <div class="breadcrumb">Call Phone <span>/</span> 系统设置</div>
        <h1>诊断与日志</h1>
        <p>查看 Call Phone 接口访问状态和请求耗时，帮助定位本地服务问题。</p>
      </div>
      <div class="heading-actions">
        <el-button @click="exportCurrent"><Icon icon="ep:download" />导出当前页摘要</el-button>
        <el-button type="primary" :loading="loading" @click="load"
          ><Icon icon="ep:refresh" />刷新</el-button
        >
      </div>
    </header>

    <el-alert class="privacy-note" type="info" :closable="false" show-icon>
      <template #title
        >日志从芋道基础设施模块读取，并在服务端限制为 Call Phone
        接口路径。页面不展示请求参数、响应正文、IP 或浏览器指纹。</template
      >
    </el-alert>

    <section class="health-grid">
      <article class="health-card"
        ><div class="health-icon success"><Icon icon="ep:connection" /></div
        ><div
          ><span>本地管理服务</span><strong>{{ healthLabel }}</strong
          ><small>{{ lastChecked || '等待读取日志' }}</small></div
        ></article
      >
      <article class="health-card"
        ><div class="health-icon blue"><Icon icon="ep:document" /></div
        ><div
          ><span>符合条件请求总数</span><strong>{{ page.total }}</strong
          ><small>当前页展示 {{ page.list.length }} 条</small></div
        ></article
      >
      <article class="health-card"
        ><div class="health-icon warning"><Icon icon="ep:warning" /></div
        ><div
          ><span>当前页失败请求</span><strong>{{ failureCount }}</strong
          ><small>结果码非 0</small></div
        ></article
      >
      <article class="health-card"
        ><div class="health-icon purple"><Icon icon="ep:timer" /></div
        ><div
          ><span>当前页慢请求</span><strong>{{ slowCount }}</strong
          ><small>执行时间超过 1.5 秒</small></div
        ></article
      >
    </section>

    <el-card class="log-card" shadow="never">
      <div class="toolbar">
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :clearable="false"
        />
        <el-select v-model="filters.result" class="result-filter" @change="search"
          ><el-option label="当前页：全部结果" value="all" /><el-option
            label="当前页：仅失败"
            value="failed" /><el-option label="当前页：仅成功" value="success"
        /></el-select>
        <el-button type="primary" @click="search">查询</el-button
        ><el-button @click="reset">重置</el-button>
        <span class="scope-label"><Icon icon="ep:lock" />固定筛选 `/callphone/`</span>
      </div>
      <el-table
        :data="page.list"
        v-loading="loading"
        row-key="id"
        empty-text="没有符合条件的 Call Phone 请求日志"
      >
        <el-table-column label="请求时间" width="175"
          ><template #default="{ row }">{{ formatDate(row.beginTime) }}</template></el-table-column
        >
        <el-table-column label="接口" min-width="250" show-overflow-tooltip
          ><template #default="{ row }"
            ><el-tag size="small" effect="plain" class="method-tag">{{ row.requestMethod }}</el-tag
            ><span class="path-text">{{ safePath(row.requestUrl) }}</span></template
          ></el-table-column
        >
        <el-table-column label="操作" min-width="135"
          ><template #default="{ row }"
            ><strong>{{ row.operateName || 'API 请求' }}</strong
            ><small class="sub-line">{{
              row.operateModule || row.applicationName
            }}</small></template
          ></el-table-column
        >
        <el-table-column label="耗时" width="110"
          ><template #default="{ row }"
            ><span :class="row.duration > 1500 ? 'slow-text' : ''">{{ row.duration }} ms</span
            ><el-tag
              v-if="row.duration > 1500"
              size="small"
              type="warning"
              effect="light"
              class="slow-tag"
              >较慢</el-tag
            ></template
          ></el-table-column
        >
        <el-table-column label="结果" width="115"
          ><template #default="{ row }"
            ><el-tag :type="row.resultCode === 0 ? 'success' : 'danger'" effect="light">{{
              row.resultCode === 0 ? '成功' : `失败 ${row.resultCode}`
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="追踪" width="110"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="openDetail(row)">查看编号</el-button></template
          ></el-table-column
        >
      </el-table>
      <div class="pagination-row"
        ><span>共 {{ page.total }} 条日志</span
        ><el-pagination
          v-model:current-page="filters.pageNo"
          v-model:page-size="filters.pageSize"
          :total="page.total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @change="load"
      /></div>
    </el-card>

    <el-drawer
      v-model="detailVisible"
      class="diagnostic-drawer"
      title="接口请求诊断"
      size="500px"
      destroy-on-close
    >
      <template v-if="detail">
        <el-alert
          :type="detail.resultCode === 0 ? 'success' : 'error'"
          :closable="false"
          show-icon
          :title="
            detail.resultCode === 0 ? '请求已正常完成' : `请求失败，结果码 ${detail.resultCode}`
          "
        />
        <div class="trace-panel"
          ><span>请求关联编号</span><strong>{{ detail.traceId || '未记录' }}</strong
          ><el-button size="small" @click="copyTrace">复制编号</el-button></div
        >
        <dl class="detail-list">
          <div
            ><dt>请求时间</dt><dd>{{ formatDate(detail.beginTime) }}</dd></div
          >
          <div
            ><dt>请求方法</dt><dd>{{ detail.requestMethod }}</dd></div
          >
          <div
            ><dt>接口路径</dt><dd>{{ safePath(detail.requestUrl) }}</dd></div
          >
          <div
            ><dt>模块操作</dt
            ><dd
              >{{ detail.operateModule || '—' }} · {{ detail.operateName || 'API 请求' }}</dd
            ></div
          >
          <div
            ><dt>执行耗时</dt><dd>{{ detail.duration }} ms</dd></div
          >
          <div
            ><dt>结果码</dt><dd>{{ detail.resultCode }}</dd></div
          >
        </dl>
        <div class="redaction-note"
          ><Icon icon="ep:lock" /> 为保护客户数据，此页面不读取参数、响应正文、IP
          地址和浏览器信息。请用关联编号在客户部署的服务日志中定位详细原因。</div
        >
      </template>
    </el-drawer>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as DiagnosticsApi from '@/api/callphone/diagnostics'
import * as DiagnosticsPreview from '@/api/callphone/diagnostics/preview'
import type { CallPhoneApiLogPageParams, CallPhoneApiLogVO } from '@/api/callphone/diagnostics'

const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
const loading = ref(false)
const detailVisible = ref(false)
const detail = ref<CallPhoneApiLogVO>()
const lastChecked = ref('')
const today = new Date()
const dateText = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const weekAgo = new Date(today)
weekAgo.setDate(weekAgo.getDate() - 6)
const filters = reactive({
  pageNo: 1,
  pageSize: 20,
  result: 'all',
  dateRange: [dateText(weekAgo), dateText(today)] as string[]
})
const page = reactive({ list: [] as CallPhoneApiLogVO[], total: 0 })
const healthLabel = computed(() => (lastChecked.value ? '可读取日志' : '待检测'))
const failureCount = computed(() => page.list.filter((row) => row.resultCode !== 0).length)
const slowCount = computed(() => page.list.filter((row) => row.duration > 1500).length)
function formatDate(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '—'
}
function safePath(value: string) {
  return (value || '').split('?')[0]
}
function buildParams(): CallPhoneApiLogPageParams {
  const beginTime =
    filters.dateRange?.length === 2
      ? [`${filters.dateRange[0]} 00:00:00`, `${filters.dateRange[1]} 23:59:59`]
      : undefined
  return {
    pageNo: filters.pageNo,
    pageSize: filters.pageSize,
    requestUrl: '/callphone/',
    beginTime
  }
}
async function load() {
  loading.value = true
  try {
    const params = buildParams()
    const result: any = previewMode.value
      ? DiagnosticsPreview.getPreviewCallPhoneApiLogPage({
          ...params,
          resultCode: filters.result === 'failed' ? 1 : params.resultCode
        })
      : await DiagnosticsApi.getCallPhoneApiLogPage(params)
    const rows = (result.list || []) as CallPhoneApiLogVO[]
    page.list = rows.filter((row) =>
      filters.result === 'failed'
        ? row.resultCode !== 0
        : filters.result === 'success'
          ? row.resultCode === 0
          : true
    )
    page.total = result.total || 0
    lastChecked.value = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (error: any) {
    ElMessage.error(error?.message || '无法读取接口日志，请检查日志查询权限和本地服务状态')
    lastChecked.value = ''
  } finally {
    loading.value = false
  }
}
function search() {
  filters.pageNo = 1
  void load()
}
function reset() {
  filters.result = 'all'
  filters.dateRange = [dateText(weekAgo), dateText(today)]
  search()
}
function openDetail(row: CallPhoneApiLogVO) {
  detail.value = row
  detailVisible.value = true
}
async function copyTrace() {
  if (!detail.value?.traceId) return
  try {
    await navigator.clipboard.writeText(detail.value.traceId)
    ElMessage.success('追踪编号已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择追踪编号')
  }
}
function exportCurrent() {
  const csv = [
    '时间,方法,接口路径,操作,耗时毫秒,结果码,追踪编号',
    ...page.list.map((row) =>
      [
        formatDate(row.beginTime),
        row.requestMethod,
        safePath(row.requestUrl),
        row.operateName || '',
        row.duration,
        row.resultCode,
        row.traceId
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(',')
    )
  ].join('\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'callphone-api-diagnostics.csv'
  link.click()
  URL.revokeObjectURL(url)
}
onMounted(load)
</script>

<style scoped>
.diagnostics-page {
  --el-bg-color: #fff;
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;
  --el-fill-color-blank: #fff;
  --el-fill-color-light: #f5f7fa;

  min-height: 100%;
  padding: 24px 30px 32px;
  color: #303b4c;
  background: #f4f7fb;
  color-scheme: light;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

.heading-actions {
  display: flex;
  gap: 10px;
}

.breadcrumb {
  margin-bottom: 7px;
  font-size: 12px;
  color: #8b96a6;
}

.breadcrumb span {
  margin: 0 6px;
  color: #c0c8d2;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  color: #202b3c;
}

.page-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7d8999;
}

.privacy-note {
  margin-bottom: 16px;
  background: #f7fbff;
  border: 1px solid #dce8f6;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.health-card {
  display: flex;
  min-height: 100px;
  padding: 15px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 9px;
  align-items: center;
  gap: 12px;
}

.health-card > div:last-child {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.health-card span,
.health-card small {
  font-size: 12px;
  color: #8490a1;
}

.health-card strong {
  font-size: 19px;
  color: #29364c;
}

.health-icon {
  display: grid;
  width: 38px;
  height: 38px;
  font-size: 17px;
  border-radius: 10px;
  flex: none;
  place-items: center;
}

.health-icon.success {
  color: #21835d;
  background: #eaf7f0;
}

.health-icon.blue {
  color: #426ed0;
  background: #edf3ff;
}

.health-icon.warning {
  color: #c47710;
  background: #fff5e5;
}

.health-icon.purple {
  color: #755bc2;
  background: #f2efff;
}

.log-card {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 9px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 17px;
}

.result-filter {
  width: 150px;
}

.scope-label {
  display: inline-flex;
  margin-left: auto;
  font-size: 12px;
  color: #929dad;
  align-items: center;
  gap: 5px;
}

.method-tag {
  margin-right: 8px;
}

.path-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #46556b;
}

.sub-line {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #96a1af;
}

.slow-text {
  font-weight: 600;
  color: #b35e12;
}

.slow-tag {
  margin-left: 6px;
}

.pagination-row {
  display: flex;
  margin-top: 16px;
  font-size: 12px;
  color: #8994a3;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.trace-panel {
  display: flex;
  padding: 14px;
  margin: 20px 0;
  background: #fafbfd;
  border: 1px solid #e7edf5;
  border-radius: 8px;
  align-items: center;
  gap: 12px;
}

.trace-panel span {
  font-size: 12px;
  color: #8490a1;
}

.trace-panel strong {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: #334359;
  flex: 1;
}

.detail-list {
  margin: 0;
}

.detail-list > div {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 14px;
  padding: 13px 0;
  border-bottom: 1px solid #edf0f4;
}

.detail-list dt {
  font-size: 12px;
  color: #8995a5;
}

.detail-list dd {
  margin: 0;
  font-size: 13px;
  color: #3c4b60;
  overflow-wrap: anywhere;
}

.redaction-note {
  display: flex;
  padding: 12px;
  margin-top: 20px;
  font-size: 12px;
  line-height: 1.6;
  color: #738094;
  background: #f5f7fb;
  border-radius: 7px;
  gap: 8px;
}

.redaction-note :deep(svg) {
  flex: none;
  margin-top: 2px;
}

:global(.diagnostic-drawer.el-drawer) {
  color: #303b4c;
  background: #fff;
}

:global(.diagnostic-drawer .el-drawer__header) {
  padding: 20px 24px;
  margin-bottom: 0;
  color: #253246;
  border-bottom: 1px solid #edf0f4;
}

:global(.diagnostic-drawer .el-drawer__body) {
  padding: 22px 24px;
  background: #fff;
}

@media (width <= 1120px) {
  .health-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
