<template>
  <div class="knowledge-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      type="warning"
      :closable="false"
      title="本地预览模式"
      description="预览文件只记录在浏览器中的演示数据，不会上传到服务端。正式环境支持 UTF-8 的 TXT/Markdown 文档，并存入当前部署方配置的文件存储。"
    />
    <div class="page-panel">
      <div class="page-heading">
        <div>
          <h1>知识库</h1>
          <p>整理可供 AI 功能检索的业务资料，并按团队限制可见范围。</p>
        </div>
        <el-button type="primary" @click="openCreate">新建知识库</el-button>
      </div>

      <div class="summary-cards">
        <div class="summary-card"
          ><span>知识库</span><strong>{{ total }}</strong></div
        >
        <div class="summary-card"
          ><span>已启用</span><strong>{{ enabledCount }}</strong></div
        >
        <div class="summary-card"
          ><span>文档数</span><strong>{{ documentTotal }}</strong></div
        >
        <div class="summary-card"
          ><span>已解析切片</span><strong>{{ chunkTotal }}</strong></div
        >
      </div>

      <el-form inline class="filter-bar" @submit.prevent="load">
        <el-form-item>
          <el-input
            v-model="filters.query"
            clearable
            placeholder="搜索知识库名称或说明"
            @keyup.enter="load"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="filters.status" clearable placeholder="全部状态" @change="load">
            <el-option label="已启用" value="enabled" />
            <el-option label="已停用" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="load">查询</el-button></el-form-item>
        <el-form-item><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="知识库" min-width="200">
          <template #default="{ row }">
            <div class="name-cell"
              ><strong>{{ row.name }}</strong
              ><small>{{ row.description || '暂无说明' }}</small></div
            >
          </template>
        </el-table-column>
        <el-table-column label="可见范围" min-width="140">
          <template #default="{ row }">
            <div>{{ row.visibility === 'workspace' ? '全工作区' : '指定团队' }}</div>
            <small v-if="row.visibility === 'teams'" class="muted">{{
              departmentNames(row.visibleDepartmentIds) || '未选择团队'
            }}</small>
          </template>
        </el-table-column>
        <el-table-column label="文档 / 切片" width="115">
          <template #default="{ row }">{{ row.documentCount }} / {{ row.chunkCount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="95">
          <template #default="{ row }"
            ><el-tag :type="row.status === 'enabled' ? 'success' : 'info'" effect="light">{{
              row.status === 'enabled' ? '已启用' : '已停用'
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="更新时间" min-width="145" prop="updateTime" />
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDocuments(row)">文档管理</el-button>
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button
              link
              :type="row.status === 'enabled' ? 'danger' : 'success'"
              @click="toggleStatus(row)"
              >{{ row.status === 'enabled' ? '停用' : '启用' }}</el-button
            >
          </template>
        </el-table-column>
        <template #empty><el-empty :description="loadError || '暂无知识库'" /></template>
      </el-table>

      <div class="table-footer"
        ><span>共 {{ total }} 个知识库</span></div
      >
      <p class="privacy-note"
        >文档仅保存在本部署方配置的文件与数据库中。后续 AI
        请求只在用户明确触发时，按授权范围检索必要片段；文档指令作为资料内容处理，不作为系统操作指令。</p
      >
    </div>

    <el-dialog
      v-model="formVisible"
      :title="form.id ? '编辑知识库' : '新建知识库'"
      width="560px"
      class="knowledge-dialog"
      append-to-body
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
        <el-form-item label="知识库名称" prop="name"
          ><el-input v-model="form.name" maxlength="80" show-word-limit
        /></el-form-item>
        <el-form-item label="用途说明"
          ><el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="300"
            show-word-limit
        /></el-form-item>
        <el-form-item label="可见范围" prop="visibility">
          <el-radio-group v-model="form.visibility"
            ><el-radio value="workspace">全工作区</el-radio
            ><el-radio value="teams">指定团队</el-radio></el-radio-group
          >
        </el-form-item>
        <el-form-item
          v-if="form.visibility === 'teams'"
          label="可见团队"
          prop="visibleDepartmentIds"
        >
          <el-select
            v-model="form.visibleDepartmentIds"
            multiple
            filterable
            class="fill"
            placeholder="选择可见部门"
          >
            <el-option
              v-for="dept in departmentOptions"
              :key="dept.id"
              :label="dept.name"
              :value="dept.id"
            />
          </el-select>
          <small class="hint">可见范围按部门 ID 保存，服务端校验部门有效性。</small>
        </el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="formVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="save">保存</el-button></template
      >
    </el-dialog>

    <el-drawer
      v-model="drawerVisible"
      title="知识库文档"
      size="760px"
      class="knowledge-drawer"
      append-to-body
    >
      <template #header
        ><div class="drawer-title"
          ><div
            ><strong>{{ activeBase?.name }}</strong
            ><small>{{ activeBase?.description }}</small></div
          ><el-tag :type="activeBase?.status === 'enabled' ? 'success' : 'info'">{{
            activeBase?.status === 'enabled' ? '已启用' : '已停用'
          }}</el-tag></div
        ></template
      >
      <div v-if="activeBase" class="document-workspace">
        <div class="upload-card">
          <div
            ><strong>添加资料文档</strong
            ><p>支持 UTF-8 TXT、Markdown，单个文件不超过 5 MB。上传后立即解析切片。</p></div
          >
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept=".txt,.md,text/plain,text/markdown"
            :disabled="activeBase.status !== 'enabled'"
            :on-change="uploadFile"
          >
            <el-button type="primary" :disabled="activeBase.status !== 'enabled'"
              >选择文件</el-button
            >
          </el-upload>
        </div>
        <el-alert
          v-if="activeBase.status !== 'enabled'"
          type="info"
          :closable="false"
          title="该知识库已停用，启用后才能添加文档。"
        />
        <el-table
          v-loading="documentsLoading"
          :data="documents"
          row-key="id"
          class="document-table"
        >
          <el-table-column label="文件名" min-width="190"
            ><template #default="{ row }"
              ><strong>{{ row.sourceName }}</strong
              ><small class="subline"
                >{{ formatSize(row.byteSize) }} · {{ row.checksum }}</small
              ></template
            ></el-table-column
          >
          <el-table-column label="解析状态" width="120"
            ><template #default="{ row }"
              ><el-tag :type="row.parseStatus === 'ready' ? 'success' : 'danger'" effect="light">{{
                row.parseStatus === 'ready' ? '已完成' : '解析失败'
              }}</el-tag
              ><small v-if="row.errorMessage" class="error-line">{{
                row.errorMessage
              }}</small></template
            ></el-table-column
          >
          <el-table-column label="切片数" width="90" prop="chunkCount" />
          <el-table-column label="上传时间" min-width="160" prop="createTime" />
          <el-table-column label="操作" width="110"
            ><template #default="{ row }"
              ><el-button link type="primary" :loading="retryingId === row.id" @click="retry(row)"
                >重新解析</el-button
              ></template
            ></el-table-column
          >
          <template #empty><el-empty description="这个知识库还没有文档" /></template>
        </el-table>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'CallPhoneAiKnowledge' })
import { computed, onMounted, reactive, ref } from 'vue'
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormRules,
  type UploadFile
} from 'element-plus'
import { useRoute } from 'vue-router'
import * as KnowledgeApi from '@/api/callphone/knowledge'
import * as KnowledgePreview from '@/api/callphone/knowledge/preview'
import { getSimpleDeptList, type DeptVO } from '@/api/system/dept'

const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
const loading = ref(false)
const saving = ref(false)
const documentsLoading = ref(false)
const loadError = ref('')
const rows = ref<KnowledgeApi.KnowledgeBaseVO[]>([])
const documents = ref<KnowledgeApi.KnowledgeDocumentVO[]>([])
const total = ref(0)
const filters = reactive({ query: '', status: '' })
const formVisible = ref(false)
const drawerVisible = ref(false)
const activeBase = ref<KnowledgeApi.KnowledgeBaseVO>()
const formRef = ref<FormInstance>()
const retryingId = ref('')
const departmentOptions = ref<DeptVO[]>([])
const emptyForm = (): KnowledgeApi.KnowledgeBaseSave => ({
  name: '',
  description: '',
  visibility: 'workspace',
  visibleDepartmentIds: []
})
const form = reactive<KnowledgeApi.KnowledgeBaseSave>(emptyForm())
const rules: FormRules = {
  name: [{ required: true, message: '请填写知识库名称', trigger: 'blur' }],
  visibility: [{ required: true, message: '请选择可见范围', trigger: 'change' }],
  visibleDepartmentIds: [
    {
      validator: (_rule, value, callback) =>
        form.visibility !== 'teams' || value?.length
          ? callback()
          : callback(new Error('请至少选择一个部门')),
      trigger: 'change'
    }
  ]
}
const enabledCount = computed(() => rows.value.filter((row) => row.status === 'enabled').length)
const documentTotal = computed(() => rows.value.reduce((sum, row) => sum + row.documentCount, 0))
const chunkTotal = computed(() => rows.value.reduce((sum, row) => sum + row.chunkCount, 0))

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = previewMode.value
      ? KnowledgePreview.getPreviewKnowledgeBasePage({ pageNo: 1, pageSize: 100, ...filters })
      : await KnowledgeApi.getKnowledgeBasePage({ pageNo: 1, pageSize: 100, ...filters })
    rows.value = result.list
    total.value = result.total
  } catch (error: any) {
    loadError.value = error?.message || '知识库加载失败'
  } finally {
    loading.value = false
  }
}
function reset() {
  filters.query = ''
  filters.status = ''
  void load()
}
function openCreate() {
  Object.assign(form, emptyForm())
  formVisible.value = true
}
function openEdit(row: KnowledgeApi.KnowledgeBaseVO) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    visibleDepartmentIds: [...row.visibleDepartmentIds]
  })
  formVisible.value = true
}
async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  saving.value = true
  try {
    const result = previewMode.value
      ? KnowledgePreview.savePreviewKnowledgeBase({ ...form })
      : await KnowledgeApi.saveKnowledgeBase({ ...form })
    if (result === false) throw new Error('知识库已变化，请刷新后重试')
    ElMessage.success('知识库已保存')
    formVisible.value = false
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
async function toggleStatus(row: KnowledgeApi.KnowledgeBaseVO) {
  const status: KnowledgeApi.KnowledgeStatus = row.status === 'enabled' ? 'disabled' : 'enabled'
  try {
    await ElMessageBox.confirm(
      `${status === 'enabled' ? '启用' : '停用'}“${row.name}”？停用后 AI 检索将跳过该知识库。`,
      '确认状态变更'
    )
    const result = previewMode.value
      ? KnowledgePreview.setPreviewKnowledgeBaseStatus(row.id, status)
      : await KnowledgeApi.setKnowledgeBaseStatus(row.id, status)
    if (result === false) throw new Error('知识库已变化，请刷新后重试')
    ElMessage.success(status === 'enabled' ? '知识库已启用' : '知识库已停用')
    await load()
    if (activeBase.value?.id === row.id)
      activeBase.value = rows.value.find((item) => item.id === row.id)
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '状态更新失败')
  }
}
async function openDocuments(row: KnowledgeApi.KnowledgeBaseVO) {
  activeBase.value = row
  drawerVisible.value = true
  documentsLoading.value = true
  try {
    documents.value = previewMode.value
      ? KnowledgePreview.getPreviewKnowledgeDocuments(row.id)
      : await KnowledgeApi.getKnowledgeDocuments(row.id)
  } catch (error: any) {
    documents.value = []
    ElMessage.error(error?.message || '文档列表加载失败')
  } finally {
    documentsLoading.value = false
  }
}
async function uploadFile(file: UploadFile) {
  const rawFile = file.raw
  if (!rawFile || !activeBase.value) return
  const allowedExtension = /\.(txt|md)$/i.test(rawFile.name)
  if (!allowedExtension || rawFile.size > 5 * 1024 * 1024) {
    ElMessage.error('请选择不超过 5 MB 的 TXT 或 Markdown 文件')
    return
  }
  documentsLoading.value = true
  try {
    if (previewMode.value)
      KnowledgePreview.uploadPreviewKnowledgeDocument(activeBase.value.id, rawFile)
    else await KnowledgeApi.uploadKnowledgeDocument(activeBase.value.id, rawFile)
    ElMessage.success('文档已上传并完成切片')
    await openDocuments(activeBase.value)
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '文档上传失败')
  } finally {
    documentsLoading.value = false
  }
}
async function retry(row: KnowledgeApi.KnowledgeDocumentVO) {
  retryingId.value = row.id
  try {
    const result = previewMode.value
      ? KnowledgePreview.retryPreviewKnowledgeDocument(row.id)
      : await KnowledgeApi.retryKnowledgeDocument(row.id)
    if (result === false) throw new Error('仅解析失败的文档可重试')
    ElMessage.success('文档已重新解析并更新切片')
    if (activeBase.value) await openDocuments(activeBase.value)
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '重试失败')
  } finally {
    retryingId.value = ''
  }
}
function formatSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`
}
function departmentNames(ids: number[]) {
  return ids
    .map((id) => departmentOptions.value.find((dept) => dept.id === id)?.name)
    .filter(Boolean)
    .join('、')
}
onMounted(async () => {
  if (previewMode.value) {
    departmentOptions.value = [
      { id: 101, name: '销售一组' } as DeptVO,
      { id: 102, name: '销售二组' } as DeptVO
    ]
  } else {
    try {
      departmentOptions.value = await getSimpleDeptList()
    } catch {
      departmentOptions.value = []
    }
  }
  await load()
})
</script>

<style scoped lang="scss">
.knowledge-page {
  --el-bg-color: #fff;
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;
  --el-fill-color-blank: #fff;
  --el-fill-color-light: #f5f7fa;

  padding: 20px;
  color: #293347;
  color-scheme: light;
}

.preview-banner {
  margin-bottom: 14px;
}

.page-panel {
  padding: 22px;
  background: #fff;
  border: 1px solid #e5e9f0;
  border-radius: 10px;
}

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: #253149;
}

.page-heading p,
.privacy-note {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7a8598;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(110px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary-card {
  padding: 14px 16px;
  font-size: 12px;
  color: #8490a1;
  border: 1px solid #e8ecf3;
  border-radius: 8px;
}

.summary-card strong {
  display: block;
  margin-top: 7px;
  font-size: 23px;
  color: #253149;
}

.filter-bar {
  margin-bottom: 8px;
}

.filter-bar .el-input {
  width: 260px;
}

.filter-bar .el-select {
  width: 170px;
}

.name-cell strong,
.name-cell small {
  display: block;
}

.name-cell small,
.muted,
.subline {
  margin-top: 5px;
  font-size: 12px;
  color: #8994a6;
}

.table-footer {
  padding-top: 16px;
  font-size: 13px;
  color: #7a8598;
}

.privacy-note {
  margin-top: 18px;
  line-height: 1.7;
}

.fill {
  width: 100%;
}

.hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: #8994a6;
}

.drawer-title {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding-right: 18px;
}

.drawer-title strong,
.drawer-title small {
  display: block;
}

.drawer-title strong {
  font-size: 17px;
  color: #253149;
}

.drawer-title small {
  margin-top: 5px;
  font-size: 12px;
  color: #8994a6;
}

.upload-card {
  display: flex;
  padding: 18px;
  margin-bottom: 18px;
  background: #f7f9fd;
  border: 1px solid #e4eaf5;
  border-radius: 8px;
  align-items: center;
  justify-content: space-between;
}

.upload-card strong {
  color: #29364c;
}

.upload-card p {
  margin: 6px 16px 0 0;
  font-size: 12px;
  color: #8490a1;
}

.document-table {
  margin-top: 14px;
}

.subline {
  display: block;
}

.error-line {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #d45656;
}

.knowledge-page :deep(.el-drawer.knowledge-drawer) {
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;

  color: #303133;
  background: #fff;
  color-scheme: light;
}

.knowledge-page :deep(.el-dialog.knowledge-dialog) {
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;

  color: #303133;
  background: #fff;
  color-scheme: light;
}

@media (width <= 760px) {
  .knowledge-page {
    padding: 10px;
  }

  .page-panel {
    padding: 15px;
  }

  .summary-cards {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }

  .page-heading {
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
