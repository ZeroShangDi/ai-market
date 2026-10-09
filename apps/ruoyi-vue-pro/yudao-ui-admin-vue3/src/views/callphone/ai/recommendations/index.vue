<template>
  <main class="recommendation-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="建议由已复核通话总结的“下一步”提取，编辑、采纳和驳回仅保存到当前浏览器。此流程不会调用 AI 或发送消息。"
      type="info"
      :closable="false"
    />
    <el-alert
      v-else
      class="service-banner"
      title="建议需要人工确认"
      description="当前从已复核的通话总结提取下一步；核心 AI 建议服务尚未连接，不会生成虚假的 AI 结果。"
      type="info"
      :closable="false"
    />

    <section class="page-panel">
      <header class="page-heading">
        <div>
          <h1>跟进建议</h1>
          <p>把通话总结中的下一步安排整理为待办，确认后才会写入跟进事项。</p>
        </div>
        <div class="heading-actions">
          <el-button @click="load"><Icon icon="ep:refresh" />刷新</el-button>
          <el-button type="primary" @click="openSources">
            <Icon icon="ep:circle-plus" />从已复核总结提取
          </el-button>
        </div>
      </header>

      <div class="summary-cards">
        <button
          v-for="item in statusCards"
          :key="item.key || 'all'"
          type="button"
          class="summary-card"
          :class="{ active: query.status === item.key }"
          @click="selectStatus(item.key)"
        >
          <span>{{ item.label }}</span>
          <strong>{{ statusCount(item.key) }}</strong>
          <small>{{ item.hint }}</small>
        </button>
      </div>

      <div class="filters">
        <el-input
          v-model="query.query"
          class="query-input"
          clearable
          placeholder="搜索通话编号"
          @keyup.enter="search"
        >
          <template #prefix><Icon icon="ep:search" /></template>
        </el-input>
        <el-select v-model="query.status" clearable placeholder="全部状态" @change="search">
          <el-option label="待确认" value="pending" />
          <el-option label="已采纳" value="adopted" />
          <el-option label="已驳回" value="dismissed" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="客户 / 通话" min-width="170">
          <template #default="{ row }">
            <strong>{{ row.customerName }}</strong>
            <small class="sub-text">{{ row.callRecordId }}</small>
          </template>
        </el-table-column>
        <el-table-column label="建议内容" min-width="320" show-overflow-tooltip>
          <template #default="{ row }"
            ><span class="recommendation-content">{{ row.content }}</span></template
          >
        </el-table-column>
        <el-table-column label="来源" width="150">
          <template #default="{ row }">
            <el-tag effect="light" type="info">{{ originLabel(row.sourceSummaryOrigin) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="计划跟进时间" min-width="175">
          <template #default="{ row }">{{ formatTime(row.dueAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" effect="light">{{
              statusLabel(row.status)
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="210">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button link type="success" @click="openAdopt(row)">采纳</el-button>
              <el-button link type="danger" @click="openDismiss(row)">驳回</el-button>
            </template>
            <el-button
              v-else-if="row.status === 'adopted'"
              link
              type="primary"
              @click="openTask(row)"
            >
              查看跟进事项
            </el-button>
            <el-button
              v-else-if="row.status === 'dismissed'"
              link
              type="primary"
              @click="openReviewReason(row)"
            >
              查看驳回原因
            </el-button>
            <span v-else class="muted">已结束</span>
          </template>
        </el-table-column>
        <template #empty
          ><el-empty :description="loadError || '暂无建议，可从已复核的通话总结提取下一步'"
        /></template>
      </el-table>

      <footer class="table-footer">
        <span>共 {{ total }} 条建议</span>
        <el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @change="load"
        />
      </footer>
      <p class="privacy-note">
        采纳只会创建一条待办，不会改变客户阶段或自动联系客户。总结正文与建议内容保存在客户侧并加密。
      </p>
    </section>

    <el-dialog v-model="sourceVisible" title="选择已复核通话总结" width="760px" destroy-on-close>
      <p class="dialog-intro">只会提取总结中已填写的“建议下一步”，原总结保持不变。</p>
      <el-table v-loading="sourceLoading" :data="sources" row-key="callRecordId">
        <el-table-column label="客户 / 通话" min-width="155">
          <template #default="{ row }"
            ><strong>{{ row.customerName }}</strong
            ><small class="sub-text">{{ row.callRecordId }}</small></template
          >
        </el-table-column>
        <el-table-column label="通话时间" prop="callAt" min-width="165" />
        <el-table-column label="总结下一步" prop="nextStep" min-width="265" show-overflow-tooltip />
        <el-table-column label="操作" width="105" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              :loading="preparingId === row.callRecordId"
              @click="prepare(row)"
            >
              加入待确认
            </el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="没有可提取的已复核总结" /></template>
      </el-table>
      <template #footer><el-button @click="sourceVisible = false">关闭</el-button></template>
    </el-dialog>

    <el-drawer
      v-model="editVisible"
      title="编辑跟进建议"
      size="520px"
      class="recommendation-drawer"
    >
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-position="top">
        <el-form-item label="关联客户 / 通话">
          <el-input
            :model-value="
              editTarget ? `${editTarget.customerName} · ${editTarget.callRecordId}` : ''
            "
            disabled
          />
        </el-form-item>
        <el-form-item label="建议下一步" prop="content">
          <el-input
            v-model="editForm.content"
            type="textarea"
            :rows="6"
            maxlength="1200"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="计划跟进时间" prop="dueAt">
          <el-date-picker
            v-model="editForm.dueAt"
            class="full-width"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="选择提醒时间"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="drawer-footer"
          ><el-button @click="editVisible = false">取消</el-button
          ><el-button type="primary" :loading="saving" @click="saveEdit">保存建议</el-button></div
        >
      </template>
    </el-drawer>

    <el-dialog v-model="adoptVisible" title="采纳并创建跟进事项" width="540px" destroy-on-close>
      <el-form ref="adoptFormRef" :model="adoptForm" :rules="adoptRules" label-position="top">
        <el-form-item label="关联客户">
          <el-input :model-value="adoptTarget?.customerName || ''" disabled />
        </el-form-item>
        <el-form-item label="跟进事项标题" prop="title">
          <el-input v-model="adoptForm.title" maxlength="120" placeholder="概括需要执行的动作" />
        </el-form-item>
        <el-form-item label="截止时间" prop="dueAt">
          <el-date-picker
            v-model="adoptForm.dueAt"
            class="full-width"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="选择提醒时间"
          />
        </el-form-item>
        <div class="adopt-preview"
          ><span>待办内容</span><p>{{ adoptTarget?.content }}</p></div
        >
        <el-alert
          title="确认后只创建待办，不会自动发送消息或拨打电话。"
          type="info"
          :closable="false"
        />
      </el-form>
      <template #footer>
        <el-button @click="adoptVisible = false">取消</el-button
        ><el-button type="success" :loading="saving" @click="adopt">确认采纳</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dismissVisible" title="驳回跟进建议" width="480px" destroy-on-close>
      <el-form ref="dismissFormRef" :model="dismissForm" :rules="dismissRules" label-position="top">
        <el-form-item label="驳回原因" prop="reason">
          <el-input
            v-model="dismissForm.reason"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="记录原因，帮助后续改进建议质量"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dismissVisible = false">取消</el-button
        ><el-button type="danger" :loading="saving" @click="dismiss">确认驳回</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="reasonVisible" title="驳回记录" width="480px">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="关联通话">{{
          reasonTarget?.callRecordId
        }}</el-descriptions-item>
        <el-descriptions-item label="驳回原因">{{
          reasonTarget?.reviewReason || '未记录原因'
        }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <el-drawer
      v-model="taskVisible"
      title="已创建的跟进事项"
      size="460px"
      class="recommendation-drawer"
    >
      <el-result icon="success" title="建议已采纳" sub-title="跟进事项已加入客户待办列表。">
        <template #extra
          ><el-descriptions v-if="taskTarget" :column="1" border
            ><el-descriptions-item label="客户">{{ taskTarget.customerName }}</el-descriptions-item
            ><el-descriptions-item label="通话编号">{{
              taskTarget.callRecordId
            }}</el-descriptions-item
            ><el-descriptions-item label="跟进事项 ID">{{
              taskTarget.followUpTaskId
            }}</el-descriptions-item
            ><el-descriptions-item label="计划时间">{{
              formatTime(taskTarget.dueAt)
            }}</el-descriptions-item></el-descriptions
          ></template
        >
      </el-result>
    </el-drawer>
  </main>
</template>

<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import * as RecommendationApi from '@/api/callphone/ai-recommendation'
import * as RecommendationPreview from '@/api/callphone/ai-recommendation/preview'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'

defineOptions({ name: 'CallPhoneAiFollowUpSuggestions' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false)
const sourceLoading = ref(false)
const saving = ref(false)
const loadError = ref('')
const rows = ref<RecommendationApi.FollowUpRecommendationVO[]>([])
const sources = ref<RecommendationApi.RecommendationSourceVO[]>([])
const total = ref(0)
const counts = reactive({ pending: 0, adopted: 0, dismissed: 0 })
const query = reactive({
  pageNo: 1,
  pageSize: 10,
  query: '',
  status: '' as RecommendationApi.RecommendationStatus | ''
})
const statusCards = [
  { key: '' as const, label: '全部建议', hint: '当前筛选结果' },
  { key: 'pending' as const, label: '待确认', hint: '需人工编辑或处置' },
  { key: 'adopted' as const, label: '已采纳', hint: '已创建跟进待办' },
  { key: 'dismissed' as const, label: '已驳回', hint: '保留审核结果' }
]
const sourceVisible = ref(false)
const editVisible = ref(false)
const adoptVisible = ref(false)
const dismissVisible = ref(false)
const taskVisible = ref(false)
const reasonVisible = ref(false)
const preparingId = ref('')
const editFormRef = ref<FormInstance>()
const adoptFormRef = ref<FormInstance>()
const dismissFormRef = ref<FormInstance>()
const editTarget = ref<RecommendationApi.FollowUpRecommendationVO>()
const adoptTarget = ref<RecommendationApi.FollowUpRecommendationVO>()
const taskTarget = ref<RecommendationApi.FollowUpRecommendationVO>()
const reasonTarget = ref<RecommendationApi.FollowUpRecommendationVO>()
const editForm = reactive({ content: '', dueAt: '' })
const adoptForm = reactive({ title: '', dueAt: '' })
const dismissForm = reactive({ reason: '' })
const editRules: FormRules = {
  content: [{ required: true, whitespace: true, message: '请填写跟进建议', trigger: 'blur' }],
  dueAt: [{ required: true, message: '请选择计划跟进时间', trigger: 'change' }]
}
const adoptRules: FormRules = {
  title: [{ required: true, whitespace: true, message: '请填写跟进事项标题', trigger: 'blur' }],
  dueAt: [{ required: true, message: '请选择截止时间', trigger: 'change' }]
}
const dismissRules: FormRules = {
  reason: [{ required: true, whitespace: true, message: '请填写驳回原因', trigger: 'blur' }]
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = previewMode
      ? RecommendationPreview.getPreviewRecommendationPage(query)
      : await RecommendationApi.getRecommendationPage(query)
    rows.value = result.list || []
    total.value = result.total || 0
    counts.pending = result.pendingCount || 0
    counts.adopted = result.adoptedCount || 0
    counts.dismissed = result.dismissedCount || 0
  } catch (error: any) {
    rows.value = []
    total.value = 0
    counts.pending = 0
    counts.adopted = 0
    counts.dismissed = 0
    loadError.value = error?.message || '跟进建议加载失败'
  } finally {
    loading.value = false
  }
}

async function openSources() {
  sourceVisible.value = true
  sourceLoading.value = true
  try {
    sources.value = previewMode
      ? RecommendationPreview.getPreviewRecommendationSources()
      : await RecommendationApi.getRecommendationSources()
  } catch (error: any) {
    sources.value = []
    ElMessage.error(error?.message || '读取已复核通话总结失败')
  } finally {
    sourceLoading.value = false
  }
}

async function prepare(source: RecommendationApi.RecommendationSourceVO) {
  preparingId.value = source.callRecordId
  try {
    if (previewMode) RecommendationPreview.preparePreviewRecommendation(source.callRecordId)
    else await RecommendationApi.prepareRecommendation(source.callRecordId)
    ElMessage.success('已加入待确认建议')
    sourceVisible.value = false
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '添加建议失败')
  } finally {
    preparingId.value = ''
  }
}

function openEdit(row: RecommendationApi.FollowUpRecommendationVO) {
  editTarget.value = row
  editForm.content = row.content
  editForm.dueAt = toDatePicker(row.dueAt)
  editVisible.value = true
}

async function saveEdit() {
  await editFormRef.value?.validate()
  if (!editTarget.value) return
  saving.value = true
  try {
    const data = { id: editTarget.value.id, expectedVersion: editTarget.value.version, ...editForm }
    if (previewMode) RecommendationPreview.updatePreviewRecommendation(data)
    else await RecommendationApi.updateRecommendation(data)
    ElMessage.success('建议已更新')
    editVisible.value = false
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存建议失败')
  } finally {
    saving.value = false
  }
}

function openAdopt(row: RecommendationApi.FollowUpRecommendationVO) {
  adoptTarget.value = row
  adoptForm.title = row.content.trim().slice(0, 80)
  adoptForm.dueAt = toDatePicker(row.dueAt)
  adoptVisible.value = true
}

async function adopt() {
  await adoptFormRef.value?.validate()
  if (!adoptTarget.value) return
  saving.value = true
  try {
    const data = {
      id: adoptTarget.value.id,
      expectedVersion: adoptTarget.value.version,
      ...adoptForm
    }
    const taskId = previewMode
      ? RecommendationPreview.adoptPreviewRecommendation(data)
      : await RecommendationApi.adoptRecommendation(data)
    ElMessage.success('已采纳并创建跟进事项')
    adoptVisible.value = false
    await load()
    taskTarget.value = {
      ...adoptTarget.value,
      status: 'adopted',
      dueAt: adoptForm.dueAt,
      followUpTaskId: taskId
    }
    taskVisible.value = true
  } catch (error: any) {
    ElMessage.error(error?.message || '采纳建议失败')
  } finally {
    saving.value = false
  }
}

function openDismiss(row: RecommendationApi.FollowUpRecommendationVO) {
  adoptTarget.value = row
  dismissForm.reason = ''
  dismissVisible.value = true
}

async function dismiss() {
  await dismissFormRef.value?.validate()
  if (!adoptTarget.value) return
  saving.value = true
  try {
    const data = {
      id: adoptTarget.value.id,
      expectedVersion: adoptTarget.value.version,
      reason: dismissForm.reason
    }
    if (previewMode) RecommendationPreview.dismissPreviewRecommendation(data)
    else await RecommendationApi.dismissRecommendation(data)
    ElMessage.success('建议已驳回并记录原因')
    dismissVisible.value = false
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '驳回建议失败')
  } finally {
    saving.value = false
  }
}

function openTask(row: RecommendationApi.FollowUpRecommendationVO) {
  taskTarget.value = row
  taskVisible.value = true
}

function openReviewReason(row: RecommendationApi.FollowUpRecommendationVO) {
  reasonTarget.value = row
  reasonVisible.value = true
}

function search() {
  query.pageNo = 1
  void load()
}

function reset() {
  query.pageNo = 1
  query.query = ''
  query.status = ''
  void load()
}

function selectStatus(status: (typeof statusCards)[number]['key']) {
  query.pageNo = 1
  query.status = status
  void load()
}

function statusCount(status: (typeof statusCards)[number]['key']) {
  return status ? counts[status] : total.value
}

function statusLabel(status: RecommendationApi.RecommendationStatus) {
  return { pending: '待确认', adopted: '已采纳', dismissed: '已驳回' }[status]
}

function statusType(
  status: RecommendationApi.RecommendationStatus
): 'warning' | 'success' | 'info' {
  return status === 'pending' ? 'warning' : status === 'adopted' ? 'success' : 'info'
}

function originLabel(origin: 'manual' | 'ai') {
  return origin === 'ai' ? '已复核 AI 总结' : '已复核人工总结'
}

function formatTime(value?: string) {
  if (!value) return '—'
  return parseCallPhoneDateTime(value).toLocaleString('zh-CN', {
    hour12: false
  })
}

function toDatePicker(value: string) {
  return (
    value
      ?.replace(/\.\d{3}Z$/, '')
      .replace(/Z$/, '')
      .replace(' ', 'T') || ''
  )
}

onMounted(() => void load())
</script>

<style scoped>
.recommendation-page {
  padding: 20px;
  color: var(--el-text-color-primary);
}

.preview-banner,
.service-banner {
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: var(--el-text-color-primary);
}

.page-heading p,
.privacy-note,
.dialog-intro {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.page-heading p {
  margin: 7px 0 0;
}

.heading-actions {
  display: flex;
  gap: 10px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.summary-card {
  padding: 14px 16px;
  color: var(--el-text-color-secondary);
  text-align: left;
  cursor: pointer;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
}

.summary-card.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

.summary-card strong {
  display: block;
  margin: 6px 0 3px;
  font-size: 22px;
  color: var(--el-text-color-primary);
}

.summary-card small,
.sub-text {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.query-input {
  width: 280px;
}

.recommendation-content {
  line-height: 1.6;
  color: var(--el-text-color-primary);
}

.muted {
  color: var(--el-text-color-secondary);
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  color: var(--el-text-color-secondary);
}

.privacy-note {
  margin: 18px 0 0;
}

.dialog-intro {
  margin: 0 0 14px;
}

.full-width {
  width: 100%;
}

.adopt-preview {
  padding: 12px 14px;
  margin-bottom: 16px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
}

.adopt-preview span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.adopt-preview p {
  margin: 6px 0 0;
  line-height: 1.6;
  color: var(--el-text-color-primary);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

:global(.recommendation-drawer.el-drawer) {
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
}

:global(.recommendation-drawer .el-drawer__header) {
  color: var(--el-text-color-primary);
}

@media (width <= 900px) {
  .summary-cards {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }

  .page-heading {
    flex-direction: column;
  }
}

@media (width <= 640px) {
  .recommendation-page {
    padding: 10px;
  }

  .page-panel {
    padding: 14px;
  }

  .filters {
    flex-wrap: wrap;
  }

  .query-input {
    width: 100%;
  }

  .heading-actions {
    width: 100%;
  }
}
</style>
