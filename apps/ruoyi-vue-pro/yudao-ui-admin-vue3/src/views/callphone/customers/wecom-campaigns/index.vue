<template>
  <div class="campaigns-page">
    <el-alert
      v-if="previewMode"
      class="preview-alert"
      title="页面预览 · 未连接企微"
      description="当前不展示虚构活动或客户数据。这里的首期功能仅保存本地加密草稿、估算本地快照人群并提交审批，不会发送消息。"
      type="info"
      :closable="false"
      show-icon
    />
    <section class="page-panel">
      <header class="page-heading">
        <div
          ><div class="eyebrow">客户关系 · 企业微信</div><h1>客户运营</h1
          ><p>围绕已授权同步的客户人群编排运营草稿，提交审批后等待线下审核。</p></div
        >
        <el-button v-if="previewMode || canSavePermission" type="primary" @click="openCreate"
          ><Icon icon="ep:plus" />新建运营草稿</el-button
        >
      </header>
      <div class="safety-banner"
        ><span class="safety-icon"><Icon icon="ep:lock" /></span
        ><div
          ><strong>只保存草稿，不自动触达客户</strong
          ><p
            >内容和筛选条件在本地数据库加密保存。审批状态不等于已发送；本页不会调用企微群发接口。</p
          ></div
        ><el-tag effect="plain" type="info">审核通过也不会发送</el-tag></div
      >
      <el-form :inline="true" :model="query" class="filter-bar" @submit.prevent="load">
        <el-form-item label="草稿状态"
          ><el-select v-model="query.status" clearable placeholder="全部状态" @change="load"
            ><el-option label="草稿" value="draft" /><el-option
              label="待审批"
              value="pending_review" /><el-option label="已撤回" value="withdrawn" /><el-option
              label="审核通过（未发送）"
              value="approved" /><el-option label="已驳回" value="rejected" /></el-select
        ></el-form-item>
        <el-form-item
          ><el-button type="primary" @click="load">查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="活动草稿" min-width="260"
          ><template #default="{ row }"
            ><div class="campaign-cell"
              ><span class="campaign-icon"><Icon icon="ep:promotion" /></span
              ><div
                ><strong>{{ row.name }}</strong
                ><small>最近编辑 {{ formatTime(row.updateTime) }}</small></div
              ></div
            ></template
          ></el-table-column
        >
        <el-table-column label="受众范围" min-width="190"
          ><template #default="{ row }"
            ><el-tag v-if="row.tag" effect="plain" round>{{ row.tag }}</el-tag
            ><span v-else class="muted">所选成员全部本地快照</span></template
          ></el-table-column
        >
        <el-table-column label="人群估算" min-width="190"
          ><template #default="{ row }"
            ><div
              v-if="row.estimatedRecipientCount !== undefined && row.estimatedAt"
              class="estimate-cell"
              ><strong>{{ row.estimatedRecipientCount.toLocaleString() }}</strong
              ><small>估算于 {{ formatTime(row.estimatedAt) }}</small></div
            ><span v-else class="muted">尚未估算</span></template
          ></el-table-column
        >
        <el-table-column label="状态" width="130"
          ><template #default="{ row }"
            ><el-tag :type="statusType(row.status)" effect="light">{{
              statusLabel(row.status)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="操作" width="330" fixed="right"
          ><template #default="{ row }"
            ><el-button
              v-if="row.status !== 'pending_review' && canSavePermission"
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            ><el-button
              v-if="row.status === 'draft' && canSubmitPermission"
              link
              type="primary"
              @click="submit(row)"
              >提交审批</el-button
            ><el-button
              v-if="row.status === 'pending_review' && canReview"
              link
              type="success"
              @click="approve(row)"
              >通过</el-button
            ><el-button
              v-if="row.status === 'pending_review' && canReview"
              link
              type="danger"
              @click="reject(row)"
              >驳回</el-button
            ><el-button
              v-if="row.status === 'pending_review' && canWithdrawPermission"
              link
              type="warning"
              @click="withdraw(row)"
              >撤回</el-button
            ><el-button link type="info" @click="openDetail(row)">查看内容</el-button></template
          ></el-table-column
        >
        <template #empty
          ><el-empty
            :description="
              previewMode
                ? '真实运营草稿会在连接后显示；不会载入演示活动'
                : '暂无运营草稿，可从新建草稿开始'
            "
        /></template>
      </el-table>
      <footer class="table-footer"
        ><span>共 {{ total.toLocaleString() }} 个草稿</span
        ><el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="load"
      /></footer>
    </section>

    <el-drawer
      v-model="editorVisible"
      :title="previewMode ? '运营草稿预览' : form.id ? '编辑运营草稿' : '新建运营草稿'"
      size="620px"
      destroy-on-close
    >
      <div v-if="previewMode" class="drawer-preview-note"
        ><Icon icon="ep:info-filled" />预览只展示编辑结构，不会保存任何活动或模拟审批结果。</div
      >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="campaign-form"
      >
        <el-form-item label="活动名称" prop="name"
          ><el-input v-model="form.name" maxlength="80" placeholder="例如：新品体验邀约"
        /></el-form-item>
        <el-form-item label="目标跟进成员" prop="ownerKey"
          ><el-select
            v-model="form.ownerKey"
            filterable
            placeholder="选择有权同步企微客户的成员"
            class="fill"
            :loading="usersLoading"
            :disabled="previewMode"
            ><el-option
              v-for="user in members"
              :key="user.userId"
              :label="user.name"
              :value="user.userId" /></el-select
          ><div class="field-help">受众只从该成员已同步到本地的客户快照估算。</div></el-form-item
        >
        <el-form-item label="按客户标签筛选"
          ><el-input
            v-model="form.tag"
            maxlength="128"
            placeholder="留空表示该成员的全部本地客户"
            :disabled="previewMode"
          /><div class="field-help"
            >按企微跟进资料中的标签精确匹配；空标签不包含未同步数据。</div
          ></el-form-item
        >
        <el-form-item label="运营内容" prop="content"
          ><el-input
            v-model="form.content"
            type="textarea"
            :rows="7"
            maxlength="5000"
            show-word-limit
            placeholder="编写待审批的运营文案。保存后会加密写入部署方本地数据库。"
        /></el-form-item>
        <div v-if="estimate" class="estimate-result"
          ><span class="estimate-mark"><Icon icon="ep:data-analysis" /></span
          ><div
            ><strong>本地受众估算：{{ estimate.count.toLocaleString() }} 人</strong
            ><p>{{ estimate.basis }} · {{ formatTime(estimate.estimatedAt) }}</p></div
          ><el-tag type="info" effect="plain">仅为快照估算</el-tag></div
        >
        <div
          v-else-if="form.estimatedRecipientCount !== undefined && form.estimatedAt"
          class="estimate-result"
          ><span class="estimate-mark"><Icon icon="ep:data-analysis" /></span
          ><div
            ><strong>本地受众估算：{{ form.estimatedRecipientCount.toLocaleString() }} 人</strong
            ><p>估算时间 {{ formatTime(form.estimatedAt) }}</p></div
          ><el-tag type="info" effect="plain">提交前需重新估算</el-tag></div
        >
        <div class="no-send-note"
          ><Icon icon="ep:warning" />提交只进入待审批状态，不会向任何企微客户发送消息。</div
        >
      </el-form>
      <template #footer
        ><div class="drawer-footer"
          ><el-button @click="editorVisible = false">关闭</el-button
          ><el-button
            :disabled="previewMode || !canSavePermission || !canSave"
            :loading="saving"
            @click="save"
            >保存加密草稿</el-button
          ><el-button
            :disabled="previewMode || !canEstimatePermission || !form.id || !form.ownerKey"
            :loading="estimating"
            @click="estimateAudience"
            >估算本地人群</el-button
          ><el-button
            type="primary"
            :disabled="previewMode || !canSubmitPermission || !canSubmit"
            :loading="submitting"
            @click="submitForm"
            >提交审批</el-button
          ></div
        ></template
      >
    </el-drawer>

    <el-drawer v-model="detailVisible" title="运营草稿内容" size="520px" destroy-on-close>
      <template v-if="detail"
        ><div class="detail-header"
          ><h2>{{ detail.name }}</h2
          ><el-tag :type="statusType(detail.status)" effect="light">{{
            statusLabel(detail.status)
          }}</el-tag></div
        ><el-descriptions :column="1" border
          ><el-descriptions-item label="目标成员">{{
            memberName(detail.ownerKey)
          }}</el-descriptions-item
          ><el-descriptions-item label="目标标签">{{
            detail.tag || '全部本地客户'
          }}</el-descriptions-item
          ><el-descriptions-item label="估算人数">{{
            detail.estimatedRecipientCount?.toLocaleString() ?? '尚未估算'
          }}</el-descriptions-item
          ><el-descriptions-item label="估算时间">{{
            formatTime(detail.estimatedAt)
          }}</el-descriptions-item></el-descriptions
        ><div class="message-preview"
          ><div class="message-preview-title">待审批文案</div><p>{{ detail.content }}</p></div
        ><div class="no-send-note"
          ><Icon icon="ep:lock" />该内容仅保存在本地加密草稿中，不存在发送记录。</div
        ><section class="campaign-audit">
          <h3>流转记录</h3>
          <el-timeline v-if="auditRows.length">
            <el-timeline-item
              v-for="(event, index) in auditRows"
              :key="`${event.campaignVersion}-${index}`"
              :timestamp="formatTime(event.createTime)"
              :type="auditActionType(event.action)"
            >
              <strong>{{ auditActionLabel(event.action) }}</strong>
              <div class="audit-actor">{{ event.actorName || `成员 ${event.actorId}` }}</div>
              <p v-if="event.note" class="audit-note">{{ event.note }}</p>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无流转记录" :image-size="56" />
        </section>
        ></template
      ><el-empty v-else description="读取草稿失败，请重试" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import { checkPermi } from '@/utils/permission'
import * as CampaignApi from '@/api/callphone/wecom/campaign'

defineOptions({ name: 'CallPhoneWeComCampaigns' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const canSavePermission = !previewMode && checkPermi(['callphone:wecom:campaign:save'])
const canEstimatePermission = !previewMode && checkPermi(['callphone:wecom:campaign:estimate'])
const canSubmitPermission = !previewMode && checkPermi(['callphone:wecom:campaign:submit'])
const canWithdrawPermission = !previewMode && checkPermi(['callphone:wecom:campaign:withdraw'])
const canReview = !previewMode && checkPermi(['callphone:wecom:campaign:review'])
const loading = ref(false)
const saving = ref(false)
const estimating = ref(false)
const submitting = ref(false)
const usersLoading = ref(false)
const editorVisible = ref(false)
const detailVisible = ref(false)
const rows = ref<CampaignApi.WeComCampaignVO[]>([])
const members = ref<CampaignApi.WeComCampaignMemberOption[]>([])
const total = ref(0)
const detail = ref<CampaignApi.WeComCampaignVO>()
const auditRows = ref<CampaignApi.WeComCampaignAuditVO[]>([])
const estimate = ref<{ count: number; estimatedAt: string; basis: string }>()
const formRef = ref<FormInstance>()
const query = reactive({ pageNo: 1, pageSize: 10, status: '' })
const emptyForm = () => ({
  id: undefined as string | undefined,
  name: '',
  content: '',
  ownerKey: '',
  tag: '',
  status: 'draft' as CampaignApi.WeComCampaignStatus,
  estimatedRecipientCount: undefined as number | undefined,
  estimatedAt: undefined as string | undefined,
  version: 0
})
const form = reactive(emptyForm())
const canSave = computed(() => Boolean(form.name.trim() && form.content.trim() && form.ownerKey))
const canSubmit = computed(() =>
  Boolean(
    form.id &&
    form.estimatedRecipientCount &&
    form.estimatedAt &&
    Date.now() - new Date(form.estimatedAt).getTime() < 30 * 60 * 1000
  )
)
const rules: FormRules = {
  name: [{ required: true, message: '请填写活动名称', trigger: 'blur' }],
  ownerKey: [{ required: true, message: '请选择目标跟进成员', trigger: 'change' }],
  content: [{ required: true, message: '请填写运营内容', trigger: 'blur' }]
}

async function load() {
  if (previewMode) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const page = (await CampaignApi.getWeComCampaignPage({
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      status: query.status || undefined
    })) as { list?: CampaignApi.WeComCampaignVO[]; total?: number }
    rows.value = page.list || []
    total.value = page.total || 0
  } catch (error: any) {
    rows.value = []
    total.value = 0
    ElMessage.error(error?.message || '运营草稿读取失败')
  } finally {
    loading.value = false
  }
}
async function loadMembers() {
  if (previewMode) return
  usersLoading.value = true
  try {
    members.value = await CampaignApi.getWeComCampaignAudienceOptions()
  } catch (error: any) {
    members.value = []
    ElMessage.error(error?.message || '企微成员读取失败，请先配置企业微信连接')
  } finally {
    usersLoading.value = false
  }
}
function openCreate() {
  Object.assign(form, emptyForm())
  estimate.value = undefined
  editorVisible.value = true
  void loadMembers()
}
async function openEdit(row: CampaignApi.WeComCampaignVO) {
  if (previewMode) return
  try {
    const full = await CampaignApi.getWeComCampaign(row.id!)
    if (!full) throw new Error('运营草稿不存在')
    Object.assign(form, { ...emptyForm(), ...full })
    estimate.value = undefined
    editorVisible.value = true
    await loadMembers()
  } catch (error: any) {
    ElMessage.error(error?.message || '运营草稿读取失败')
  }
}
async function openDetail(row: CampaignApi.WeComCampaignVO) {
  if (previewMode) {
    ElMessage.info('预览不含虚构活动数据')
    return
  }
  detailVisible.value = true
  detail.value = undefined
  auditRows.value = []
  try {
    const [campaign, audits] = await Promise.all([
      CampaignApi.getWeComCampaign(row.id!),
      CampaignApi.getWeComCampaignAuditList(row.id!)
    ])
    detail.value = campaign || undefined
    auditRows.value = audits || []
  } catch (error: any) {
    ElMessage.error(error?.message || '运营草稿读取失败')
  }
}
async function save() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const saved = await CampaignApi.saveWeComCampaign({
      id: form.id,
      name: form.name,
      content: form.content,
      ownerKey: form.ownerKey,
      tag: form.tag,
      expectedVersion: form.version
    })
    Object.assign(form, saved)
    estimate.value = undefined
    ElMessage.success('本地加密草稿已保存')
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存草稿失败')
  } finally {
    saving.value = false
  }
}
async function estimateAudience() {
  if (!form.id) {
    ElMessage.warning('请先保存草稿，再估算人群')
    return
  }
  estimating.value = true
  try {
    const result = await CampaignApi.estimateWeComCampaign({
      id: form.id,
      expectedVersion: form.version
    })
    estimate.value = result
    form.estimatedRecipientCount = result.count
    form.estimatedAt = result.estimatedAt
    form.version = result.version
    ElMessage.success(`按本地快照估算 ${result.count.toLocaleString()} 人`)
  } catch (error: any) {
    ElMessage.error(error?.message || '本地人群估算失败')
  } finally {
    estimating.value = false
  }
}
async function submitForm() {
  if (!form.id || !canSubmit.value) {
    ElMessage.warning('请先保存草稿并在 30 分钟内重新估算')
    return
  }
  try {
    await ElMessageBox.confirm('草稿将进入待审批状态。本操作不会发送企微消息。', '提交审批', {
      confirmButtonText: '提交审批',
      cancelButtonText: '再检查一下',
      type: 'info'
    })
  } catch {
    return
  }
  submitting.value = true
  try {
    await CampaignApi.submitWeComCampaign({ id: form.id, expectedVersion: form.version })
    ElMessage.success('已提交审批，尚未触达客户')
    editorVisible.value = false
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '提交审批失败')
  } finally {
    submitting.value = false
  }
}
async function submit(row: CampaignApi.WeComCampaignVO) {
  if (!row.id) return
  if (
    !row.estimatedRecipientCount ||
    !row.estimatedAt ||
    Date.now() - new Date(row.estimatedAt).getTime() >= 30 * 60 * 1000
  ) {
    ElMessage.warning('请打开草稿并重新估算本地人群后再提交')
    return
  }
  try {
    await ElMessageBox.confirm('这只会提交审批，不会向企微客户发送消息。', '提交审批', {
      confirmButtonText: '提交审批',
      cancelButtonText: '取消',
      type: 'info'
    })
    await CampaignApi.submitWeComCampaign({ id: row.id, expectedVersion: row.version })
    ElMessage.success('已进入待审批状态')
    await load()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '提交审批失败')
  }
}
async function withdraw(row: CampaignApi.WeComCampaignVO) {
  if (!row.id) return
  try {
    await ElMessageBox.confirm('撤回后可继续编辑，当前不会触达任何客户。', '撤回审批', {
      confirmButtonText: '撤回',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await CampaignApi.withdrawWeComCampaign({ id: row.id, expectedVersion: row.version })
    ElMessage.success('已撤回到草稿')
    await load()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '撤回失败')
  }
}
async function approve(row: CampaignApi.WeComCampaignVO) {
  if (!row.id || !canReview) return
  try {
    await ElMessageBox.confirm(
      '确认通过本次内部审核？通过状态仅用于本地记录，不会发送企微消息。',
      '审核通过',
      { confirmButtonText: '确认通过', cancelButtonText: '再检查一下', type: 'success' }
    )
    await CampaignApi.approveWeComCampaign({ id: row.id, expectedVersion: row.version })
    ElMessage.success('内部审核已通过，未发送客户消息')
    await load()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '审核操作失败')
  }
}
async function reject(row: CampaignApi.WeComCampaignVO) {
  if (!row.id || !canReview) return
  try {
    const { value } = await ElMessageBox.prompt(
      '请填写驳回原因，保存后可查看并修改草稿。',
      '驳回运营草稿',
      {
        inputType: 'textarea',
        inputPlaceholder: '说明需要调整的内容',
        inputValidator: (value) => (value || '').trim().length > 0 || '请填写驳回原因'
      }
    )
    await CampaignApi.rejectWeComCampaign({
      id: row.id,
      expectedVersion: row.version,
      note: value.trim()
    })
    ElMessage.success('已驳回，发起人可修改后重新提交')
    await load()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '驳回失败')
  }
}
function reset() {
  query.pageNo = 1
  query.status = ''
  void load()
}
function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
function statusLabel(status: CampaignApi.WeComCampaignStatus) {
  return {
    draft: '草稿',
    pending_review: '待审批',
    withdrawn: '已撤回',
    approved: '审核通过（未发送）',
    rejected: '已驳回'
  }[status]
}
function statusType(
  status: CampaignApi.WeComCampaignStatus
): 'info' | 'warning' | 'success' | 'danger' | undefined {
  const types: Record<
    CampaignApi.WeComCampaignStatus,
    'info' | 'warning' | 'success' | 'danger' | undefined
  > = {
    draft: 'info',
    pending_review: 'warning',
    withdrawn: undefined,
    approved: 'success',
    rejected: 'danger'
  }
  return types[status]
}
function auditActionLabel(action: string) {
  return (
    {
      draft_saved: '保存草稿',
      audience_estimated: '估算目标人群',
      submitted_for_review: '提交审批',
      withdrawn: '撤回审批',
      approved: '审核通过（未发送）',
      rejected: '驳回草稿'
    }[action] || action
  )
}
function auditActionType(action: string): 'primary' | 'success' | 'danger' | 'warning' | 'info' {
  return action === 'approved'
    ? 'success'
    : action === 'rejected'
      ? 'danger'
      : action === 'submitted_for_review'
        ? 'warning'
        : 'primary'
}
function memberName(key?: string) {
  return members.value.find((item) => item.userId === key)?.name || key || '—'
}
onMounted(() => {
  void load()
})
</script>

<style scoped>
.campaigns-page {
  padding: 20px 22px 28px;
  color: #20293b;
}

.preview-alert {
  margin-bottom: 16px;
}

.page-panel {
  padding: 24px 24px 16px;
  background: #fff;
  border: 1px solid #e9edf4;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgb(31 48 80 / 3%);
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.eyebrow {
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #3159d9;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  color: #20293b;
}

.page-heading p {
  margin: 8px 0 0;
  font-size: 13px;
  color: #7b8598;
}

.page-heading :deep(.iconify) {
  margin-right: 6px;
}

.safety-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 18px;
  background: #f4f7ff;
  border: 1px solid #e5ebff;
  border-radius: 10px;
}

.safety-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  color: #3159d9;
  background: #e6edff;
  border-radius: 10px;
  place-items: center;
}

.safety-banner > div {
  flex: 1;
}

.safety-banner strong {
  font-size: 13px;
  color: #303b50;
}

.safety-banner p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #7b8598;
}

.filter-bar {
  padding: 15px 15px 0;
  margin-bottom: 12px;
  background: #f8f9fc;
  border-radius: 9px;
}

.filter-bar :deep(.el-select) {
  width: 190px;
}

.campaign-cell {
  display: flex;
  align-items: center;
  gap: 11px;
}

.campaign-cell > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.campaign-cell strong {
  font-size: 13px;
  font-weight: 600;
  color: #303b50;
}

.campaign-cell small,
.estimate-cell small {
  font-size: 11px;
  color: #9aa3b3;
}

.campaign-icon {
  display: grid;
  width: 36px;
  height: 36px;
  color: #526fd1;
  background: #edf2ff;
  border-radius: 10px;
  place-items: center;
}

.estimate-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.estimate-cell strong {
  font-size: 14px;
  color: #303b50;
}

.muted {
  font-size: 12px;
  color: #9aa3b3;
}

.table-footer {
  display: flex;
  padding-top: 15px;
  font-size: 12px;
  color: #7b8598;
  align-items: center;
  justify-content: space-between;
}

.campaign-form {
  padding: 6px 4px 22px;
}

.fill {
  width: 100%;
}

.field-help {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: #98a1b1;
}

.estimate-result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px;
  margin: 6px 0 16px;
  background: #f4f7ff;
  border: 1px solid #e5ebff;
  border-radius: 9px;
}

.estimate-mark {
  display: grid;
  width: 34px;
  height: 34px;
  color: #4567d5;
  background: #e5ecff;
  border-radius: 9px;
  place-items: center;
}

.estimate-result > div {
  flex: 1;
}

.estimate-result strong {
  font-size: 13px;
  color: #303b50;
}

.estimate-result p {
  margin: 4px 0 0;
  font-size: 11px;
  color: #8994a7;
}

.no-send-note {
  display: flex;
  padding: 11px 12px;
  font-size: 12px;
  line-height: 1.55;
  color: #7b6b45;
  background: #fff9eb;
  border: 1px solid #f6ebca;
  border-radius: 8px;
  gap: 8px;
}

.drawer-preview-note {
  display: flex;
  padding: 11px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #5e6d89;
  background: #f4f7ff;
  border-radius: 8px;
  gap: 8px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.detail-header h2 {
  margin: 0;
  font-size: 18px;
  color: #20293b;
}

.message-preview {
  padding: 16px;
  margin: 20px 0;
  background: #f8f9fc;
  border: 1px solid #edf0f5;
  border-radius: 9px;
}

.message-preview-title {
  margin-bottom: 10px;
  font-size: 12px;
  color: #7b8598;
}

.message-preview p {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: #303b50;
  white-space: pre-wrap;
}

.campaign-audit {
  padding-top: 18px;
  margin-top: 22px;
  border-top: 1px solid #edf0f5;
}

.campaign-audit h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 650;
  color: #303b50;
}

.audit-actor {
  margin-top: 3px;
  font-size: 12px;
  color: #7b8598;
}

.audit-note {
  padding: 8px 10px;
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #4b5568;
  white-space: pre-wrap;
  background: #f8f9fc;
  border-radius: 6px;
}

@media (width <= 900px) {
  .page-heading {
    flex-direction: column;
  }

  .safety-banner {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .drawer-footer {
    flex-wrap: wrap;
  }
}
</style>
