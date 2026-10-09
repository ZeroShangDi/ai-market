<template>
  <div class="archive-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="归档、恢复状态与线索池共享当前浏览器数据。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading"
        ><div
          ><h1>无效 / 重复归档</h1
          ><p>将无效或重复线索移出待处理池，并保留可追溯的原因和恢复入口。</p></div
        ><el-tag effect="plain">{{ total }} 条本人归档</el-tag></header
      >
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane label="待处理线索" name="active"
          ><el-table v-loading="loadingActive" :data="activeLeads" row-key="id">
            <el-table-column label="线索姓名" prop="name" min-width="140" /><el-table-column
              label="联系电话"
              prop="phoneDisplay"
              min-width="140"
            /><el-table-column label="来源" prop="sourceCode" min-width="120" /><el-table-column
              label="负责人"
              prop="ownerName"
              width="120"
            /><el-table-column label="状态" width="100"
              ><template #default="{ row }"
                ><el-tag :type="row.status === 'new' ? 'warning' : 'success'">{{
                  row.status === 'new' ? '待领取' : '已领取'
                }}</el-tag></template
              ></el-table-column
            >
            <el-table-column label="操作" width="130" fixed="right"
              ><template #default="{ row }"
                ><el-button link type="danger" @click="openArchive(row)"
                  >归档线索</el-button
                ></template
              ></el-table-column
            ><template #empty
              ><el-empty :description="activeError || '没有可处理的线索'"
            /></template> </el-table
        ></el-tab-pane>
        <el-tab-pane label="归档记录" name="archives">
          <el-form :inline="true" class="filter-bar"
            ><el-form-item label="归档原因"
              ><el-select
                v-model="query.archiveType"
                clearable
                placeholder="全部类型"
                @change="loadArchives"
                ><el-option label="无效" value="invalid" /><el-option
                  label="重复"
                  value="duplicate" /><el-option label="拒绝联系" value="rejected" /><el-option
                  label="其他"
                  value="other" /></el-select></el-form-item
          ></el-form>
          <el-table v-loading="loadingArchives" :data="archives" row-key="id">
            <el-table-column label="线索" min-width="145"
              ><template #default="{ row }"
                ><strong>{{ row.leadName }}</strong
                ><small class="subline">{{ row.phoneDisplay }}</small></template
              ></el-table-column
            ><el-table-column label="类型" width="110"
              ><template #default="{ row }"
                ><el-tag :type="row.archiveType === 'duplicate' ? 'warning' : 'info'">{{
                  typeLabel(row.archiveType)
                }}</el-tag></template
              ></el-table-column
            ><el-table-column
              label="原因"
              min-width="200"
              prop="reason"
              show-overflow-tooltip
            /><el-table-column label="重复目标" width="130"
              ><template #default="{ row }">{{
                row.targetLeadId || '—'
              }}</template></el-table-column
            ><el-table-column label="归档时间" min-width="170"
              ><template #default="{ row }">{{
                formatTime(row.archivedAt)
              }}</template></el-table-column
            ><el-table-column label="状态" width="100"
              ><template #default="{ row }"
                ><el-tag :type="row.restoredAt ? 'success' : 'info'">{{
                  row.restoredAt ? '已恢复' : '已归档'
                }}</el-tag></template
              ></el-table-column
            >
            <el-table-column label="操作" width="100" fixed="right"
              ><template #default="{ row }"
                ><el-button v-if="!row.restoredAt" link type="primary" @click="restore(row)"
                  >恢复</el-button
                ><span v-else class="muted">—</span></template
              ></el-table-column
            ><template #empty
              ><el-empty :description="archiveError || '还没有归档记录'"
            /></template> </el-table
          ><footer class="table-footer"
            ><span>共 {{ total }} 条归档记录</span
            ><el-pagination
              v-model:current-page="query.pageNo"
              v-model:page-size="query.pageSize"
              :total="total"
              layout="prev, pager, next, sizes"
              @change="loadArchives"
          /></footer>
        </el-tab-pane>
      </el-tabs>
    </section>
    <el-dialog v-model="dialogVisible" title="归档线索" width="500px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top"
        ><el-form-item label="线索"
          ><el-input
            :model-value="selectedLead ? `${selectedLead.name} · ${selectedLead.phoneDisplay}` : ''"
            disabled /></el-form-item
        ><el-form-item label="归档类型" prop="archiveType"
          ><el-select v-model="form.archiveType" class="fill" @change="onArchiveTypeChange"
            ><el-option label="无效线索" value="invalid" /><el-option
              label="重复线索"
              value="duplicate" /><el-option label="拒绝联系" value="rejected" /><el-option
              label="其他"
              value="other" /></el-select></el-form-item
        ><el-form-item
          v-if="form.archiveType === 'duplicate'"
          label="重复目标线索"
          prop="targetLeadId"
          ><el-select v-model="form.targetLeadId" class="fill" filterable
            ><el-option
              v-for="lead in activeLeads.filter((item) => item.id !== selectedLead?.id)"
              :key="lead.id"
              :label="`${lead.name} · ${lead.phoneDisplay}`"
              :value="lead.id" /></el-select></el-form-item
        ><el-form-item label="处理原因" prop="reason"
          ><el-input
            v-model="form.reason"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
            placeholder="写明归档原因，便于后续审计和恢复" /></el-form-item
      ></el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="danger" :loading="saving" @click="saveArchive"
          >确认归档</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useRoute } from 'vue-router'
import * as LeadApi from '@/api/callphone/lead'
import * as PreviewStore from '@/api/callphone/preview-store'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
defineOptions({ name: 'CallPhoneLeadArchives' })
const route = useRoute(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const activeTab = ref('active'),
  activeLeads = ref<LeadApi.LeadVO[]>([]),
  archives = ref<LeadApi.LeadArchiveVO[]>([]),
  total = ref(0),
  selectedLead = ref<LeadApi.LeadVO>(),
  loadingActive = ref(false),
  loadingArchives = ref(false),
  saving = ref(false),
  dialogVisible = ref(false),
  activeError = ref(''),
  archiveError = ref(''),
  formRef = ref<FormInstance>()
const query = reactive({ pageNo: 1, pageSize: 10, archiveType: '' }),
  form = reactive({ archiveType: 'invalid', reason: '', targetLeadId: '' })
const rules: FormRules = {
  archiveType: [{ required: true, message: '请选择归档类型', trigger: 'change' }],
  reason: [{ required: true, message: '请填写处理原因', trigger: 'blur' }],
  targetLeadId: [{ required: true, message: '请选择重复目标线索', trigger: 'change' }]
}
function makeKey() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `archive-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}
async function loadActive() {
  loadingActive.value = true
  activeError.value = ''
  try {
    const result = previewMode
      ? PreviewStore.previewLeads({ pageNo: 1, pageSize: 100 })
      : await LeadApi.getLeadPage({ pageNo: 1, pageSize: 100 })
    activeLeads.value = result.list || []
  } catch (e: any) {
    activeLeads.value = []
    activeError.value = e?.message || '线索加载失败'
  } finally {
    loadingActive.value = false
  }
}
async function loadArchives() {
  loadingArchives.value = true
  archiveError.value = ''
  try {
    const params = { ...query, archiveType: query.archiveType || undefined },
      result = previewMode
        ? PreviewStore.previewLeadArchives(params)
        : await LeadApi.getLeadArchivePage(params)
    archives.value = result.list || []
    total.value = result.total || 0
  } catch (e: any) {
    archives.value = []
    total.value = 0
    archiveError.value = e?.message || '归档记录加载失败'
  } finally {
    loadingArchives.value = false
  }
}
async function onTabChange(name: string | number) {
  if (name === 'archives') await loadArchives()
  else await loadActive()
}
function openArchive(row: LeadApi.LeadVO) {
  selectedLead.value = row
  Object.assign(form, { archiveType: 'invalid', reason: '', targetLeadId: '' })
  dialogVisible.value = true
}
function onArchiveTypeChange() {
  form.targetLeadId = ''
}
async function saveArchive() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const payload = {
      leadId: selectedLead.value!.id,
      archiveType: form.archiveType,
      reason: form.reason,
      targetLeadId: form.targetLeadId || undefined
    }
    if (previewMode) {
      if (!PreviewStore.archivePreviewLead(payload)) throw new Error('无法归档此线索，请刷新列表')
    } else await LeadApi.archiveLead(payload, makeKey())
    ElMessage.success('线索已归档')
    dialogVisible.value = false
    await loadActive()
  } catch (e: any) {
    ElMessage.error(e?.message || '归档失败')
  } finally {
    saving.value = false
  }
}
async function restore(row: LeadApi.LeadArchiveVO) {
  try {
    const { value } = await ElMessageBox.prompt(
      `恢复“${row.leadName}”到原来的线索状态。请填写恢复原因。`,
      '恢复线索',
      {
        inputPlaceholder: '恢复原因',
        inputValidator: (value) => (value || '').trim().length > 0 || '请填写恢复原因'
      }
    )
    if (previewMode) {
      if (!PreviewStore.restorePreviewLeadArchive(row.id, value))
        throw new Error('记录已变化，请刷新')
    } else {
      const ok = await LeadApi.restoreLead(row.id, value)
      if (!ok) throw new Error('该记录不能恢复，请刷新')
    }
    ElMessage.success('线索已恢复')
    await loadArchives()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '恢复失败')
  }
}
function typeLabel(v: string) {
  return (
    (
      { invalid: '无效', duplicate: '重复', rejected: '拒绝联系', other: '其他' } as Record<
        string,
        string
      >
    )[v] || v
  )
}
function formatTime(v?: string) {
  return v ? parseCallPhoneDateTime(v).toLocaleString('zh-CN', { hour12: false }) : '—'
}
onMounted(loadActive)
</script>

<style scoped>
.archive-page {
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
  margin-bottom: 14px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
}

.page-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.filter-bar {
  margin: 10px 0;
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

.muted {
  color: var(--el-text-color-placeholder);
}

.fill {
  width: 100%;
}
</style>
