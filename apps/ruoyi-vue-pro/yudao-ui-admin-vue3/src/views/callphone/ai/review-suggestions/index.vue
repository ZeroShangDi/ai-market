<template>
  <main class="review-page">
    <section class="page-head">
      <div>
        <div class="breadcrumb">Call Phone <span>/</span> AI 助手</div>
        <h1>人工复核建议</h1>
        <p>复核 AI 生成的客户建议，检查原始依据和风险后再决定是否通过。</p>
      </div>
      <div class="head-actions">
        <el-button v-if="previewMode" plain @click="restoreDemo">恢复演示样例</el-button>
        <el-tag type="info" effect="plain">{{ previewMode ? '本地预览' : '客户侧数据' }}</el-tag>
      </div>
    </section>

    <el-alert class="privacy-note" type="info" :closable="false" show-icon>
      <template #title
        >建议和依据保存在当前部署的数据平面。高风险建议必须经过人工复核；复核结果不会自动联系客户或改变客户资料。</template
      >
    </el-alert>

    <section class="metric-grid">
      <button
        v-for="card in cards"
        :key="card.key"
        class="metric-card"
        :class="{ active: card.active }"
        @click="selectCard(card.key)"
      >
        <span>{{ card.label }}</span
        ><strong>{{ card.value }}</strong
        ><small>{{ card.hint }}</small>
      </button>
    </section>

    <el-card class="list-card" shadow="never">
      <div class="toolbar">
        <el-input
          v-model="filters.query"
          clearable
          class="search-input"
          placeholder="搜索通话编号"
          @keyup.enter="search"
        >
          <template #prefix><Icon icon="ep:search" /></template>
        </el-input>
        <el-select
          v-model="filters.status"
          clearable
          placeholder="全部复核状态"
          class="filter-select"
        >
          <el-option label="待复核" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已修改" value="edited" />
          <el-option label="已拒绝" value="rejected" />
          <el-option label="已处理" value="reviewed" />
        </el-select>
        <el-select
          v-model="filters.riskLevel"
          clearable
          placeholder="全部风险等级"
          class="filter-select"
        >
          <el-option label="高风险" value="high" />
          <el-option label="中风险" value="medium" />
          <el-option label="低风险" value="low" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="page.list"
        row-key="id"
        class="review-table"
        empty-text="暂无符合条件的复核建议"
      >
        <el-table-column label="客户 / 通话" min-width="125">
          <template #default="{ row }"
            ><strong>{{ row.customerName }}</strong
            ><small class="sub-line">{{ row.callRecordId }}</small></template
          >
        </el-table-column>
        <el-table-column prop="id" label="建议编号" width="105" />
        <el-table-column label="建议内容" min-width="220" show-overflow-tooltip>
          <template #default="{ row }"
            ><span class="suggestion-cell">{{ row.suggestion }}</span></template
          >
        </el-table-column>
        <el-table-column label="风险" width="90">
          <template #default="{ row }"
            ><el-tag :type="riskType(row.riskLevel)" effect="light">{{
              riskLabel(row.riskLevel)
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }"
            ><el-tag :type="statusType(row.status)" effect="light">{{
              statusLabel(row.status)
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column prop="createdAt" label="生成时间" width="150">
          <template #default="{ row }">{{ formatLocalDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }"
            ><el-button link type="primary" @click="openDetail(row.id)">{{
              row.status === 'pending' ? '开始复核' : '复核记录'
            }}</el-button></template
          >
        </el-table-column>
      </el-table>

      <div class="pagination-row">
        <span>共 {{ page.total }} 条建议</span>
        <el-pagination
          v-model:current-page="filters.pageNo"
          v-model:page-size="filters.pageSize"
          :total="page.total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @change="loadPage"
        />
      </div>
    </el-card>

    <el-drawer
      v-model="detailVisible"
      class="review-drawer"
      title="建议复核"
      size="580px"
      destroy-on-close
    >
      <template v-if="detail">
        <div class="detail-meta">
          <div
            ><span>建议编号</span><strong>{{ detail.id }}</strong></div
          >
          <div
            ><span>来源通话</span
            ><strong>{{ detail.customerName }} · {{ detail.callRecordId }}</strong></div
          >
          <div
            ><span>模型运行编号</span><strong>{{ detail.sourceRunId }}</strong></div
          >
          <div
            ><span>风险等级</span
            ><el-tag :type="riskType(detail.riskLevel)" effect="light">{{
              riskLabel(detail.riskLevel)
            }}</el-tag></div
          >
          <div
            ><span>当前状态</span
            ><el-tag :type="statusType(detail.status)" effect="light">{{
              statusLabel(detail.status)
            }}</el-tag></div
          >
        </div>
        <section class="detail-section">
          <div class="section-title">建议内容</div>
          <div class="content-box">{{ detail.suggestion }}</div>
        </section>
        <section class="detail-section">
          <div class="section-title">原始依据</div>
          <div class="evidence-box"
            ><Icon icon="ep:chat-line-round" /><p>{{ detail.evidence }}</p></div
          >
          <small class="muted">依据仅显示当前用户有权查看的通话总结摘录。</small>
        </section>
        <section v-if="detail.status !== 'pending'" class="detail-section review-result">
          <div class="section-title">复核结果</div>
          <div class="result-line"
            ><span>复核人</span>{{ detail.reviewerName || '—' }} <span>时间</span
            >{{ formatLocalDateTime(detail.reviewedAt) }}</div
          >
          <div class="result-reason">{{ detail.reviewReason || '未填写复核说明' }}</div>
        </section>
        <div v-if="detail.status === 'pending'" class="drawer-actions">
          <el-button type="danger" plain @click="openReview('rejected')">拒绝建议</el-button>
          <el-button @click="openReview('edited')">修改后通过</el-button>
          <el-button type="primary" @click="openReview('approved')">通过建议</el-button>
        </div>
      </template>
    </el-drawer>

    <el-dialog
      v-model="reviewVisible"
      :title="reviewTitle"
      width="560px"
      class="review-dialog"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item v-if="form.decision === 'edited'" label="调整后的建议内容" prop="suggestion">
          <el-input
            v-model="form.suggestion"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
            placeholder="请写明调整后的建议"
          />
        </el-form-item>
        <el-form-item :label="form.decision === 'rejected' ? '拒绝原因' : '复核说明'" prop="reason">
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            :placeholder="
              form.decision === 'rejected' ? '说明该建议不适用的原因' : '记录判断依据，便于后续追溯'
            "
          />
        </el-form-item>
        <el-alert
          v-if="detail?.riskLevel === 'high' && form.decision === 'approved'"
          type="warning"
          :closable="false"
          title="高风险建议将写入复核审计记录，请确认依据充分。"
        />
      </el-form>
      <template #footer
        ><el-button @click="reviewVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="submitReview">{{
          form.decision === 'rejected' ? '确认拒绝' : '保存复核结果'
        }}</el-button></template
      >
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
import * as ReviewApi from '@/api/callphone/ai-review-suggestion'
import * as ReviewPreview from '@/api/callphone/ai-review-suggestion/preview'
import type {
  AiReviewSuggestionVO,
  ReviewRisk,
  ReviewStatus
} from '@/api/callphone/ai-review-suggestion'

const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
const loading = ref(false)
const saving = ref(false)
const detailVisible = ref(false)
const reviewVisible = ref(false)
const detail = ref<AiReviewSuggestionVO>()
const formRef = ref<FormInstance>()
const filters = reactive<{
  pageNo: number
  pageSize: number
  status: ReviewStatus | 'reviewed' | ''
  riskLevel: ReviewRisk | ''
  query: string
}>({ pageNo: 1, pageSize: 10, status: '', riskLevel: '', query: '' })
const page = reactive<{
  list: AiReviewSuggestionVO[]
  total: number
  pendingCount: number
  highRiskPendingCount: number
  reviewedCount: number
}>({ list: [], total: 0, pendingCount: 0, highRiskPendingCount: 0, reviewedCount: 0 })
const form = reactive<{
  decision: 'approved' | 'edited' | 'rejected'
  suggestion: string
  reason: string
}>({ decision: 'approved', suggestion: '', reason: '' })
const rules: FormRules = {
  suggestion: [
    { required: true, whitespace: true, message: '请填写修改后的建议', trigger: 'blur' },
    { min: 5, message: '建议内容至少 5 个字', trigger: 'blur' }
  ],
  reason: [
    { required: true, whitespace: true, message: '请填写复核说明', trigger: 'blur' },
    { min: 4, message: '复核说明至少 4 个字', trigger: 'blur' }
  ]
}
const cards = computed(() => [
  {
    key: 'pending' as const,
    active: filters.status === 'pending' && !filters.riskLevel,
    label: '待复核',
    value: page.pendingCount,
    hint: '需要人工判断'
  },
  {
    key: 'high' as const,
    active: filters.status === 'pending' && filters.riskLevel === 'high',
    label: '高风险待复核',
    value: page.highRiskPendingCount,
    hint: '优先检查依据与影响'
  },
  {
    key: 'reviewed' as const,
    active: filters.status === 'reviewed',
    label: '已处理',
    value: page.reviewedCount,
    hint: '包含通过、修改和拒绝'
  }
])
const reviewTitle = computed(() =>
  form.decision === 'rejected'
    ? '拒绝这条建议'
    : form.decision === 'edited'
      ? '修改并通过建议'
      : '通过这条建议'
)

function riskLabel(risk: ReviewRisk) {
  return { high: '高风险', medium: '中风险', low: '低风险' }[risk]
}
function riskType(risk: ReviewRisk) {
  return { high: 'danger', medium: 'warning', low: 'success' }[risk] as
    | 'danger'
    | 'warning'
    | 'success'
}
function statusLabel(status: ReviewStatus) {
  return { pending: '待复核', approved: '已通过', edited: '已修改', rejected: '已拒绝' }[status]
}
function statusType(status: ReviewStatus) {
  return { pending: 'warning', approved: 'success', edited: 'primary', rejected: 'danger' }[
    status
  ] as 'warning' | 'success' | 'primary' | 'danger'
}
function formatLocalDateTime(value?: string) {
  return value
    ? parseCallPhoneDateTime(value).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    : '—'
}

async function loadPage() {
  loading.value = true
  try {
    const result = previewMode.value
      ? ReviewPreview.getPreviewReviewSuggestionPage(filters)
      : await ReviewApi.getReviewSuggestionPage(filters)
    Object.assign(page, result)
  } catch (error: any) {
    ElMessage.error(error?.message || '加载复核建议失败')
  } finally {
    loading.value = false
  }
}
function search() {
  filters.pageNo = 1
  void loadPage()
}
function reset() {
  filters.query = ''
  filters.status = ''
  filters.riskLevel = ''
  search()
}
async function restoreDemo() {
  try {
    await ElMessageBox.confirm(
      '恢复后，本页面当前浏览器中的复核记录会重置为初始演示样例。',
      '恢复演示样例',
      {
        confirmButtonText: '恢复样例',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    ReviewPreview.resetPreviewReviewSuggestions()
    filters.status = ''
    filters.riskLevel = ''
    filters.query = ''
    filters.pageNo = 1
    detailVisible.value = false
    reviewVisible.value = false
    await loadPage()
    ElMessage.success('演示样例已恢复')
  } catch (error: any) {
    if (error?.message && error.message !== 'cancel') ElMessage.error(error.message)
  }
}
function selectCard(card: 'pending' | 'high' | 'reviewed') {
  if (card === 'high') {
    const active = filters.status === 'pending' && filters.riskLevel === 'high'
    filters.status = active ? '' : 'pending'
    filters.riskLevel = active ? '' : 'high'
  } else {
    const status = card
    filters.status = filters.status === status ? '' : status
    filters.riskLevel = ''
  }
  search()
}
async function openDetail(id: string) {
  try {
    detail.value = previewMode.value
      ? ReviewPreview.getPreviewReviewSuggestion(id)
      : await ReviewApi.getReviewSuggestion(id)
    detailVisible.value = true
  } catch (error: any) {
    ElMessage.error(error?.message || '读取复核详情失败')
  }
}
function openReview(decision: 'approved' | 'edited' | 'rejected') {
  if (!detail.value || detail.value.status !== 'pending') return
  form.decision = decision
  form.suggestion = detail.value.suggestion
  form.reason = ''
  reviewVisible.value = true
}
async function submitReview() {
  if (!detail.value) return
  try {
    await formRef.value?.validate()
    saving.value = true
    const payload = { id: detail.value.id, expectedVersion: detail.value.version, ...form }
    if (previewMode.value) ReviewPreview.reviewPreviewSuggestion(payload)
    else await ReviewApi.reviewSuggestion(payload)
    ElMessage.success(form.decision === 'rejected' ? '建议已拒绝并记录原因' : '复核结果已保存')
    reviewVisible.value = false
    await loadPage()
    await openDetail(detail.value.id)
  } catch (error: any) {
    if (error?.message) ElMessage.error(error.message)
  } finally {
    saving.value = false
  }
}
onMounted(loadPage)
</script>

<style scoped>
.review-page {
  min-height: 100%;
  padding: 26px 30px 32px;
  color: #303b4c;
  background: #f4f7fb;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

.breadcrumb {
  margin-bottom: 8px;
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

.page-head p {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7d8999;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.privacy-note {
  margin-bottom: 16px;
  background: #f7fbff;
  border: 1px solid #dce8f6;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.metric-card {
  display: flex;
  min-height: 112px;
  padding: 16px 18px;
  color: #687587;
  text-align: left;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 9px;
  transition:
    border-color 0.16s,
    box-shadow 0.16s;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.metric-card:hover,
.metric-card.active {
  border-color: #91baff;
  box-shadow: 0 3px 12px #4778c20d;
}

.metric-card strong {
  font-size: 26px;
  line-height: 1;
  color: #243247;
}

.metric-card small {
  font-size: 12px;
  color: #9aa4b1;
}

.list-card {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 9px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.search-input {
  width: 290px;
}

.filter-select {
  width: 155px;
}

.review-table {
  width: 100%;
}

.sub-line {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: #96a1af;
}

.suggestion-cell {
  display: -webkit-box;
  overflow: hidden;
  line-height: 20px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.pagination-row {
  display: flex;
  margin-top: 18px;
  font-size: 12px;
  color: #8994a3;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px 16px;
  padding: 2px 0 22px;
  border-bottom: 1px solid #edf0f4;
}

.detail-meta > div {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.detail-meta span,
.muted {
  font-size: 12px;
  color: #96a0ae;
}

.detail-meta strong {
  font-size: 13px;
  font-weight: 550;
  color: #344155;
}

.detail-section {
  margin-top: 22px;
}

.section-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 650;
  color: #39465a;
}

.content-box {
  padding: 14px 15px;
  font-size: 14px;
  line-height: 1.8;
  color: #405066;
  background: #f8fafc;
  border: 1px solid #e7edf5;
  border-radius: 7px;
}

.evidence-box {
  display: flex;
  padding: 14px 15px;
  color: #53647c;
  background: #f5f9ff;
  border-left: 3px solid #92b7f0;
  border-radius: 0 7px 7px 0;
  gap: 10px;
}

.evidence-box .el-icon {
  margin-top: 2px;
  color: #6c95d0;
}

.evidence-box p {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
}

.muted {
  display: block;
  margin-top: 8px;
}

.review-result {
  padding: 14px;
  background: #fafbfd;
  border: 1px solid #e7edf5;
  border-radius: 7px;
}

.result-line {
  display: flex;
  font-size: 12px;
  color: #526075;
  gap: 8px;
  align-items: center;
}

.result-line span {
  color: #97a2b0;
}

.result-line span:nth-of-type(2) {
  margin-left: 10px;
}

.result-reason {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.7;
  color: #647286;
}

.drawer-actions {
  display: flex;
  padding-top: 18px;
  margin-top: 28px;
  border-top: 1px solid #edf0f4;
  justify-content: flex-end;
  gap: 10px;
}

:global(.review-drawer.el-drawer) {
  color: #303b4c;
  background: #fff;
}

:global(.review-drawer .el-drawer__header) {
  padding: 20px 24px;
  margin-bottom: 0;
  color: #253246;
  border-bottom: 1px solid #edf0f4;
}

:global(.review-drawer .el-drawer__body) {
  padding: 22px 24px;
  background: #fff;
}

:global(.review-dialog.el-dialog) {
  background: #fff;
  border-radius: 10px;
}

:global(.review-dialog .el-dialog__header),
:global(.review-dialog .el-dialog__body),
:global(.review-dialog .el-dialog__footer) {
  background: #fff;
}

:global(.review-dialog .el-dialog__title) {
  color: #253246;
}

:global(.review-dialog .el-form-item__label) {
  color: #49566a;
}

@media (width <= 900px) {
  .review-page {
    padding: 18px;
  }

  .metric-grid {
    gap: 8px;
  }

  .toolbar {
    gap: 8px;
  }

  .search-input {
    width: min(100%, 290px);
  }

  .pagination-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
