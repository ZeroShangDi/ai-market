<template>
  <div class="customer-stages-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="阶段配置会保存在当前浏览器；停用已有客户正在使用的阶段会被阻止。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div
          ><h1>客户阶段</h1
          ><p>维护客户生命周期阶段。阶段编码用于业务存储，名称和颜色可调整。</p></div
        >
        <el-button v-if="canManageStages" type="primary" @click="openCreate()">新增阶段</el-button>
      </header>
      <el-table v-loading="loading" :data="rows" row-key="stageCode">
        <el-table-column label="顺序" prop="sort" width="85" />
        <el-table-column label="阶段" min-width="180"
          ><template #default="{ row }"
            ><el-tag :color="row.color" effect="light">{{ row.name }}</el-tag
            ><small class="code">{{ row.stageCode }}</small></template
          ></el-table-column
        >
        <el-table-column label="客户数" prop="customerCount" width="110" />
        <el-table-column label="类型" width="130"
          ><template #default="{ row }">{{
            row.systemDefault ? '系统阶段' : '自定义阶段'
          }}</template></el-table-column
        >
        <el-table-column label="状态" width="110"
          ><template #default="{ row }"
            ><el-tag :type="row.enabled ? 'success' : 'info'" effect="light">{{
              row.enabled ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column v-if="canManageStages" label="操作" width="200" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="openEdit(row)">编辑</el-button
            ><el-button
              link
              :type="row.enabled ? 'danger' : 'success'"
              :disabled="row.enabled && (row.customerCount > 0 || enabledStageCount <= 1)"
              @click="toggle(row)"
              >{{ row.enabled ? '停用' : '启用' }}</el-button
            ></template
          ></el-table-column
        >
        <template #empty><el-empty :description="error || '暂无阶段配置'" /></template>
      </el-table>
      <p class="privacy-note"
        >已有客户仍使用某阶段时，系统会阻止停用；同时至少保留一个启用阶段，避免新客户无可选阶段。</p
      >
    </section>

    <section class="page-panel stage-history-panel">
      <header class="page-heading history-heading">
        <div
          ><h2>阶段变更记录</h2
          ><p>记录本人新增客户或修改客户阶段的操作，便于核对生命周期流转。</p></div
        >
        <div class="history-filters">
          <el-select
            v-model="historyStageCode"
            clearable
            placeholder="全部目标阶段"
            @change="searchHistory"
          >
            <el-option
              v-for="stage in rows"
              :key="stage.stageCode"
              :label="stage.name"
              :value="stage.stageCode"
            />
          </el-select>
          <el-button @click="loadHistory">刷新</el-button>
        </div>
      </header>
      <el-table v-loading="historyLoading" :data="historyRows" row-key="id">
        <el-table-column label="客户" prop="customerName" min-width="150" />
        <el-table-column label="原阶段" min-width="140"
          ><template #default="{ row }">{{ row.fromStageName }}</template></el-table-column
        >
        <el-table-column label="目标阶段" min-width="140"
          ><template #default="{ row }">{{ row.toStageName }}</template></el-table-column
        >
        <el-table-column label="操作" width="120"
          ><template #default="{ row }">{{
            row.source === 'customer_created' ? '新建客户' : '编辑客户'
          }}</template></el-table-column
        >
        <el-table-column label="变更时间" min-width="180"
          ><template #default="{ row }">{{ formatTime(row.changedAt) }}</template></el-table-column
        >
        <template #empty
          ><el-empty
            :description="
              historyError || '暂无阶段变更记录；在客户列表新建或调整阶段后，记录会显示在这里。'
            "
        /></template>
      </el-table>
      <footer class="table-footer">
        <span>共 {{ historyTotal }} 条变更</span>
        <el-pagination
          v-model:current-page="historyPageNo"
          v-model:page-size="historyPageSize"
          :total="historyTotal"
          :page-sizes="[10, 20, 50]"
          layout="prev, pager, next, sizes"
          @change="loadHistory"
        />
      </footer>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑阶段' : '新增阶段'"
      width="500px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="阶段编码" prop="stageCode"
          ><el-input
            v-model="form.stageCode"
            :disabled="!!form.id"
            maxlength="32"
            placeholder="例如：qualified"
          /><small class="hint"
            >小写英文开头，可含数字和下划线；创建后不可修改。</small
          ></el-form-item
        >
        <el-form-item label="阶段名称" prop="name"
          ><el-input v-model="form.name" maxlength="32" placeholder="例如：已确认需求"
        /></el-form-item>
        <el-form-item label="标识颜色" prop="color"
          ><div class="color-row"
            ><el-color-picker v-model="form.color" color-format="hex" /><el-input
              v-model="form.color"
              maxlength="7" /></div
        ></el-form-item>
        <el-form-item label="排序值" prop="sort"
          ><el-input-number v-model="form.sort" :min="1" :max="9999"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="save">保存</el-button></template
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import * as StageApi from '@/api/callphone/customer-stage'
import * as PreviewStore from '@/api/callphone/preview-store'
import { checkPermi } from '@/utils/permission'
import { useRoute } from 'vue-router'

defineOptions({ name: 'CallPhoneCustomerStages' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const canManageStages = previewMode || checkPermi(['callphone:customer:stage:save'])
const loading = ref(false),
  saving = ref(false),
  dialogVisible = ref(false),
  error = ref('')
const rows = ref<StageApi.CustomerStageVO[]>([])
const enabledStageCount = computed(() => rows.value.filter((row) => row.enabled).length)
const historyRows = ref<StageApi.CustomerStageHistoryVO[]>([])
const historyLoading = ref(false),
  historyError = ref(''),
  historyStageCode = ref('')
const historyPageNo = ref(1),
  historyPageSize = ref(10),
  historyTotal = ref(0)
const formRef = ref<FormInstance>()
const blankForm = () => ({
  id: undefined as string | undefined,
  stageCode: '',
  name: '',
  color: '#3B82F6',
  sort: 100,
  enabled: true,
  systemDefault: false,
  customerCount: 0
})
const form = reactive(blankForm())
const rules: FormRules = {
  stageCode: [
    { required: true, message: '请填写阶段编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]{1,31}$/,
      message: '使用小写英文开头，可含数字和下划线',
      trigger: 'blur'
    }
  ],
  name: [{ required: true, message: '请填写阶段名称', trigger: 'blur' }],
  color: [
    { required: true, message: '请选择阶段颜色', trigger: 'change' },
    { pattern: /^#[0-9a-fA-F]{6}$/, message: '请输入六位十六进制颜色', trigger: 'blur' }
  ]
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = previewMode ? PreviewStore.previewStages() : await StageApi.getCustomerStages()
  } catch (e: any) {
    error.value = e?.message || '阶段配置加载失败'
    rows.value = []
  } finally {
    loading.value = false
  }
}
async function loadHistory() {
  historyLoading.value = true
  historyError.value = ''
  try {
    const result = previewMode
      ? PreviewStore.previewCustomerStageHistory(
          historyPageNo.value,
          historyPageSize.value,
          historyStageCode.value || undefined
        )
      : await StageApi.getCustomerStageHistory({
          pageNo: historyPageNo.value,
          pageSize: historyPageSize.value,
          stageCode: historyStageCode.value || undefined
        })
    historyRows.value = result.list || []
    historyTotal.value = result.total || 0
  } catch (e: any) {
    historyRows.value = []
    historyTotal.value = 0
    historyError.value = e?.message || '阶段变更记录加载失败'
  } finally {
    historyLoading.value = false
  }
}
function searchHistory() {
  historyPageNo.value = 1
  loadHistory()
}
function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
function openCreate() {
  Object.assign(form, blankForm())
  dialogVisible.value = true
}
function openEdit(row: StageApi.CustomerStageVO) {
  Object.assign(form, { ...row })
  dialogVisible.value = true
}
async function save() {
  await formRef.value?.validate()
  saving.value = true
  try {
    if (previewMode) PreviewStore.savePreviewStage({ ...form })
    else {
      const result = await StageApi.saveCustomerStage({ ...form })
      if (!result) throw new Error('阶段编码重复或停用后仍有客户使用')
    }
    ElMessage.success('阶段配置已保存')
    dialogVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
async function toggle(row: StageApi.CustomerStageVO) {
  const enabled = !row.enabled
  if (!enabled && row.customerCount > 0) return
  try {
    if (enabled) await ElMessageBox.confirm(`确认启用“${row.name}”吗？`, '启用阶段')
    const payload = { ...row, enabled }
    if (previewMode) PreviewStore.savePreviewStage(payload)
    else {
      const result = await StageApi.saveCustomerStage(payload)
      if (!result) throw new Error('当前仍有客户使用该阶段，不能停用')
    }
    await load()
    ElMessage.success(enabled ? '阶段已启用' : '阶段已停用')
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '操作失败')
  }
}
onMounted(() => {
  load()
  loadHistory()
})
</script>

<style scoped>
.customer-stages-page {
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
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: var(--el-text-color-primary);
}

.page-heading p,
.privacy-note,
.hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.page-heading p {
  margin: 7px 0 0;
}

.privacy-note {
  margin-top: 18px;
}

.code {
  display: block;
  margin-top: 5px;
  font-family: monospace;
  color: var(--el-text-color-placeholder);
}

.hint {
  display: block;
  margin-top: 6px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-row :deep(.el-input) {
  width: 130px;
}

.stage-history-panel {
  margin-top: 16px;
}

.history-heading h2 {
  margin: 0;
  font-size: 18px;
  color: var(--el-text-color-primary);
}

.history-filters {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-filters :deep(.el-select) {
  width: 180px;
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  color: var(--el-text-color-secondary);
}

@media (width <= 760px) {
  .customer-stages-page {
    padding: 10px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .history-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }

  .history-filters {
    width: 100%;
  }

  .history-filters :deep(.el-select) {
    flex: 1;
  }
}
</style>
