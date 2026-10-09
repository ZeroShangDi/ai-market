<template>
  <div class="scripts-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="模板和版本只保存在此浏览器。发布版本不可覆盖；复制话术需要人工点击，不会自动发送或启动外呼。"
      type="info"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div
          ><h1>话术助手</h1
          ><p
            >维护可复用的沟通话术。变量仅用于本地预览和用户手动复制，发布后通过新版本修改。</p
          ></div
        >
        <el-button v-if="canEdit" type="primary" @click="openCreate"
          ><Icon icon="ep:plus" />新建话术</el-button
        >
      </header>
      <div class="summary">
        <article
          ><span>本页模板数</span><strong>{{ summary.templates }}</strong></article
        >
        <article
          ><span>本页已发布</span><strong>{{ summary.published }}</strong></article
        >
        <article
          ><span>本页草稿</span><strong>{{ summary.drafts }}</strong></article
        >
        <article
          ><span>本页使用次数</span><strong>{{ summary.usage }}</strong></article
        >
      </div>
      <div class="filter-bar">
        <el-input
          v-model="filters.query"
          clearable
          placeholder="搜索话术名、标签"
          class="search"
          @keyup.enter="search"
          ><template #prefix><Icon icon="ep:search" /></template
        ></el-input>
        <el-select v-model="filters.stageCode" clearable placeholder="全部客户阶段" @change="search"
          ><el-option
            v-for="stage in stages"
            :key="stage.stageCode"
            :label="stage.name"
            :value="stage.stageCode"
        /></el-select>
        <el-select v-model="filters.channel" clearable placeholder="全部渠道" @change="search"
          ><el-option
            v-for="channel in channels"
            :key="channel.value"
            :label="channel.label"
            :value="channel.value"
        /></el-select>
        <el-select v-model="filters.status" clearable placeholder="全部版本状态" @change="search"
          ><el-option
            v-for="status in statuses"
            :key="status.value"
            :label="status.label"
            :value="status.value"
        /></el-select>
        <el-button @click="resetFilters">重置</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="话术名称" min-width="230"
          ><template #default="{ row }"
            ><div class="script-name"
              ><span class="script-icon"><Icon icon="ep:chat-line-square" /></span
              ><div
                ><strong>{{ row.name }}</strong
                ><small>{{ row.templateKey }} · v{{ row.version }}</small></div
              ></div
            ></template
          ></el-table-column
        >
        <el-table-column label="客户阶段" min-width="120"
          ><template #default="{ row }">{{ stageName(row.stageCode) }}</template></el-table-column
        >
        <el-table-column label="沟通渠道" width="120"
          ><template #default="{ row }">{{ channelName(row.channel) }}</template></el-table-column
        >
        <el-table-column label="标签" min-width="180"
          ><template #default="{ row }"
            ><el-tag v-for="tag in row.tags" :key="tag" class="tag-chip" effect="plain">{{
              tag
            }}</el-tag
            ><span v-if="!row.tags?.length" class="muted">—</span></template
          ></el-table-column
        >
        <el-table-column label="状态" width="120"
          ><template #default="{ row }"
            ><el-tag :type="statusType(row.status)" effect="light">{{
              statusName(row.status)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="使用 / 复制" width="120"
          ><template #default="{ row }"
            >{{ row.usageCount }} / {{ row.copyCount }}</template
          ></el-table-column
        >
        <el-table-column label="更新 / 发布" min-width="170"
          ><template #default="{ row }">{{
            row.publishedAt || row.createTime
          }}</template></el-table-column
        >
        <el-table-column label="操作" fixed="right" width="240"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="openDetail(row)">预览</el-button
            ><el-button
              v-if="row.status === 'draft' && canEdit"
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            ><el-button
              v-if="row.status === 'draft' && canPublish"
              link
              type="success"
              @click="publish(row)"
              >发布</el-button
            ><el-button
              v-if="(row.status === 'published' || row.status === 'superseded') && canEdit"
              link
              type="primary"
              @click="newVersion(row)"
              >创建新版本</el-button
            ><el-button
              v-if="row.status === 'published' && canUse"
              link
              type="success"
              @click="openDetail(row)"
              >填写并复制</el-button
            ></template
          ></el-table-column
        >
        <template #empty><el-empty :description="loadError || '暂无话术模板'" /></template>
      </el-table>
      <div class="table-footer"
        ><span>共 {{ total }} 个版本</span
        ><el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @change="load"
      /></div>
      <div class="safety-note"
        ><Icon
          icon="ep:lock"
        />发布版本保留历史，不在记录中保存客户填充后的话术。复制操作由使用者主动触发，不会自动拨号、发送消息或更新客户资料。</div
      >
    </section>

    <el-dialog
      v-model="editorVisible"
      :title="form.id ? '编辑话术草稿' : '新建话术草稿'"
      width="760px"
      destroy-on-close
      class="script-editor-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="话术名称" prop="name"
            ><el-input v-model="form.name" maxlength="80" placeholder="例如：首次需求确认"
          /></el-form-item>
          <el-form-item label="客户阶段"
            ><el-select v-model="form.stageCode" clearable placeholder="不限阶段" class="fill"
              ><el-option
                v-for="stage in stages"
                :key="stage.stageCode"
                :label="stage.name"
                :value="stage.stageCode" /></el-select
          ></el-form-item>
          <el-form-item label="沟通渠道" prop="channel"
            ><el-select v-model="form.channel" class="fill"
              ><el-option
                v-for="channel in channels"
                :key="channel.value"
                :label="channel.label"
                :value="channel.value" /></el-select
          ></el-form-item>
          <el-form-item label="标签"
            ><el-input v-model="tagsText" maxlength="200" placeholder="多个标签以逗号分隔"
          /></el-form-item>
        </div>
        <el-form-item label="话术正文" prop="content"
          ><el-input
            v-model="form.content"
            type="textarea"
            :rows="8"
            maxlength="3000"
            show-word-limit
            placeholder="使用 {{variable}} 插入变量，例如：您好 {{ customerName }}"
        /></el-form-item>
        <el-form-item label="允许使用的变量" prop="variables"
          ><el-checkbox-group v-model="form.variables" class="variable-grid"
            ><el-checkbox v-for="item in variableOptions" :key="item.key" :value="item.key"
              >{{ item.label }} <code>{{ formatVariableToken(item.key) }}</code></el-checkbox
            ></el-checkbox-group
          ><small class="hint"
            >正文中出现的变量必须在此白名单内，未知变量不能保存。</small
          ></el-form-item
        >
      </el-form>
      <template #footer
        ><el-button @click="editorVisible = false">取消</el-button
        ><el-button v-if="canEdit" type="primary" :loading="saving" @click="saveDraft"
          >保存草稿</el-button
        ></template
      >
    </el-dialog>

    <el-drawer v-model="detailVisible" title="话术预览" size="560px" class="script-preview-drawer">
      <template v-if="current">
        <div class="preview-heading"
          ><div
            ><h2>{{ current.name }}</h2
            ><span>{{ current.templateKey }} · v{{ current.version }}</span></div
          ><el-tag :type="statusType(current.status)" effect="light">{{
            statusName(current.status)
          }}</el-tag></div
        >
        <el-descriptions :column="2" border class="script-meta"
          ><el-descriptions-item label="客户阶段">{{
            stageName(current.stageCode)
          }}</el-descriptions-item
          ><el-descriptions-item label="沟通渠道">{{
            channelName(current.channel)
          }}</el-descriptions-item
          ><el-descriptions-item label="创建人">{{
            current.creatorName || current.createdBy
          }}</el-descriptions-item
          ><el-descriptions-item label="使用 / 复制"
            >{{ current.usageCount }} / {{ current.copyCount }}</el-descriptions-item
          ><el-descriptions-item label="变量" :span="2"
            ><el-tag
              v-for="variable in current.variables"
              :key="variable"
              class="tag-chip"
              effect="plain"
              >{{ variableLabel(variable) }}</el-tag
            ></el-descriptions-item
          ></el-descriptions
        >
        <section class="render-panel"
          ><div class="render-title"
            ><strong>填充预览</strong
            ><span>{{ previewMode ? '演示值仅在本机显示' : '空变量会显示提醒' }}</span></div
          ><p>{{ renderedText }}</p></section
        >
        <section v-if="usedVariables.length" class="variable-values">
          <div class="render-title">
            <strong>填写本次话术变量</strong>
            <span>只在当前页面内使用，不会保存到模板或上传</span>
          </div>
          <el-form label-position="top">
            <el-form-item
              v-for="variable in usedVariables"
              :key="variable"
              :label="variableLabel(variable)"
            >
              <el-input
                v-model="variableValues[variable]"
                :placeholder="`填写${variableLabel(variable)}`"
                maxlength="200"
              />
            </el-form-item>
          </el-form>
        </section>
        <el-alert
          v-if="current.status !== 'published'"
          title="此版本尚未发布"
          description="只有已发布版本可以复制并记录使用次数。"
          type="info"
          :closable="false"
        />
        <div class="drawer-actions"
          ><el-button v-if="current.status === 'draft' && canEdit" @click="openEdit(current)"
            >编辑草稿</el-button
          ><el-button
            v-if="current.status === 'published' && canUse"
            type="primary"
            @click="copyScript(current)"
            ><Icon icon="ep:copy-document" />复制填充话术</el-button
          ></div
        >
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import * as ScriptApi from '@/api/callphone/ai-script'
import * as ScriptPreview from '@/api/callphone/ai-script/preview'
import * as StageApi from '@/api/callphone/customer-stage'
import { checkPermi } from '@/utils/permission'

defineOptions({ name: 'CallPhoneAiScripts' })
const route = useRoute(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const canEdit = computed(() => previewMode || checkPermi(['callphone:ai:script:edit']))
const canPublish = computed(() => previewMode || checkPermi(['callphone:ai:script:publish']))
const canUse = computed(() => previewMode || checkPermi(['callphone:ai:script:use']))
const channels = [
  { value: 'phone', label: '电话' },
  { value: 'wechat', label: '微信' },
  { value: 'in_person', label: '面谈' }
]
const statuses: Array<{ value: ScriptApi.ScriptStatus; label: string }> = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'superseded', label: '已被新版本替代' },
  { value: 'archived', label: '已归档' }
]
const variableOptions = [
  { key: 'customerName', label: '客户称呼' },
  { key: 'ownerName', label: '顾问姓名' },
  { key: 'companyName', label: '客户公司' },
  { key: 'need', label: '关注需求' },
  { key: 'product', label: '关注产品' },
  { key: 'objection', label: '客户顾虑' }
]
const sampleValues: Record<string, string> = {
  customerName: '王女士',
  ownerName: '陈晓',
  companyName: '示例科技',
  need: '团队协作管理',
  product: '智能外呼方案',
  objection: '部署周期'
}
const rows = ref<ScriptApi.AiScriptVO[]>([]),
  stages = ref<StageApi.CustomerStageVO[]>([]),
  loading = ref(false),
  saving = ref(false),
  loadError = ref('')
const pageNo = ref(1),
  pageSize = ref(10),
  total = ref(0),
  editorVisible = ref(false),
  detailVisible = ref(false)
const current = ref<ScriptApi.AiScriptVO | null>(null),
  variableValues = ref<Record<string, string>>({}),
  formRef = ref<FormInstance>(),
  tagsText = ref('')
const filters = reactive({
  query: '',
  stageCode: '',
  channel: '',
  status: '' as ScriptApi.ScriptStatus | ''
})
const blankForm = (): ScriptApi.AiScriptDraft => ({
  name: '',
  stageCode: undefined,
  channel: 'phone',
  tags: [],
  content: '',
  variables: []
})
const form = reactive<ScriptApi.AiScriptDraft>(blankForm())
const formRules: FormRules = {
  name: [{ required: true, message: '请填写话术名称', trigger: 'blur' }],
  channel: [{ required: true, message: '请选择沟通渠道', trigger: 'change' }],
  content: [
    { required: true, message: '请填写话术正文', trigger: 'blur' },
    { min: 8, message: '话术正文至少 8 个字', trigger: 'blur' }
  ],
  variables: [
    {
      validator: (_r, value, done) => {
        const found = [
          ...String(form.content).matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)
        ].map((match) => match[1])
        const unknown = [...new Set(found)].filter((item) => !(value as string[]).includes(item))
        unknown.length ? done(new Error(`变量未加入白名单：${unknown.join('、')}`)) : done()
      },
      trigger: 'change'
    }
  ]
}
const summary = computed(() => {
  const visible = rows.value
  return {
    templates: new Set(visible.map((row) => row.templateKey)).size,
    published: visible.filter((row) => row.status === 'published').length,
    drafts: visible.filter((row) => row.status === 'draft').length,
    usage: visible.reduce((sum, row) => sum + row.usageCount, 0)
  }
})
const usedVariables = computed(() => {
  const content = String(current.value?.content || '')
  const used = new Set(
    [...content.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)].map((match) => match[1])
  )
  return (current.value?.variables || []).filter((key) => used.has(key))
})
const renderedText = computed(() =>
  String(current.value?.content || '').replace(
    /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,
    (_match, key) => variableValues.value[key]?.trim() || `〔${variableLabel(key)}〕`
  )
)

function params(): ScriptApi.AiScriptPageParams {
  return {
    pageNo: pageNo.value,
    pageSize: pageSize.value,
    query: filters.query || undefined,
    stageCode: filters.stageCode || undefined,
    channel: filters.channel || undefined,
    status: filters.status || undefined
  }
}
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = previewMode
      ? ScriptPreview.getPreviewAiScriptPage(params())
      : await ScriptApi.getAiScriptPage(params())
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error: any) {
    rows.value = []
    total.value = 0
    loadError.value = error?.message || '话术列表加载失败'
  } finally {
    loading.value = false
  }
}
function search() {
  pageNo.value = 1
  void load()
}
function resetFilters() {
  Object.assign(filters, { query: '', stageCode: '', channel: '', status: '' })
  search()
}
function openCreate() {
  Object.assign(form, blankForm())
  form.id = undefined
  tagsText.value = ''
  editorVisible.value = true
}
async function openEdit(row: ScriptApi.AiScriptVO) {
  if (row.status !== 'draft') return
  const detail = previewMode
    ? ScriptPreview.getPreviewAiScript(row.id)
    : await ScriptApi.getAiScript(row.id)
  if (!detail) return ElMessage.warning('草稿不存在')
  Object.assign(form, {
    id: detail.id,
    name: detail.name,
    stageCode: detail.stageCode,
    channel: detail.channel,
    tags: [...detail.tags],
    content: detail.content || '',
    variables: [...detail.variables]
  })
  tagsText.value = detail.tags.join('，')
  detailVisible.value = false
  editorVisible.value = true
}
async function saveDraft() {
  await formRef.value?.validate()
  form.tags = tagsText.value
    .split(/[，,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12)
  saving.value = true
  try {
    const result = previewMode
      ? ScriptPreview.savePreviewAiScriptDraft({
          ...form,
          tags: [...form.tags],
          variables: [...form.variables]
        })
      : await ScriptApi.saveAiScriptDraft({
          ...form,
          tags: [...form.tags],
          variables: [...form.variables]
        })
    if (result === false) throw new Error('仅草稿可以编辑，请新建版本后再修改')
    ElMessage.success('草稿已保存')
    editorVisible.value = false
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
async function publish(row: ScriptApi.AiScriptVO) {
  try {
    await ElMessageBox.confirm(
      `发布“${row.name} v${row.version}”？当前已发布版本会保留为历史版本。`,
      '发布话术'
    )
    const result = previewMode
      ? ScriptPreview.publishPreviewAiScript(row.id)
      : await ScriptApi.publishAiScript(row.id)
    if (result === false) throw new Error('此版本已变化，请刷新后重试')
    ElMessage.success('新版本已发布')
    await load()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '发布失败')
  }
}
async function newVersion(row: ScriptApi.AiScriptVO) {
  try {
    const draftId = previewMode
      ? ScriptPreview.createPreviewAiScriptVersion(row.id)?.id
      : await ScriptApi.createAiScriptVersion(row.id)
    if (!draftId) throw new Error('当前版本不可复制为草稿')
    ElMessage.success('已创建新草稿版本')
    filters.status = ''
    pageNo.value = 1
    await load()
    const created = rows.value.find((item) => item.id === draftId)
    if (created) await openEdit(created)
  } catch (error: any) {
    ElMessage.error(error?.message || '创建版本失败')
  }
}
async function openDetail(row: ScriptApi.AiScriptVO) {
  try {
    current.value = previewMode
      ? ScriptPreview.getPreviewAiScript(row.id)
      : await ScriptApi.getAiScript(row.id)
    if (!current.value) return ElMessage.warning('话术版本不存在')
    variableValues.value = Object.fromEntries(
      current.value.variables.map((key) => [key, previewMode ? sampleValues[key] || '' : ''])
    )
    detailVisible.value = true
  } catch (error: any) {
    ElMessage.error(error?.message || '话术详情加载失败')
  }
}
async function copyScript(row: ScriptApi.AiScriptVO) {
  if (row.status !== 'published') return
  let detail: ScriptApi.AiScriptVO | null
  try {
    detail = previewMode
      ? ScriptPreview.getPreviewAiScript(row.id)
      : await ScriptApi.getAiScript(row.id)
  } catch (error: any) {
    ElMessage.error(error?.message || '话术内容加载失败，无法复制')
    return
  }
  if (!detail?.content) return ElMessage.warning('话术内容不可用')
  const missing = usedVariables.value.filter((key) => !variableValues.value[key]?.trim())
  if (missing.length) {
    ElMessage.warning(`请先填写：${missing.map(variableLabel).join('、')}`)
    return
  }
  const values = { ...variableValues.value }
  const result = detail.content.replace(
    /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,
    (_match, key) => values[key]?.trim() || `〔${variableLabel(key)}〕`
  )
  try {
    await navigator.clipboard.writeText(result)
  } catch (error: any) {
    return ElMessage.error(error?.message || '复制失败，请检查浏览器剪贴板权限')
  }
  try {
    if (previewMode) ScriptPreview.recordPreviewAiScriptUsage(row.id, 'copy')
    else {
      const recorded = await ScriptApi.recordAiScriptUsage(row.id, 'copy')
      if (recorded === false) {
        ElMessage.warning('话术已复制；版本状态已变化，本次使用未计数')
        await load()
        return
      }
    }
  } catch {
    ElMessage.warning('话术已复制，但使用次数未记录。请检查话术使用权限或稍后重试。')
    await load()
    return
  }
  if (current.value?.id === row.id) {
    current.value.copyCount += 1
    current.value.usageCount += 1
  }
  ElMessage.success('已复制填充话术；系统未发送消息或发起通话')
  await load()
}
function stageName(code?: string) {
  return stages.value.find((item) => item.stageCode === code)?.name || (code ? code : '不限阶段')
}
function channelName(value: string) {
  return channels.find((item) => item.value === value)?.label || value
}
function statusName(value: string) {
  return statuses.find((item) => item.value === value)?.label || value
}
function statusType(value: string): 'success' | 'warning' | 'danger' | 'info' {
  return (
    (
      { published: 'success', draft: 'warning', superseded: 'info', archived: 'info' } as Record<
        string,
        'success' | 'warning' | 'danger' | 'info'
      >
    )[value] || 'info'
  )
}
function variableLabel(key: string) {
  return variableOptions.find((item) => item.key === key)?.label || key
}
function formatVariableToken(key: string) {
  return `{{${key}}}`
}
async function loadStages() {
  try {
    stages.value = previewMode
      ? [
          {
            id: '1',
            stageCode: 'new',
            name: '新客户',
            color: '#4473dc',
            sort: 1,
            enabled: true,
            systemDefault: true,
            customerCount: 23
          },
          {
            id: '2',
            stageCode: 'contacted',
            name: '已联系',
            color: '#8b65d8',
            sort: 2,
            enabled: true,
            systemDefault: true,
            customerCount: 18
          },
          {
            id: '3',
            stageCode: 'qualified',
            name: '意向客户',
            color: '#1b9874',
            sort: 3,
            enabled: true,
            systemDefault: true,
            customerCount: 7
          }
        ]
      : await StageApi.getCustomerStageOptions()
  } catch {
    stages.value = []
  }
}
onMounted(() => {
  void load()
  void loadStages()
})
</script>

<style scoped>
.scripts-page {
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
  max-width: 1450px;
  margin: 0 auto 14px;
}

.page-panel {
  max-width: 1450px;
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
  margin-bottom: 17px;
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

.summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary article {
  padding: 12px 16px;
  border: 1px solid #e8ecf3;
  border-radius: 8px;
}

.summary span {
  display: block;
  font-size: 12px;
  color: #8490a1;
}

.summary strong {
  display: block;
  margin-top: 6px;
  font-size: 22px;
  color: #253149;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 14px;
}

.filter-bar .search {
  width: 250px;
}

.filter-bar .el-select {
  width: 155px;
}

.script-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.script-name strong,
.script-name small {
  display: block;
}

.script-name strong {
  color: #29364c;
}

.script-name small {
  margin-top: 4px;
  font-size: 11px;
  color: #929cad;
}

.script-icon {
  display: grid;
  width: 34px;
  height: 34px;
  color: #355bd3;
  background: #eef3ff;
  border-radius: 8px;
  flex: none;
  place-items: center;
}

.tag-chip {
  margin: 2px 4px 2px 0;
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

.safety-note {
  display: flex;
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.6;
  color: #7a8598;
  gap: 7px;
  align-items: flex-start;
}

.safety-note :deep(svg) {
  flex: none;
  margin-top: 2px;
  color: #5271c3;
}

.fill {
  width: 100%;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.variable-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.variable-grid code {
  margin-left: 4px;
  font-size: 11px;
  color: #8190a2;
}

.hint {
  display: block;
  margin-top: 7px;
  font-size: 12px;
  color: #8490a1;
}

.preview-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 17px;
}

.preview-heading h2 {
  margin: 0;
  font-size: 19px;
  color: #253149;
}

.preview-heading span {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: #8a95a7;
}

.script-meta {
  margin-bottom: 18px;
}

.render-panel {
  padding: 16px;
  margin: 17px 0;
  background: #f7f9fd;
  border: 1px solid #e4eaf5;
  border-radius: 8px;
}

.render-title {
  display: flex;
  margin-bottom: 10px;
  font-size: 13px;
  color: #36445b;
  justify-content: space-between;
  gap: 10px;
}

.render-title span {
  font-size: 11px;
  color: #929cad;
}

.render-panel p {
  font-size: 14px;
  line-height: 1.9;
  color: #35435a;
  white-space: pre-wrap;
}

.variable-values {
  padding: 16px;
  margin: 17px 0;
  background: #fff;
  border: 1px solid #e4eaf5;
  border-radius: 8px;
}

.variable-values :deep(.el-form-item) {
  margin-bottom: 12px;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 17px;
}

.scripts-page :deep(.el-table),
.scripts-page :deep(.el-table tr),
.scripts-page :deep(.el-table th.el-table__cell) {
  color: #303133;
  background: #fff;
}

.scripts-page :deep(.el-table tr:hover > td.el-table__cell) {
  background: #f5f7fa;
}

:global(.el-dialog.script-editor-dialog) {
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;

  color: #303133;
  background: #fff;
  color-scheme: light;
}

:global(.el-drawer.script-preview-drawer) {
  --el-drawer-bg-color: #fff;
  --el-drawer-text-color: #293347;

  color: #293347;
  background: #fff;
  color-scheme: light;
}

:global(.el-drawer.script-preview-drawer .el-drawer__header) {
  color: #253149;
}

@media (width <= 920px) {
  .summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-bar .search {
    width: 100%;
  }
}

@media (width <= 640px) {
  .scripts-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .table-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .variable-grid {
    grid-template-columns: 1fr;
  }
}
</style>
