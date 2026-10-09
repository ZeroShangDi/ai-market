<template>
  <div class="lead-pool-page">
    <PageWrap title="线索池" description="查看待领取线索和本人已领取线索。号码仅显示脱敏信息。">
      <template #titleExtra><PageButtons :items="pageButtons" /></template>
      <template #descriptionExtra>
        <el-tag v-if="previewMode" type="warning" effect="light">本地预览</el-tag>
      </template>
      <template #search>
        <PageSearch
          :schema="searchSchema"
          :model="searchModel"
          @search="applySearch"
          @reset="resetSearch"
        />
      </template>
      <PageTable
        :columns="tableColumns"
        :data="rows"
        :total="total"
        :page="query.pageNo"
        :page-size="query.pageSize"
        :loading="loading"
        row-key="id"
        empty-text="当前没有可见线索"
        @page-change="handlePageChange"
      >
        <template #empty><el-empty :description="error || '当前没有可见线索'" /></template>
        <template #sourceCode="{ row }"
          ><SourceLabel :value="row.sourceCode" :options="sources"
        /></template>
        <template #score="{ row }"><ScoreCell :value="row.score" /></template>
        <template #ownerName="{ row }">{{ row.ownerName || '待领取' }}</template>
        <template #createTime="{ row }">{{ formatTime(row.createTime) }}</template>
        <template #status="{ row }"
          ><StatusTag :status="row.status" :labels="statusLabels"
        /></template>
        <template #footer>
          <span class="privacy-note"
            >领取由服务端原子校验；多人同时领取时只会有一人成功。完整姓名与电话采用 AES-256-GCM
            加密存储。</span
          >
        </template>
      </PageTable>
    </PageWrap>

    <el-dialog v-model="dialogVisible" title="新增线索" width="500px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="线索姓名" prop="name"
          ><el-input v-model="form.name" maxlength="80" placeholder="请输入联系人姓名或称呼"
        /></el-form-item>
        <el-form-item label="联系电话" prop="phone"
          ><el-input v-model="form.phone" maxlength="20" placeholder="请输入联系电话"
        /></el-form-item>
        <el-form-item label="来源渠道" prop="sourceCode"
          ><el-select v-model="form.sourceCode" class="fill" clearable placeholder="请选择来源"
            ><el-option
              v-for="item in sources"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select
        ></el-form-item>
        <el-form-item label="线索评分"
          ><el-slider v-model="form.score" :min="0" :max="100" show-input
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="save"
          >创建并放入待领取池</el-button
        ></template
      >
    </el-dialog>

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept=".csv,text/csv"
      aria-label="选择 CSV 文件"
      @change="readImportFile"
    />
    <el-dialog v-model="importVisible" title="导入线索 CSV" width="900px" destroy-on-close>
      <div class="import-intro">
        <div>
          <strong>先检查数据，再导入到待领取池</strong>
          <p
            >支持 UTF-8 CSV，最多 500 行、5
            MB。文件在浏览器解析，校验通过的线索逐条写入当前部署服务，不会上传或保存原始文件。</p
          >
        </div>
        <el-button link type="primary" @click="downloadTemplate">下载 CSV 模板</el-button>
      </div>
      <div class="import-toolbar">
        <el-button :disabled="importing" @click="chooseImportFile">选择 CSV 文件</el-button>
        <span v-if="importFileName" class="import-filename">{{ importFileName }}</span>
        <span v-if="importRows.length" class="import-counts">
          可导入 {{ readyCount }} 条 · 已导入 {{ importedCount }} 条 · 需处理 {{ issueCount }} 条
        </span>
      </div>
      <el-table v-if="importRows.length" :data="importRows" max-height="390" row-key="rowNo">
        <el-table-column label="行" prop="rowNo" width="62" />
        <el-table-column label="姓名" prop="name" min-width="120" show-overflow-tooltip />
        <el-table-column label="联系电话" prop="phone" min-width="145" />
        <el-table-column label="来源" min-width="125">
          <template #default="{ row }">{{ sourceLabel(row.sourceCode) }}</template>
        </el-table-column>
        <el-table-column label="评分" prop="score" width="75" />
        <el-table-column label="校验 / 状态" min-width="190">
          <template #default="{ row }">
            <el-tag v-if="row.state === 'imported'" type="success" effect="light">已导入</el-tag>
            <el-tag v-else-if="row.state === 'importing'" type="primary" effect="light"
              >正在导入</el-tag
            >
            <el-tag v-else-if="row.state === 'duplicate'" type="info" effect="light"
              >文件内重复</el-tag
            >
            <el-tag v-else-if="row.state === 'invalid'" type="danger" effect="light"
              >格式错误</el-tag
            >
            <el-tag v-else-if="row.state === 'failed'" type="danger" effect="light"
              >导入失败</el-tag
            >
            <el-tag v-else effect="light">待导入</el-tag>
            <span v-if="row.issue" class="import-issue">{{ row.issue }}</span>
          </template>
        </el-table-column>
        <template #empty><el-empty description="CSV 中没有可预览的数据行" /></template>
      </el-table>
      <el-empty v-else description="选择 CSV 文件后，可先检查字段和格式" :image-size="72" />
      <template #footer>
        <el-button :disabled="importing" @click="importVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :disabled="readyCount === 0"
          :loading="importing"
          @click="importLeads"
        >
          {{
            importing
              ? '正在导入 ' + importProgress + '/' + importTarget
              : '导入剩余 ' + readyCount + ' 条'
          }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useUserStore } from '@/store/modules/user'
import { useRoute, useRouter } from 'vue-router'
import * as LeadApi from '@/api/callphone/lead'
import * as PreviewStore from '@/api/callphone/preview-store'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
import {
  PageButtons,
  PageSearch,
  PageTable,
  PageWrap,
  ScoreCell,
  SourceLabel,
  StatusTag,
  type PageButtonItem,
  type PageRowAction,
  type PageTableColumn
} from '@/components/callphone'
import type { FormSchema } from '@/types/form'

defineOptions({ name: 'CallPhoneLeadPool' })
const route = useRoute(),
  router = useRouter(),
  userStore = useUserStore(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false),
  saving = ref(false),
  dialogVisible = ref(false),
  importVisible = ref(false),
  importing = ref(false),
  error = ref(''),
  claimingId = ref('')
const rows = ref<LeadApi.LeadVO[]>([]),
  total = ref(0),
  formRef = ref<FormInstance>(),
  fileInput = ref<HTMLInputElement>(),
  importRows = ref<ImportRow[]>([]),
  importFileName = ref(''),
  importProgress = ref(0),
  importTarget = ref(0)
const query = reactive({ pageNo: 1, pageSize: 10, sourceCode: '', query: '' })
const form = reactive({ name: '', phone: '', sourceCode: 'web_form', score: 60 })
const sources = [
  { value: 'manual', label: '手工录入' },
  { value: 'web_form', label: '网站表单' },
  { value: 'referral', label: '客户转介绍' },
  { value: 'channel', label: '渠道获客' }
]
const statusLabels = { new: '待领取', claimed: '已领取' }
const searchModel = reactive({ query: '', sourceCode: '' })
const searchSchema: FormSchema[] = [
  {
    field: 'sourceCode',
    label: '来源',
    component: 'Select',
    componentProps: {
      clearable: true,
      placeholder: '全部来源',
      options: sources.map((item) => ({ label: item.label, value: item.value }))
    }
  },
  {
    field: 'query',
    label: '号码后四位',
    component: 'Input',
    componentProps: { clearable: true, maxlength: 4, placeholder: '输入号码后四位' }
  }
]
const pageButtons: PageButtonItem[] = [
  { key: 'import', label: '导入 CSV', onClick: openImport },
  { key: 'create', label: '新增线索', type: 'primary', onClick: openCreate }
]
const rowActions: PageRowAction[] = [
  {
    key: 'claim',
    label: '领取线索',
    visible: (row) => row.status === 'new',
    loading: (row) => claimingId.value === row.id,
    onClick: (row) => claim(row as LeadApi.LeadVO)
  },
  {
    key: 'follow-up',
    label: '记录跟进',
    visible: (row) => {
      if (row.status !== 'claimed') return false
      const ownerUserId = String(row.ownerUserId || '')
      return ownerUserId === (previewMode ? 'demo-user' : String(userStore.getUser.id))
    },
    onClick: (row) => openLeadFollowUp(row as LeadApi.LeadVO)
  },
  {
    key: 'convert',
    label: '转为客户',
    visible: (row) => row.status !== 'new',
    loading: (row) => claimingId.value === row.id,
    onClick: (row) => convert(row as LeadApi.LeadVO)
  }
]
const tableColumns: PageTableColumn[] = [
  { prop: 'name', label: '线索姓名', minWidth: 112 },
  { prop: 'phoneDisplay', label: '联系电话', minWidth: 128 },
  { prop: 'sourceCode', label: '来源', minWidth: 105 },
  { prop: 'score', label: '线索评分', width: 120 },
  { prop: 'ownerName', label: '负责人', width: 95 },
  { prop: 'createTime', label: '创建时间', minWidth: 160 },
  { prop: 'status', label: '状态', width: 84 },
  {
    prop: 'actions',
    label: '操作',
    width: 190,
    fixed: 'right',
    type: 'actions',
    actions: rowActions
  }
]
function openLeadFollowUp(row: LeadApi.LeadVO) {
  void router.push({
    path: previewMode ? '/callphone-preview/lead-follow-ups' : '/callphone/lead-follow-ups',
    query: { ...(previewMode ? { preview: '1' } : {}), leadId: row.id }
  })
}
const rules: FormRules = {
  name: [{ required: true, message: '请填写线索姓名', trigger: 'blur' }],
  phone: [
    { required: true, message: '请填写联系电话', trigger: 'blur' },
    { pattern: /^\+?[0-9][0-9 -]{5,19}$/, message: '请输入有效的联系电话', trigger: 'blur' }
  ]
}
type ImportRow = {
  rowNo: number
  name: string
  phone: string
  sourceCode: string
  score: number
  state: 'ready' | 'importing' | 'imported' | 'invalid' | 'duplicate' | 'failed'
  issue: string
  idempotencyKey: string
}
const readyCount = computed(
  () => importRows.value.filter((row) => row.state === 'ready' || row.state === 'failed').length
)
const importedCount = computed(
  () => importRows.value.filter((row) => row.state === 'imported').length
)
const issueCount = computed(
  () =>
    importRows.value.filter(
      (row) => row.state === 'invalid' || row.state === 'duplicate' || row.state === 'failed'
    ).length
)
async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = {
      ...query,
      sourceCode: query.sourceCode || undefined,
      query: query.query || undefined
    }
    const result = previewMode
      ? PreviewStore.previewLeads(params)
      : await LeadApi.getLeadPage(params)
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.message || '线索加载失败'
  } finally {
    loading.value = false
  }
}
function applySearch(values: Record<string, any>) {
  searchModel.query = values.query || ''
  searchModel.sourceCode = values.sourceCode || ''
  query.query = searchModel.query
  query.sourceCode = searchModel.sourceCode
  query.pageNo = 1
  load()
}
function resetSearch() {
  searchModel.query = ''
  searchModel.sourceCode = ''
  query.pageNo = 1
  query.query = ''
  query.sourceCode = ''
  load()
}
function handlePageChange(value: { page: number; limit: number }) {
  query.pageNo = value.page
  query.pageSize = value.limit
  load()
}
function openCreate() {
  Object.assign(form, { name: '', phone: '', sourceCode: 'web_form', score: 60 })
  dialogVisible.value = true
}
function openImport() {
  importRows.value = []
  importFileName.value = ''
  importVisible.value = true
}
function chooseImportFile() {
  if (fileInput.value) fileInput.value.value = ''
  fileInput.value?.click()
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell.length === 0) quoted = true
    else if (char === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell.trim())
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号')
  row.push(cell.trim())
  if (row.some((value) => value !== '')) rows.push(row)
  return rows
}
function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[ _-]/g, '')
}
async function readImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importFileName.value = file.name
  importRows.value = []
  if (!file.name.toLowerCase().endsWith('.csv') || file.size > 5 * 1024 * 1024) {
    ElMessage.error('请选择不超过 5 MB 的 CSV 文件')
    return
  }
  try {
    const records = parseCsv((await file.text()).replace(/^\uFEFF/, ''))
    if (records.length < 2) throw new Error('文件至少需要一行表头和一行数据')
    if (records.length > 501) throw new Error('单次最多导入 500 行，请拆分文件后重试')
    const headers = records[0].map(normalizeHeader)
    const findColumn = (...names: string[]) => headers.findIndex((header) => names.includes(header))
    const nameColumn = findColumn('name', '姓名', '联系人', '线索姓名')
    const phoneColumn = findColumn('phone', 'mobile', 'telephone', '电话', '手机号', '联系电话')
    const sourceColumn = findColumn('sourcecode', 'source', '来源码', '来源')
    const scoreColumn = findColumn('score', '评分')
    if (nameColumn < 0 || phoneColumn < 0) throw new Error('表头必须包含“姓名”和“电话”列')
    const seenPhones = new Set<string>()
    importRows.value = records.slice(1).map((record, index) => {
      const name = record[nameColumn] || ''
      const phone = (record[phoneColumn] || '').trim()
      const sourceInput = sourceColumn < 0 ? 'manual' : record[sourceColumn] || 'manual'
      const sourceCode =
        sources.find((item) => item.value === sourceInput || item.label === sourceInput)?.value ||
        ''
      const scoreText = scoreColumn < 0 || !record[scoreColumn] ? '60' : record[scoreColumn]
      const score = Number(scoreText)
      const phoneKey = phone.replace(/[\s()-]/g, '')
      let issue = ''
      let state: ImportRow['state'] = 'ready'
      if (!name.trim()) issue = '姓名不能为空'
      else if (name.trim().length > 80) issue = '姓名最多 80 个字符'
      else if (!/^\+?[0-9][0-9 -]{5,19}$/.test(phone)) issue = '联系电话格式无效'
      else if (sourceColumn >= 0 && !sourceCode) issue = '来源不在支持范围内'
      else if (!Number.isInteger(score) || score < 0 || score > 100) issue = '评分须为 0–100 的整数'
      else if (seenPhones.has(phoneKey)) {
        issue = '与文件中的较早行号码重复'
        state = 'duplicate'
      }
      if (issue && state !== 'duplicate') state = 'invalid'
      if (state === 'ready') seenPhones.add(phoneKey)
      return {
        rowNo: index + 2,
        name: name.trim(),
        phone,
        sourceCode: sourceCode || 'manual',
        score,
        state,
        issue,
        idempotencyKey: makeKey()
      }
    })
  } catch (e: any) {
    ElMessage.error(e?.message || 'CSV 读取失败，请确认文件使用 UTF-8 编码')
  }
}
async function importLeads() {
  const pending = importRows.value.filter((row) => row.state === 'ready' || row.state === 'failed')
  if (!pending.length || importing.value) return
  importing.value = true
  importProgress.value = 0
  importTarget.value = pending.length
  for (const row of pending) {
    row.state = 'importing'
    row.issue = ''
    try {
      const payload = {
        name: row.name,
        phone: row.phone,
        sourceCode: row.sourceCode,
        score: row.score
      }
      if (previewMode) PreviewStore.savePreviewLead(payload)
      else await LeadApi.createLead(payload, row.idempotencyKey)
      row.state = 'imported'
    } catch (e: any) {
      row.state = 'failed'
      row.issue = e?.message || '保存失败，可安全重试此行'
    } finally {
      importProgress.value += 1
    }
  }
  importing.value = false
  if (importedCount.value) {
    ElMessage.success(
      '本次成功导入 ' + pending.filter((row) => row.state === 'imported').length + ' 条'
    )
    await load()
  }
}
function downloadTemplate() {
  const blob = new Blob(['姓名,电话,来源码,评分\n张三,13800138000,manual,60\n'], {
    type: 'text/csv;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'callphone-leads-template.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}
function makeKey() {
  return (
    globalThis.crypto?.randomUUID?.() || `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}
async function save() {
  await formRef.value?.validate()
  saving.value = true
  try {
    if (previewMode) PreviewStore.savePreviewLead({ ...form })
    else await LeadApi.createLead({ ...form }, makeKey())
    ElMessage.success('线索已放入待领取池')
    dialogVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败')
  } finally {
    saving.value = false
  }
}
async function claim(row: LeadApi.LeadVO) {
  try {
    await ElMessageBox.confirm(`确认领取“${row.name}”吗？`, '领取线索')
    claimingId.value = row.id
    if (previewMode) {
      if (!PreviewStore.claimPreviewLead(row.id)) throw new Error('该线索已被领取，请刷新列表')
    } else {
      const ok = await LeadApi.claimLead(row.id)
      if (!ok) throw new Error('该线索已被其他成员领取，请刷新列表')
    }
    ElMessage.success('线索已领取')
    await load()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '领取失败')
  } finally {
    claimingId.value = ''
  }
}
async function convert(row: LeadApi.LeadVO) {
  try {
    const { value } = await ElMessageBox.prompt(
      `将“${row.name}”转为客户，并保留渠道来源和脱敏号码。可填写转化说明。`,
      '转为客户',
      {
        inputPlaceholder: '选填：转化说明',
        inputType: 'textarea',
        inputValidator: (value) => (value || '').length <= 1000 || '说明最多 1000 字'
      }
    )
    claimingId.value = row.id
    if (previewMode) {
      if (!PreviewStore.convertPreviewLead(row.id, value || ''))
        throw new Error('线索状态已变化，请刷新列表')
    } else {
      await LeadApi.convertLead(row.id, value || '', makeKey())
    }
    ElMessage.success('线索已转为客户，可在客户列表查看')
    await load()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '转化失败')
  } finally {
    claimingId.value = ''
  }
}
function sourceLabel(code?: string) {
  return sources.find((item) => item.value === code)?.label || code || '—'
}
function formatTime(value?: string) {
  return value ? parseCallPhoneDateTime(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
onMounted(load)
</script>

<style scoped>
.import-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.import-intro strong {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.import-intro p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.import-toolbar {
  display: flex;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  align-items: center;
  gap: 12px;
}

.import-filename {
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-counts {
  margin-left: auto;
}

.import-issue {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-color-danger);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  white-space: nowrap;
  clip-path: inset(50%);
}

.privacy-note {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.fill {
  width: 100%;
}

@media (width <= 760px) {
  .import-intro {
    align-items: flex-start;
    flex-direction: column;
  }

  .import-counts {
    margin-left: 0;
  }
}
</style>
