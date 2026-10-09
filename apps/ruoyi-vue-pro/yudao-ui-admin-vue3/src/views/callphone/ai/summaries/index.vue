<template>
  <div class="summary-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地演示数据"
      description="演示总结和编辑内容仅保存在当前浏览器。样例用于展示通话复盘流程，不代表真实 AI 生成结果。"
      type="warning"
      :closable="false"
    />
    <el-alert
      class="service-banner"
      title="AI 总结服务尚未连接"
      description="你仍可整理和保存人工通话总结。连接产品核心 AI 服务后，才能按次授权生成 AI 总结。"
      type="info"
      :closable="false"
      show-icon
    >
      <template #default>
        <div class="service-copy">
          <span>AI 生成当前不可用；人工总结和复盘记录可正常使用。</span>
          <el-button type="primary" disabled>生成 AI 总结</el-button>
        </div>
      </template>
    </el-alert>

    <section class="page-panel">
      <header class="page-heading">
        <div>
          <h1>通话总结</h1>
          <p>围绕已完成的通话整理客户需求、异议和下一步；总结需人工确认后用于后续跟进。</p>
        </div>
        <div class="heading-actions">
          <el-button @click="load"><Icon icon="ep:refresh" />刷新</el-button>
          <el-button type="primary" @click="openAvailableCalls">从已完成通话新建</el-button>
        </div>
      </header>

      <div class="summary-metrics">
        <article
          ><span>总结记录</span><strong>{{ total }}</strong
          ><small>当前筛选结果</small></article
        >
        <article
          ><span>待复核</span><strong class="pending">{{ pendingCount }}</strong
          ><small>需要人工确认</small></article
        >
        <article
          ><span>人工整理</span><strong>{{ manualCount }}</strong
          ><small>由成员编辑保存</small></article
        >
        <article
          ><span>{{ previewMode ? 'AI 样例' : 'AI 生成' }}</span
          ><strong>{{ aiCount }}</strong
          ><small>{{ previewMode ? '不代表真实服务结果' : '仅统计真实服务结果' }}</small></article
        >
      </div>

      <div class="filter-row">
        <el-input
          v-model="query"
          clearable
          class="query-input"
          placeholder="搜索通话编号"
          @keyup.enter="search"
        >
          <template #prefix><Icon icon="ep:search" /></template>
        </el-input>
        <el-select v-model="reviewStatus" clearable placeholder="全部复核状态" @change="search">
          <el-option label="待复核" value="draft" />
          <el-option label="已复核" value="reviewed" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" class="summary-table">
        <el-table-column label="客户 / 通话" min-width="190">
          <template #default="{ row }">
            <div class="customer-cell"
              ><strong>{{ row.customerName }}</strong
              ><small>{{ row.callRecordId }}</small></div
            >
          </template>
        </el-table-column>
        <el-table-column label="通话时间" prop="callAt" min-width="170" />
        <el-table-column label="负责人" width="110"
          ><template #default="{ row }">{{
            row.ownerName || '当前成员'
          }}</template></el-table-column
        >
        <el-table-column label="通话结果" width="110">
          <template #default="{ row }"
            ><el-tag type="success" effect="light">{{ row.result }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="总结摘要" min-width="300">
          <template #default="{ row }"
            ><span class="summary-preview">{{ row.summary }}</span></template
          >
        </el-table-column>
        <el-table-column label="来源" width="105">
          <template #default="{ row }"
            ><el-tag :type="row.origin === 'ai' ? 'primary' : 'info'" effect="light">{{
              originLabel(row)
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="复核状态" width="110">
          <template #default="{ row }"
            ><el-tag
              :type="row.reviewStatus === 'reviewed' ? 'success' : 'warning'"
              effect="light"
              >{{ row.reviewStatus === 'reviewed' ? '已复核' : '待复核' }}</el-tag
            ></template
          >
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="165">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditor(row)">整理总结</el-button>
            <el-button v-if="row.reviewStatus === 'draft'" link type="success" @click="review(row)"
              >确认</el-button
            >
          </template>
        </el-table-column>
        <template #empty
          ><el-empty
            :description="loadError || '暂无通话总结。请从通话记录选择已完成通话后整理总结。'"
        /></template>
      </el-table>

      <footer class="table-footer">
        <span>共 {{ total }} 条记录</span>
        <el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @change="load"
        />
      </footer>
      <div class="privacy-note"
        ><Icon
          icon="ep:lock"
        />通话内容留在当前部署方；只有用户明确触发且核心服务接通后，才会按授权范围发送必要字段进行
        AI 处理。</div
      >
    </section>

    <el-dialog
      v-model="availableVisible"
      title="选择已完成通话"
      width="760px"
      class="available-calls-dialog"
    >
      <el-table v-loading="availableLoading" :data="availableCalls" row-key="callRecordId">
        <el-table-column label="客户 / 通话" min-width="190">
          <template #default="{ row }"
            ><div class="customer-cell"
              ><strong>{{ row.customerName }}</strong
              ><small>{{ row.callRecordId }}</small></div
            ></template
          >
        </el-table-column>
        <el-table-column label="通话时间" prop="callAt" min-width="170" />
        <el-table-column label="时长" width="100"
          ><template #default="{ row }">{{
            formatDuration(row.durationSeconds)
          }}</template></el-table-column
        >
        <el-table-column label="结果" prop="result" width="110" />
        <el-table-column label="操作" width="115"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="startSummary(row)"
              >整理总结</el-button
            ></template
          ></el-table-column
        >
        <template #empty><el-empty description="没有待整理的已完成通话" /></template>
      </el-table>
    </el-dialog>

    <el-drawer
      v-model="editorVisible"
      :title="`整理总结 · ${current?.customerName || ''}`"
      size="600px"
      class="summary-editor"
    >
      <template v-if="current">
        <div class="call-context">
          <div
            ><span>通话编号</span><strong>{{ current.callRecordId }}</strong></div
          >
          <div
            ><span>通话时间</span><strong>{{ current.callAt }}</strong></div
          >
          <div
            ><span>通话时长</span
            ><strong>{{ formatDuration(current.durationSeconds) }}</strong></div
          >
          <div
            ><span>通话结果</span><strong>{{ current.result }}</strong></div
          >
        </div>
        <el-alert
          title="仅显示人工维护的总结字段"
          description="此页面不会展示录音或未经授权的通话转写。AI 服务未连接，编辑内容将标记为人工整理。"
          type="info"
          :closable="false"
        />
        <el-form label-position="top" class="summary-form">
          <el-form-item label="通话摘要" required>
            <el-input
              v-model="form.summary"
              type="textarea"
              :rows="4"
              maxlength="1200"
              show-word-limit
              placeholder="记录沟通重点、客户反馈和已达成事项"
            />
          </el-form-item>
          <el-form-item label="客户需求"
            ><el-input
              v-model="form.customerNeeds"
              type="textarea"
              :rows="2"
              maxlength="600"
              show-word-limit
              placeholder="客户当前关注的问题或目标"
          /></el-form-item>
          <el-form-item label="客户异议"
            ><el-input
              v-model="form.objections"
              type="textarea"
              :rows="2"
              maxlength="600"
              show-word-limit
              placeholder="价格、时机、方案等异议；没有可留空"
          /></el-form-item>
          <el-form-item label="建议下一步"
            ><el-input
              v-model="form.nextStep"
              type="textarea"
              :rows="2"
              maxlength="600"
              show-word-limit
              placeholder="建议的下一次联系时间和待办"
          /></el-form-item>
        </el-form>
        <div class="drawer-footer">
          <el-button @click="editorVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存为待复核</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import type {
  AiCallSummaryPageParams,
  AiCallSummarySaveReq,
  AiCallSummaryVO
} from '@/api/callphone/ai-summary'
import {
  getAiCallSummaryAvailableCalls,
  getAiCallSummaryPage,
  reviewAiCallSummary,
  saveAiCallSummary
} from '@/api/callphone/ai-summary'
import {
  getPreviewAiCallSummaryAvailableCalls,
  getPreviewAiCallSummaryPage,
  reviewPreviewAiCallSummary,
  savePreviewAiCallSummary
} from '@/api/callphone/ai-summary/preview'

const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const rows = ref<AiCallSummaryVO[]>([])
const total = ref(0)
const pageNo = ref(1)
const pageSize = ref(10)
const query = ref('')
const reviewStatus = ref('')
const editorVisible = ref(false)
const availableVisible = ref(false)
const availableLoading = ref(false)
const availableCalls = ref<AiCallSummaryVO[]>([])
const current = ref<AiCallSummaryVO>()
const form = reactive({ summary: '', customerNeeds: '', objections: '', nextStep: '' })

const pendingCount = computed(() => rows.value.filter((row) => row.reviewStatus === 'draft').length)
const manualCount = computed(() => rows.value.filter((row) => row.origin === 'manual').length)
const aiCount = computed(() => rows.value.filter((row) => row.origin === 'ai').length)

async function load() {
  loading.value = true
  loadError.value = ''
  const params: AiCallSummaryPageParams = {
    pageNo: pageNo.value,
    pageSize: pageSize.value,
    query: query.value || undefined,
    reviewStatus: reviewStatus.value || undefined
  }
  try {
    const page = previewMode.value
      ? getPreviewAiCallSummaryPage(params)
      : ((await getAiCallSummaryPage(params)) as { list: AiCallSummaryVO[]; total: number })
    rows.value = page.list || []
    total.value = page.total || 0
  } catch {
    rows.value = []
    total.value = 0
    loadError.value = '通话总结读取失败，请检查服务连接与页面权限。'
  } finally {
    loading.value = false
  }
}

function search() {
  pageNo.value = 1
  void load()
}
function reset() {
  query.value = ''
  reviewStatus.value = ''
  search()
}

function openEditor(row: AiCallSummaryVO) {
  current.value = row
  form.summary = row.summary || ''
  form.customerNeeds = row.customerNeeds || ''
  form.objections = row.objections || ''
  form.nextStep = row.nextStep || ''
  editorVisible.value = true
}

async function openAvailableCalls() {
  availableVisible.value = true
  availableLoading.value = true
  try {
    availableCalls.value = previewMode.value
      ? getPreviewAiCallSummaryAvailableCalls()
      : await getAiCallSummaryAvailableCalls()
  } catch {
    availableCalls.value = []
    ElMessage.error('读取已完成通话失败，请检查服务连接与页面权限')
  } finally {
    availableLoading.value = false
  }
}

function startSummary(row: AiCallSummaryVO) {
  current.value = row
  form.summary = ''
  form.customerNeeds = ''
  form.objections = ''
  form.nextStep = ''
  availableVisible.value = false
  editorVisible.value = true
}

function originLabel(row: AiCallSummaryVO) {
  if (row.origin !== 'ai') return '人工整理'
  return previewMode.value ? 'AI 样例' : 'AI 生成'
}

async function review(row: AiCallSummaryVO) {
  try {
    const ok = previewMode.value
      ? reviewPreviewAiCallSummary(row.callRecordId, row.version)
      : await reviewAiCallSummary({ callRecordId: row.callRecordId, expectedVersion: row.version })
    if (ok !== false) {
      ElMessage.success('总结已确认')
      await load()
    }
  } catch {
    ElMessage.error('确认失败，记录可能已被其他成员更新，请刷新后重试')
  }
}

async function save() {
  if (!current.value || !form.summary.trim()) {
    ElMessage.warning('请先填写通话摘要')
    return
  }
  saving.value = true
  const data: AiCallSummarySaveReq = {
    callRecordId: current.value.callRecordId,
    summary: form.summary.trim(),
    customerNeeds: form.customerNeeds.trim(),
    objections: form.objections.trim(),
    nextStep: form.nextStep.trim(),
    expectedVersion: current.value.version || 0
  }
  try {
    const ok = previewMode.value
      ? savePreviewAiCallSummary(data, current.value)
      : await saveAiCallSummary(data)
    if (ok !== false) {
      ElMessage.success('已保存为待复核')
      editorVisible.value = false
      await load()
    }
  } catch {
    ElMessage.error('保存失败，请刷新后重试')
  } finally {
    saving.value = false
  }
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes ? `${minutes} 分 ${remainder} 秒` : `${remainder} 秒`
}

onMounted(load)
</script>

<style scoped>
.summary-page {
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

.preview-banner,
.service-banner {
  margin-bottom: 14px;
}

.service-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.heading-actions {
  display: flex;
  gap: 8px;
}

.page-panel {
  padding: 22px;
  background: #fff;
  border: 1px solid #e5e9f0;
  border-radius: 10px;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
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

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary-metrics article {
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e8ecf3;
  border-radius: 8px;
}

.summary-metrics span,
.summary-metrics small {
  display: block;
  font-size: 12px;
  color: #8490a1;
}

.summary-metrics strong {
  display: block;
  margin: 6px 0 2px;
  font-size: 22px;
  color: #253149;
}

.summary-metrics strong.pending {
  color: #c27a12;
}

.filter-row {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.query-input {
  width: 280px;
}

.customer-cell strong,
.customer-cell small {
  display: block;
}

.customer-cell small {
  margin-top: 4px;
  font-size: 11px;
  color: #929cad;
}

.summary-preview {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.55;
  color: #58657a;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.table-footer {
  display: flex;
  padding-top: 16px;
  font-size: 12px;
  color: #8490a1;
  align-items: center;
  justify-content: space-between;
}

.privacy-note {
  display: flex;
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.6;
  color: #8490a1;
  align-items: flex-start;
  gap: 7px;
}

.privacy-note :deep(svg) {
  flex: none;
  margin-top: 2px;
  color: #6b84cb;
}

.call-context {
  display: grid;
  padding: 14px;
  margin-bottom: 18px;
  background: #f8f9fc;
  border: 1px solid #e7ebf2;
  border-radius: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.call-context span,
.call-context strong {
  display: block;
}

.call-context span {
  font-size: 11px;
  color: #8490a1;
}

.call-context strong {
  margin-top: 5px;
  font-size: 13px;
  font-weight: 500;
  color: #344158;
}

.summary-form {
  margin-top: 18px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}

:global(html.light) .summary-editor {
  --el-drawer-bg-color: #fff;
  --el-drawer-text-color: #303133;

  color-scheme: light;
}

:global(html.light) .summary-editor .el-drawer__header {
  color: #303133;
}

:global(html.light) .summary-editor .el-input__wrapper,
:global(html.light) .summary-editor .el-textarea__inner {
  background: #fff;
}

:global(html.light) .available-calls-dialog {
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;

  color: #303133;
  background: #fff;
  color-scheme: light;
}

@media (width <= 900px) {
  .summary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (width <= 680px) {
  .summary-page {
    padding: 10px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .page-heading,
  .service-copy {
    align-items: flex-start;
    flex-direction: column;
  }

  .heading-actions {
    flex-wrap: wrap;
  }

  .filter-row {
    flex-wrap: wrap;
  }

  .query-input {
    width: 100%;
  }

  .summary-metrics {
    gap: 8px;
  }

  .table-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
}
</style>
