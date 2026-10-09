<template>
  <main class="review-page">
    <header class="page-heading">
      <div>
        <div class="breadcrumb">Call Phone <span>/</span> 客户</div>
        <h1>服务质检</h1>
        <p>抽查已结束通话的服务流程记录，保存评分和改进意见。</p>
      </div>
      <el-button type="primary" :loading="loading" @click="loadAll"
        ><Icon icon="ep:refresh" />刷新队列</el-button
      >
    </header>

    <el-alert class="scope-note" type="info" :closable="false" show-icon>
      <template #title
        ><span v-if="previewMode"
          >预览数据不是真实客户或通话记录，也不包含真实录音；正式环境仅能按授权播放本地加密录音。</span
        ><span v-else
          >仅查看本人已结束通话；对有录音的通话，可在授权后直接播放客户部署本地的加密录音。</span
        ></template
      >
    </el-alert>

    <section class="metric-grid">
      <article class="metric-card"
        ><span>待抽检</span><strong>{{ available.length }}</strong
        ><small>已结束且尚未质检</small></article
      >
      <article class="metric-card"
        ><span>已通过</span><strong>{{ page.passCount }}</strong
        ><small>通过质检的通话</small></article
      >
      <article class="metric-card"
        ><span>需改进</span><strong>{{ page.improveCount }}</strong
        ><small>待负责人跟进</small></article
      >
      <article class="metric-card"
        ><span>平均得分</span><strong>{{ page.averageScore }}<small> 分</small></strong
        ><small>已完成的质检记录</small></article
      >
    </section>

    <el-card class="queue-card" shadow="never">
      <div class="section-heading"
        ><div><h2>待抽检通话</h2><p>仅显示当前负责人的已结束通话</p></div
        ><el-tag type="info" effect="light">{{ available.length }} 条</el-tag></div
      >
      <el-table
        :data="available"
        v-loading="loading"
        row-key="callRecordId"
        empty-text="当前没有待抽检通话"
      >
        <el-table-column prop="callRecordId" label="通话编号" width="135" />
        <el-table-column label="客户" min-width="145"
          ><template #default="{ row }"
            ><strong>{{ row.customerName }}</strong
            ><small class="sub-line">{{ row.phoneDisplay }}</small></template
          ></el-table-column
        >
        <el-table-column label="通话时间" width="175"
          ><template #default="{ row }">{{ formatDate(row.callAt) }}</template></el-table-column
        >
        <el-table-column label="时长" width="100"
          ><template #default="{ row }">{{
            duration(row.durationSeconds)
          }}</template></el-table-column
        >
        <el-table-column label="通话结果" width="120"
          ><template #default="{ row }"
            ><el-tag type="success" effect="light">{{ row.result }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="录音" width="120"
          ><template #default="{ row }"
            ><el-tag :type="recordingTagType(row.recordingState)" effect="plain">{{
              recordingLabel(row.recordingState)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="操作" width="115" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="startReview(row)">开始质检</el-button></template
          ></el-table-column
        >
      </el-table>
      <div class="queue-footnote"
        ><Icon icon="ep:lock" /> 页面仅读取本人通话数据；质检说明按密文保存。</div
      >
    </el-card>

    <el-card class="history-card" shadow="never">
      <div class="history-toolbar"
        ><div class="section-heading"
          ><div><h2>质检记录</h2><p>复核结果和改进建议</p></div></div
        >
        <el-select
          v-model="reviewStatus"
          clearable
          placeholder="全部质检结果"
          class="status-select"
          @change="loadHistory"
          ><el-option label="已通过" value="pass" /><el-option
            label="需改进"
            value="needs_improvement"
        /></el-select>
      </div>
      <el-table :data="page.list" v-loading="historyLoading" row-key="id" empty-text="暂无质检记录">
        <el-table-column prop="callRecordId" label="通话编号" width="135" />
        <el-table-column label="客户" min-width="145"
          ><template #default="{ row }"
            ><strong>{{ row.customerName }}</strong
            ><small class="sub-line">{{ row.phoneDisplay }}</small></template
          ></el-table-column
        >
        <el-table-column label="评分" width="110"
          ><template #default="{ row }"
            ><strong class="score" :class="row.score < 80 ? 'score-low' : ''">{{
              row.score
            }}</strong
            ><span class="score-suffix">/100</span></template
          ></el-table-column
        >
        <el-table-column label="质检结果" width="125"
          ><template #default="{ row }"
            ><el-tag :type="row.reviewStatus === 'pass' ? 'success' : 'warning'" effect="light">{{
              row.reviewStatus === 'pass' ? '已通过' : '需改进'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column prop="reviewerName" label="质检人" width="120" />
        <el-table-column label="质检时间" width="175"
          ><template #default="{ row }">{{ formatDate(row.reviewedAt) }}</template></el-table-column
        >
        <el-table-column label="操作" width="100" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="viewReview(row)">查看记录</el-button></template
          ></el-table-column
        >
      </el-table>
      <div class="pagination-row"
        ><span>共 {{ page.total }} 条记录</span
        ><el-pagination
          v-model:current-page="pagination.pageNo"
          v-model:page-size="pagination.pageSize"
          :total="page.total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @change="loadHistory"
      /></div>
    </el-card>

    <el-drawer
      v-model="drawerVisible"
      class="service-review-drawer"
      :title="readOnly ? '质检记录' : '通话服务质检'"
      size="620px"
      destroy-on-close
    >
      <template v-if="selected">
        <section class="call-summary"
          ><div
            ><span>客户</span><strong>{{ selected.customerName }}</strong
            ><small>{{ selected.phoneDisplay }}</small></div
          ><div
            ><span>通话时间</span><strong>{{ formatDate(selected.callAt) }}</strong
            ><small>{{ duration(selected.durationSeconds) }} · {{ selected.result }}</small></div
          ><div
            ><span>通话编号</span><strong>{{ selected.callRecordId }}</strong></div
          ></section
        >
        <section v-if="selected.recordingState === 'ready'" class="recording-player">
          <div class="recording-player-heading">
            <div
              ><strong>本地通话录音</strong><small>文件在当前 Call Phone 部署中加密保存</small></div
            >
            <el-button
              v-if="canPlayRecording"
              type="primary"
              plain
              :loading="recordingLoading"
              @click="loadRecording"
              >{{ recordingUrl ? '重新加载' : '播放录音' }}</el-button
            >
            <el-tag v-else type="info" effect="plain">无播放权限</el-tag>
          </div>
          <audio v-if="recordingUrl" :src="recordingUrl" controls preload="none"></audio>
        </section>
        <el-alert
          v-else
          class="recording-note"
          type="info"
          :closable="false"
          show-icon
          :title="recordingLabel(selected.recordingState)"
        />
        <div class="checklist-title"
          ><div
            ><strong>服务流程检查项</strong><small>每项 20 分，取消勾选表示该项未达标</small></div
          ><div class="total-score" :class="score < 80 ? 'score-low' : ''"
            >{{ score }}<small> / 100</small></div
          ></div
        >
        <div class="check-list"
          ><el-checkbox v-model="form.checklist.identify" :disabled="readOnly"
            >已准确确认客户身份</el-checkbox
          ><el-checkbox v-model="form.checklist.consent" :disabled="readOnly"
            >已确认客户方便沟通并礼貌沟通</el-checkbox
          ><el-checkbox v-model="form.checklist.need" :disabled="readOnly"
            >已记录客户需求或未接通原因</el-checkbox
          ><el-checkbox v-model="form.checklist.result" :disabled="readOnly"
            >通话结果记录准确</el-checkbox
          ><el-checkbox v-model="form.checklist.nextStep" :disabled="readOnly"
            >后续安排清楚且可执行</el-checkbox
          ></div
        >
        <el-form label-position="top" class="review-form"
          ><el-form-item label="改进意见 / 质检说明" :required="!readOnly && score < 80"
            ><el-input
              v-model="form.note"
              type="textarea"
              :rows="4"
              maxlength="1000"
              show-word-limit
              :disabled="readOnly"
              placeholder="记录具体问题、依据和建议" /></el-form-item
        ></el-form>
        <div v-if="readOnly" class="review-meta"
          >质检人：{{ selected.reviewerName || '—' }}　·　质检时间：{{
            formatDate(selected.reviewedAt)
          }}</div
        >
        <div v-if="!readOnly" class="drawer-footer"
          ><el-button @click="drawerVisible = false">取消</el-button
          ><el-button type="primary" :loading="saving" @click="saveReview"
            >保存质检结果</el-button
          ></div
        >
      </template>
    </el-drawer>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { checkPermi } from '@/utils/permission'
import * as ReviewApi from '@/api/callphone/service-review'
import * as ReviewPreview from '@/api/callphone/service-review/preview'
import type { ServiceReviewVO } from '@/api/callphone/service-review'

const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
const loading = ref(false)
const historyLoading = ref(false)
const saving = ref(false)
const drawerVisible = ref(false)
const readOnly = ref(false)
const recordingUrl = ref('')
const recordingLoading = ref(false)
const available = ref<ServiceReviewVO[]>([])
const selected = ref<ServiceReviewVO>()
const reviewStatus = ref('')
const pagination = reactive({ pageNo: 1, pageSize: 10 })
const page = reactive({
  list: [] as ServiceReviewVO[],
  total: 0,
  passCount: 0,
  improveCount: 0,
  averageScore: 0
})
const emptyChecklist = () => ({
  identify: true,
  consent: true,
  need: true,
  result: true,
  nextStep: true
})
const form = reactive({ checklist: emptyChecklist(), note: '' })
const score = computed(() => Object.values(form.checklist).filter(Boolean).length * 20)
const canPlayRecording = computed(
  () => !previewMode.value && checkPermi(['callphone:service:review:recording'])
)
let recordingRequestId = 0

function formatDate(value?: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '—'
}
function duration(value = 0) {
  return value ? `${Math.floor(value / 60)}分${String(value % 60).padStart(2, '0')}秒` : '—'
}
function recordingLabel(state?: ServiceReviewVO['recordingState']) {
  return (
    {
      ready: '录音可播放',
      pending: '录音待同步',
      failed: '录音上传失败',
      none: '无录音'
    }[state || 'none'] || '无录音'
  )
}
function recordingTagType(state?: ServiceReviewVO['recordingState']) {
  return state === 'ready' ? 'success' : state === 'failed' ? 'danger' : 'info'
}
async function loadAll() {
  loading.value = true
  try {
    available.value = previewMode.value
      ? ReviewPreview.getPreviewServiceReviewAvailableCalls()
      : await ReviewApi.getServiceReviewAvailableCalls()
    await loadHistory()
  } catch (error: any) {
    ElMessage.error(error?.message || '读取质检队列失败')
  } finally {
    loading.value = false
  }
}
async function loadHistory() {
  historyLoading.value = true
  try {
    const result: any = previewMode.value
      ? ReviewPreview.getPreviewServiceReviewPage({
          ...pagination,
          reviewStatus: reviewStatus.value
        })
      : await ReviewApi.getServiceReviewPage({ ...pagination, reviewStatus: reviewStatus.value })
    Object.assign(page, result)
  } catch (error: any) {
    ElMessage.error(error?.message || '读取质检记录失败')
  } finally {
    historyLoading.value = false
  }
}
function startReview(row: ServiceReviewVO) {
  releaseRecordingUrl()
  selected.value = row
  readOnly.value = false
  form.checklist = emptyChecklist()
  form.note = ''
  drawerVisible.value = true
}
function viewReview(row: ServiceReviewVO) {
  releaseRecordingUrl()
  selected.value = row
  readOnly.value = true
  form.checklist = { ...emptyChecklist(), ...row.checklist }
  form.note = row.note || ''
  drawerVisible.value = true
}
async function saveReview() {
  if (!selected.value) return
  if (score.value < 80 && form.note.trim().length < 4) {
    ElMessage.warning('低于 80 分请填写至少 4 个字的改进意见')
    return
  }
  saving.value = true
  try {
    const data = {
      ...selected.value,
      score: score.value,
      reviewStatus: score.value >= 80 ? ('pass' as const) : ('needs_improvement' as const),
      checklist: { ...form.checklist },
      note: form.note.trim()
    }
    if (previewMode.value) ReviewPreview.savePreviewServiceReview(data)
    else await ReviewApi.saveServiceReview(data)
    ElMessage.success(data.reviewStatus === 'pass' ? '质检结果已保存' : '已记录待改进事项')
    drawerVisible.value = false
    await loadAll()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存质检结果失败')
  } finally {
    saving.value = false
  }
}
async function loadRecording() {
  if (!selected.value || selected.value.recordingState !== 'ready' || !canPlayRecording.value)
    return
  const requestId = ++recordingRequestId
  recordingLoading.value = true
  try {
    const blob = await ReviewApi.getServiceReviewRecording(selected.value.callRecordId)
    if (requestId !== recordingRequestId || !drawerVisible.value) return
    releaseRecordingUrl()
    recordingUrl.value = URL.createObjectURL(blob)
  } catch (error: any) {
    if (requestId === recordingRequestId && drawerVisible.value) {
      ElMessage.error(error?.message || '录音不存在或当前账号无权播放')
    }
  } finally {
    if (requestId === recordingRequestId) recordingLoading.value = false
  }
}
function releaseRecordingUrl() {
  recordingRequestId += 1
  recordingLoading.value = false
  if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value)
  recordingUrl.value = ''
}
watch(drawerVisible, (visible) => {
  if (!visible) releaseRecordingUrl()
})
onBeforeUnmount(releaseRecordingUrl)
onMounted(loadAll)
</script>

<style scoped>
.review-page {
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

.page-heading p,
.section-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7d8999;
}

.scope-note {
  margin-bottom: 16px;
  background: #f7fbff;
  border: 1px solid #dce8f6;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.metric-card {
  display: flex;
  min-height: 104px;
  padding: 15px 18px;
  font-size: 12px;
  color: #738094;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 9px;
  flex-direction: column;
  gap: 8px;
}

.metric-card strong {
  font-size: 25px;
  line-height: 1;
  color: #243247;
}

.metric-card strong small {
  font-size: 12px;
  font-weight: 400;
}

.metric-card small,
.sub-line {
  font-size: 12px;
  color: #96a1af;
}

.queue-card,
.history-card {
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 9px;
}

.section-heading,
.history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-heading {
  margin-bottom: 17px;
}

h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: #2f3b4e;
}

.section-heading p {
  font-size: 12px;
}

.sub-line {
  display: block;
  margin-top: 5px;
}

.queue-footnote {
  display: flex;
  margin-top: 15px;
  font-size: 12px;
  color: #929dad;
  align-items: center;
  gap: 6px;
}

.history-toolbar {
  margin-bottom: 16px;
}

.history-toolbar .section-heading {
  margin-bottom: 0;
}

.status-select {
  width: 170px;
}

.score {
  font-size: 15px;
  color: #2e8b6e;
}

.score-low {
  color: #d97706;
}

.score-suffix {
  margin-left: 3px;
  font-size: 11px;
  color: #9aa4b2;
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

.call-summary {
  display: grid;
  padding: 14px;
  margin-bottom: 18px;
  background: #fafbfd;
  border: 1px solid #e7edf5;
  border-radius: 8px;
  grid-template-columns: 1fr 1.2fr 1fr;
  gap: 14px;
}

.call-summary > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.call-summary span,
.call-summary small {
  font-size: 11px;
  color: #929eac;
}

.call-summary strong {
  overflow: hidden;
  font-size: 12px;
  color: #344155;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recording-note {
  margin-bottom: 22px;
}

.recording-player {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  margin: 16px 0;
  background: #f5f8fc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.recording-player-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.recording-player-heading > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recording-player-heading small {
  color: #7a8699;
}

.recording-player audio {
  width: 100%;
}

.checklist-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.checklist-title strong,
.checklist-title small {
  display: block;
}

.checklist-title strong {
  font-size: 14px;
  color: #344155;
}

.checklist-title small {
  margin-top: 5px;
  font-size: 11px;
  color: #929eac;
}

.total-score {
  font-size: 26px;
  font-weight: 650;
  color: #2e8b6e;
}

.total-score small {
  display: inline;
  font-size: 12px;
  font-weight: 400;
  color: #929eac;
}

.check-list {
  display: flex;
  padding: 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 8px;
  flex-direction: column;
  gap: 15px;
}

.review-form {
  margin-top: 18px;
}

.review-meta {
  margin-top: 14px;
  font-size: 12px;
  color: #8995a5;
}

.drawer-footer {
  display: flex;
  padding-top: 18px;
  margin-top: 22px;
  border-top: 1px solid #edf0f4;
  justify-content: flex-end;
  gap: 10px;
}

:global(.service-review-drawer.el-drawer) {
  color: #303b4c;
  background: #fff;
}

:global(.service-review-drawer .el-drawer__header) {
  padding: 20px 24px;
  margin-bottom: 0;
  color: #253246;
  border-bottom: 1px solid #edf0f4;
}

:global(.service-review-drawer .el-drawer__body) {
  padding: 22px 24px;
  background: #fff;
}

:global(.service-review-drawer .el-checkbox__label) {
  color: #4a586b;
}

@media (width <= 1100px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
