<template>
  <div class="ai-usage-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="演示记录和反馈保存在当前浏览器；本页只展示调用元数据，不展示用户原始提示词、通话录音或完整模型输入输出。"
      type="info"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div
          ><h1>AI 使用记录</h1
          ><p>查看功能调用状态、耗时和用量。敏感输入与模型原文不会出现在此审计列表。</p></div
        >
        <el-button @click="load"><Icon icon="ep:refresh" />刷新</el-button>
      </header>
      <div class="metrics">
        <article
          ><span>当前页调用</span><strong>{{ metrics.today }}</strong
          ><small>当前页数据</small></article
        >
        <article
          ><span>成功率</span><strong>{{ metrics.successRate }}%</strong
          ><small>当前页成功 / 已结束调用</small></article
        >
        <article
          ><span>平均耗时</span><strong>{{ metrics.averageLatency }}<i>ms</i></strong
          ><small>仅统计已完成调用</small></article
        >
        <article
          ><span>估算费用</span><strong>¥{{ metrics.cost.toFixed(3) }}</strong
          ><small>供应商未提供时不估算</small></article
        >
      </div>
      <div class="filters">
        <el-input
          v-model="filters.query"
          clearable
          placeholder="模型标识或功能"
          class="query"
          @keyup.enter="search"
          ><template #prefix><Icon icon="ep:search" /></template
        ></el-input>
        <el-select v-model="filters.feature" clearable placeholder="全部功能" @change="search"
          ><el-option
            v-for="item in featureOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
        /></el-select>
        <el-select v-model="filters.status" clearable placeholder="全部状态" @change="search"
          ><el-option
            v-for="item in statusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
        /></el-select>
        <el-date-picker
          v-model="dateRange"
          type="datetimerange"
          value-format="YYYY-MM-DD HH:mm:ss"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          range-separator="至"
          @change="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="记录编号" prop="id" min-width="120" />
        <el-table-column label="使用成员" min-width="120"
          ><template #default="{ row }">{{
            row.actorName || `成员 ${row.actorUserId}`
          }}</template></el-table-column
        >
        <el-table-column label="功能" min-width="150"
          ><template #default="{ row }">{{ featureLabel(row.feature) }}</template></el-table-column
        >
        <el-table-column label="关联对象" min-width="150"
          ><template #default="{ row }"
            ><span v-if="row.sourceId" class="source-link"
              >{{ sourceTypeLabel(row.sourceType) }} · {{ row.sourceId }}</span
            ><span v-else class="muted">—</span></template
          ></el-table-column
        >
        <el-table-column label="模型 / 版本" min-width="200"
          ><template #default="{ row }"
            ><strong class="model-name">{{ row.modelKey }}</strong
            ><small class="sub-text"
              >提示词版本 {{ row.promptVersion || '未记录' }}</small
            ></template
          ></el-table-column
        >
        <el-table-column label="状态" width="115"
          ><template #default="{ row }"
            ><el-tag :type="statusType(row.status)" effect="light">{{
              statusLabel(row.status)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="耗时" width="100"
          ><template #default="{ row }">{{
            row.latencyMs == null ? '—' : `${row.latencyMs} ms`
          }}</template></el-table-column
        >
        <el-table-column label="Token 输入 / 输出" width="150"
          ><template #default="{ row }"
            >{{ row.inputTokens ?? '—' }} / {{ row.outputTokens ?? '—' }}</template
          ></el-table-column
        >
        <el-table-column label="估算费用" width="110"
          ><template #default="{ row }">{{
            row.estimatedCost == null ? '—' : `¥${row.estimatedCost.toFixed(4)}`
          }}</template></el-table-column
        >
        <el-table-column label="调用时间" prop="createdAt" min-width="170" />
        <el-table-column label="操作" fixed="right" width="90"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="openDetail(row)">查看详情</el-button></template
          ></el-table-column
        >
        <template #empty
          ><el-empty :description="loadError || '没有符合条件的调用记录'"
        /></template>
      </el-table>
      <div class="table-footer"
        ><span>共 {{ total }} 条记录</span
        ><el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @change="load"
      /></div>
      <div class="privacy-note"
        ><Icon
          icon="ep:lock"
        />审计页面仅展示元数据。通话内容、原始提示词及完整模型响应须按客户保留策略单独授权访问。</div
      >
    </section>

    <el-drawer v-model="detailVisible" title="AI 调用详情" size="520px" class="ai-usage-drawer">
      <template v-if="current">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="记录编号">{{ current.id }}</el-descriptions-item>
          <el-descriptions-item label="功能">{{
            featureLabel(current.feature)
          }}</el-descriptions-item>
          <el-descriptions-item label="使用成员">{{
            current.actorName || `成员 ${current.actorUserId}`
          }}</el-descriptions-item>
          <el-descriptions-item label="关联对象">{{
            current.sourceId ? `${sourceTypeLabel(current.sourceType)} · ${current.sourceId}` : '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="模型">{{ current.modelKey }}</el-descriptions-item>
          <el-descriptions-item label="提示词版本">{{
            current.promptVersion || '未记录'
          }}</el-descriptions-item>
          <el-descriptions-item label="状态"
            ><el-tag :type="statusType(current.status)">{{
              statusLabel(current.status)
            }}</el-tag></el-descriptions-item
          >
          <el-descriptions-item label="耗时">{{
            current.latencyMs == null ? '—' : `${current.latencyMs} ms`
          }}</el-descriptions-item>
          <el-descriptions-item label="Token 用量"
            >{{ current.inputTokens ?? '—' }} 输入 /
            {{ current.outputTokens ?? '—' }} 输出</el-descriptions-item
          >
          <el-descriptions-item label="错误代码">{{
            current.errorCode || '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ current.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="内容保护"
            >提示词原文、录音和模型完整输入输出不在此页返回</el-descriptions-item
          >
        </el-descriptions>
        <el-divider content-position="left">使用反馈</el-divider>
        <div v-if="current.feedbackRating" class="saved-feedback"
          ><el-rate :model-value="current.feedbackRating" disabled /><span>{{
            feedbackReasonLabel(current.feedbackReason)
          }}</span></div
        >
        <el-form
          v-else
          ref="feedbackFormRef"
          :model="feedback"
          :rules="feedbackRules"
          label-position="top"
          class="feedback-form"
        >
          <el-form-item label="这次结果是否有帮助？" prop="rating"
            ><el-rate
              v-model="feedback.rating"
              show-text
              :texts="['无帮助', '较差', '一般', '有帮助', '非常有帮助']"
          /></el-form-item>
          <el-form-item label="主要原因"
            ><el-select v-model="feedback.reasonCode" clearable placeholder="可选"
              ><el-option
                v-for="item in feedbackOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value" /></el-select
          ></el-form-item>
          <el-form-item
            ><el-button type="primary" :loading="savingFeedback" @click="submitFeedback"
              >提交反馈</el-button
            ></el-form-item
          >
        </el-form>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import * as AiUsageApi from '@/api/callphone/ai-usage'
import * as AiUsagePreview from '@/api/callphone/ai-usage/preview'

defineOptions({ name: 'CallPhoneAiUsage' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const featureOptions = [
  { value: 'script_assistant', label: '话术助手' },
  { value: 'knowledge_search', label: '知识库检索' },
  { value: 'call_summary', label: '通话总结' },
  { value: 'follow_up_suggestion', label: '跟进建议' },
  { value: 'review_assistance', label: '复核辅助' }
]
const statusOptions = [
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '处理中' },
  { value: 'succeeded', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' }
]
const feedbackOptions = [
  { value: 'accurate', label: '内容准确' },
  { value: 'useful', label: '建议实用' },
  { value: 'irrelevant', label: '内容无关' },
  { value: 'incorrect', label: '信息不准确' }
]
const loading = ref(false),
  savingFeedback = ref(false),
  detailVisible = ref(false),
  loadError = ref('')
const rows = ref<AiUsageApi.AiUsageVO[]>([]),
  current = ref<AiUsageApi.AiUsageVO | null>(null)
const pageNo = ref(1),
  pageSize = ref(10),
  total = ref(0)
const filters = reactive({ query: '', feature: '', status: '' as AiUsageApi.AiRunStatus | '' })
const dateRange = ref<[string, string] | undefined>()
const feedbackFormRef = ref<FormInstance>()
const feedback = reactive<AiUsageApi.AiUsageFeedback>({ rating: 0, reasonCode: undefined })
const feedbackRules: FormRules = {
  rating: [
    {
      validator: (_rule, value, callback) =>
        value > 0 ? callback() : callback(new Error('请先选择评分')),
      trigger: 'change'
    }
  ]
}

const metrics = computed(() => {
  const ended = rows.value.filter((row) =>
    ['succeeded', 'failed', 'cancelled'].includes(row.status)
  )
  const success = ended.filter((row) => row.status === 'succeeded').length
  const measured = rows.value.filter((row) => row.latencyMs != null)
  return {
    today: rows.value.filter(
      (row) => row.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)
    ).length,
    successRate: ended.length ? Math.round((success * 100) / ended.length) : 0,
    averageLatency: measured.length
      ? Math.round(measured.reduce((sum, row) => sum + (row.latencyMs || 0), 0) / measured.length)
      : 0,
    cost: rows.value.reduce((sum, row) => sum + (row.estimatedCost || 0), 0)
  }
})

function pageParams(): AiUsageApi.AiUsagePageParams {
  return {
    pageNo: pageNo.value,
    pageSize: pageSize.value,
    query: filters.query || undefined,
    feature: filters.feature || undefined,
    status: filters.status || undefined,
    from: dateRange.value?.[0],
    to: dateRange.value?.[1]
  }
}
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = previewMode
      ? AiUsagePreview.getPreviewAiUsagePage(pageParams())
      : await AiUsageApi.getAiUsagePage(pageParams())
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error: any) {
    rows.value = []
    total.value = 0
    loadError.value = error?.message || 'AI 使用记录加载失败'
  } finally {
    loading.value = false
  }
}
function search() {
  pageNo.value = 1
  void load()
}
async function openDetail(row: AiUsageApi.AiUsageVO) {
  try {
    current.value = previewMode
      ? AiUsagePreview.getPreviewAiUsageDetail(row.id)
      : await AiUsageApi.getAiUsageDetail(row.id)
  } catch (error: any) {
    current.value = null
    ElMessage.error(error?.message || '调用详情加载失败')
    return
  }
  if (!current.value) {
    ElMessage.warning('这条记录不存在或无权查看')
    return
  }
  feedback.rating = 0
  feedback.reasonCode = undefined
  detailVisible.value = true
}
async function submitFeedback() {
  if (!current.value || !(await feedbackFormRef.value?.validate().catch(() => false))) return
  savingFeedback.value = true
  try {
    if (previewMode) AiUsagePreview.savePreviewAiUsageFeedback(current.value.id, feedback)
    else await AiUsageApi.submitAiUsageFeedback(current.value.id, feedback)
    current.value.feedbackRating = feedback.rating
    current.value.feedbackReason = feedback.reasonCode
    ElMessage.success('反馈已提交')
  } catch (error: any) {
    ElMessage.error(error?.message || '反馈提交失败')
  } finally {
    savingFeedback.value = false
  }
}
function featureLabel(value: string) {
  return featureOptions.find((item) => item.value === value)?.label || value
}
function sourceTypeLabel(value?: string) {
  return (
    ({ call_record: '通话', customer: '客户', lead: '线索' } as Record<string, string>)[
      value || ''
    ] || '业务对象'
  )
}
function statusLabel(value: string) {
  return statusOptions.find((item) => item.value === value)?.label || value
}
function statusType(value: string): 'success' | 'warning' | 'danger' | 'info' {
  return (
    (
      {
        succeeded: 'success',
        failed: 'danger',
        queued: 'info',
        running: 'warning',
        cancelled: 'info'
      } as Record<string, 'success' | 'warning' | 'danger' | 'info'>
    )[value] || 'info'
  )
}
function feedbackReasonLabel(value?: string) {
  return feedbackOptions.find((item) => item.value === value)?.label || '已反馈'
}
onMounted(load)
</script>

<style scoped>
.ai-usage-page {
  --el-bg-color: #fff;
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;
  --el-fill-color-blank: #fff;
  --el-fill-color-light: #f5f7fa;

  min-height: calc(100vh - 100px);
  padding: 20px;
  color: #293347;
  background: #f5f7fb;
  color-scheme: light;
}

.preview-banner {
  max-width: 1500px;
  margin: 0 auto 14px;
}

.page-panel {
  max-width: 1500px;
  padding: 22px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #e5e9f0;
  border-radius: 10px;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: #253149;
}

.page-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7a8598;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.metrics article {
  padding: 14px 16px;
  border: 1px solid #e8ecf3;
  border-radius: 8px;
}

.metrics span,
.metrics small {
  display: block;
  font-size: 12px;
  color: #8490a1;
}

.metrics strong {
  display: block;
  margin: 7px 0 4px;
  font-size: 23px;
  color: #253149;
}

.metrics i {
  margin-left: 4px;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  color: #7a8598;
}

.filters {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.filters .query {
  width: 250px;
}

.filters .el-select {
  width: 145px;
}

.model-name {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #35435a;
}

.sub-text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #929cad;
}

.source-link {
  color: #4968c8;
}

.muted {
  color: #929cad;
}

.table-footer {
  display: flex;
  padding-top: 16px;
  font-size: 12px;
  color: #7a8598;
  align-items: center;
  justify-content: space-between;
}

.privacy-note {
  display: flex;
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.6;
  color: #78869b;
  align-items: flex-start;
  gap: 7px;
}

.privacy-note :deep(svg) {
  flex: none;
  margin-top: 2px;
  color: #5271c3;
}

.ai-usage-page :deep(.el-table),
.ai-usage-page :deep(.el-table tr),
.ai-usage-page :deep(.el-table th.el-table__cell) {
  color: #303133;
  background: #fff;
}

.ai-usage-page :deep(.el-table tr:hover > td.el-table__cell) {
  background: #f5f7fa;
}

.saved-feedback {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #7a8598;
}

.feedback-form :deep(.el-select) {
  width: 100%;
}

:global(.el-drawer.ai-usage-drawer) {
  --el-drawer-bg-color: #fff;
  --el-drawer-text-color: #293347;

  color: #293347;
  background: #fff;
  color-scheme: light;
}

:global(.el-drawer.ai-usage-drawer .el-drawer__header) {
  color: #253149;
}

@media (width <=900px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filters .query {
    width: 100%;
  }
}

@media (width <=640px) {
  .ai-usage-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .metrics {
    gap: 8px;
  }

  .table-footer {
    align-items: flex-start;
    gap: 10px;
    flex-direction: column;
  }
}
</style>
