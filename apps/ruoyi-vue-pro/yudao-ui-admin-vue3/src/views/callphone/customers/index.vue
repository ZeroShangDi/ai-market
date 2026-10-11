<template>
  <div class="callphone-customers-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="客户与跟进样例保存在当前浏览器。可用“安排跟进”把客户带入跟进事项页；此数据不会发送到后端。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div>
          <h1>客户列表</h1>
          <p>管理本人负责的客户资料。姓名与完整号码加密保存，页面仅展示脱敏号码。</p>
        </div>
        <div class="heading-actions">
          <el-button v-if="canImport" :disabled="stageOptions.length === 0" @click="openImport"
            >导入 CSV</el-button
          >
          <el-button
            v-if="canSave"
            type="primary"
            :disabled="stageOptions.length === 0"
            @click="openCreate"
            >新建客户</el-button
          >
        </div>
      </header>
      <el-alert
        v-if="stageOptionsError || stageOptions.length === 0"
        class="stage-options-alert"
        title="暂时无法新增客户"
        :description="
          stageOptionsError ||
          '当前没有启用的客户阶段。请先到客户阶段页面启用一个阶段，再新增或导入客户。'
        "
        type="warning"
        :closable="false"
      />

      <el-form :inline="true" :model="query" class="filter-bar" @submit.prevent="search">
        <el-form-item label="号码后四位"
          ><el-input
            v-model="query.query"
            clearable
            maxlength="4"
            placeholder="输入号码后四位"
            @keyup.enter="search"
        /></el-form-item>
        <el-form-item label="客户阶段">
          <el-select v-model="query.stage" clearable placeholder="全部阶段" @change="search">
            <el-option
              v-for="stage in stageOptions"
              :key="stage.stageCode"
              :label="stage.name"
              :value="stage.stageCode"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          ><el-button type="primary" @click="search">筛选</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>

      <div v-if="selectedRows.length" class="batch-toolbar">
        <span
          >已选择 <strong>{{ selectedRows.length }}</strong> 位客户</span
        >
        <el-button v-if="previewMode" @click="openBatchAssign">批量分配</el-button>
        <el-button v-else v-hasPermi="['callphone:customer:assign']" @click="openBatchAssign"
          >批量分配</el-button
        >
        <el-button v-if="previewMode" @click="openBatchTags">批量维护标签</el-button>
        <el-button v-else v-hasPermi="['callphone:customer:tags']" @click="openBatchTags"
          >批量维护标签</el-button
        >
        <el-button link @click="clearSelection">取消选择</el-button>
      </div>

      <el-table
        ref="customerTableRef"
        v-loading="loading"
        :data="rows"
        row-key="id"
        @selection-change="selectedRows = $event"
      >
        <el-table-column type="selection" width="48" reserve-selection />
        <el-table-column label="客户姓名" min-width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">{{ row.name }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="联系电话" prop="phoneDisplay" min-width="150" />
        <el-table-column label="阶段" width="120"
          ><template #default="{ row }"
            ><el-tag :color="stageColor(row.stage)" effect="light">{{
              stageLabel(row.stage)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="标签" min-width="180"
          ><template #default="{ row }"
            ><el-tag
              v-for="tag in splitTags(row.tags)"
              :key="tag"
              class="customer-tag"
              effect="plain"
              >{{ tag }}</el-tag
            ><span v-if="!row.tags" class="muted">—</span></template
          ></el-table-column
        >
        <el-table-column
          v-for="field in listFields"
          :key="field.fieldKey"
          :label="field.label"
          min-width="140"
          ><template #default="{ row }">{{
            formatCustomValue(row.customFields?.[field.fieldKey])
          }}</template></el-table-column
        >
        <el-table-column label="负责人" prop="ownerName" width="120" />
        <el-table-column label="来源" prop="source" min-width="130"
          ><template #default="{ row }">{{ sourceLabel(row.source) }}</template></el-table-column
        >
        <el-table-column label="创建时间" min-width="170"
          ><template #default="{ row }">{{ formatTime(row.createTime) }}</template></el-table-column
        >
        <el-table-column v-if="canRowActions" label="操作" width="280" fixed="right"
          ><template #default="{ row }"
            ><el-button v-if="canDispatch" link type="primary" @click="startCall(row)"
              >发起外呼</el-button
            ><el-button v-if="canFollowUp" link type="primary" @click="goFollowUp(row)"
              >安排跟进</el-button
            ><el-button v-if="canSave" link type="primary" @click="openEdit(row)">编辑</el-button
            ><el-button v-if="canArchive" link type="danger" @click="archive(row)"
              >归档</el-button
            ></template
          ></el-table-column
        >
        <template #empty
          ><el-empty :description="error || '暂无客户，先新建一条客户资料'"
        /></template>
      </el-table>
      <footer class="table-footer"
        ><span>共 {{ total.toLocaleString() }} 位客户</span
        ><el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="load"
      /></footer>
      <p class="privacy-note"
        >仅显示本人负责的客户。完整手机号不会返回客户列表接口，外呼时由已配对手机端按权限读取。</p
      >
    </section>

    <input
      ref="importFileInput"
      class="visually-hidden"
      type="file"
      accept=".csv,text/csv"
      aria-label="选择客户 CSV 文件"
      @change="readImportFile"
    />
    <el-dialog
      v-model="importVisible"
      class="customer-import-dialog"
      title="导入客户 CSV"
      width="900px"
      destroy-on-close
    >
      <div class="import-intro">
        <div>
          <strong>先检查数据，再导入到当前账号的客户列表</strong>
          <p
            >支持 UTF-8 CSV，最多 500 行、5
            MB。文件只在浏览器解析；通过校验的数据逐行加密写入服务端，不保存原始文件。扩展字段可用
            JSON 对象列提供。</p
          >
        </div>
        <el-button link type="primary" @click="downloadCustomerTemplate">下载 CSV 模板</el-button>
      </div>
      <div class="import-toolbar">
        <el-button :disabled="importing" @click="chooseImportFile">选择 CSV 文件</el-button>
        <span v-if="importFileName" class="import-filename">{{ importFileName }}</span>
        <span v-if="importRows.length" class="import-counts"
          >可导入 {{ readyCount }} 条 · 已导入 {{ importedCount }} 条 · 需处理
          {{ issueCount }} 条</span
        >
      </div>
      <el-table v-if="importRows.length" :data="importRows" max-height="390" row-key="rowNo">
        <el-table-column label="行" prop="rowNo" width="62" />
        <el-table-column label="客户姓名" prop="name" min-width="120" show-overflow-tooltip />
        <el-table-column label="联系电话" prop="phone" min-width="145" />
        <el-table-column label="阶段" min-width="110"
          ><template #default="{ row }">{{ stageLabel(row.stage) }}</template></el-table-column
        >
        <el-table-column label="来源" min-width="110"
          ><template #default="{ row }">{{ sourceLabel(row.source) }}</template></el-table-column
        >
        <el-table-column label="校验 / 状态" min-width="170">
          <template #default="{ row }">
            <el-tag v-if="row.state === 'imported'" type="success" effect="light">已导入</el-tag>
            <el-tag v-else-if="row.state === 'duplicate'" type="info" effect="light">已存在</el-tag>
            <el-tag v-else-if="row.state === 'failed'" type="danger" effect="light"
              >导入失败</el-tag
            >
            <el-tag v-else-if="row.state === 'invalid'" type="danger" effect="light"
              >格式错误</el-tag
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
          @click="importCustomerRows"
        >
          {{ importing ? '正在导入' : `导入剩余 ${readyCount} 条` }}
        </el-button>
      </template>
    </el-dialog>
    <el-dialog
      v-model="dialogVisible"
      class="customer-editor-dialog"
      :title="form.id ? '编辑客户' : '新建客户'"
      width="520px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="客户姓名" prop="name"
          ><el-input v-model="form.name" maxlength="80" placeholder="请输入姓名或称呼"
        /></el-form-item>
        <el-form-item label="联系电话" prop="phone"
          ><el-input v-model="form.phone" maxlength="20" placeholder="请输入可联系号码"
        /></el-form-item>
        <el-form-item label="客户阶段"
          ><el-select v-model="form.stage" class="fill"
            ><el-option
              v-for="stage in stageOptions"
              :key="stage.stageCode"
              :label="stage.name"
              :value="stage.stageCode" /></el-select
        ></el-form-item>
        <el-form-item label="来源渠道"
          ><el-select v-model="form.source" class="fill" clearable placeholder="请选择"
            ><el-option label="电话拓客" value="phone" /><el-option
              label="渠道获客"
              value="channel" /><el-option label="转介绍" value="referral" /><el-option
              label="其他"
              value="other" /></el-select
        ></el-form-item>
        <el-form-item label="客户标签"
          ><el-input v-model="form.tags" maxlength="512" placeholder="多个标签用逗号分隔"
        /></el-form-item>
        <template v-if="fieldOptions.length"
          ><el-divider content-position="left">扩展资料</el-divider
          ><el-form-item
            v-for="field in fieldOptions"
            :key="field.fieldKey"
            :label="field.label + (field.required ? '（必填）' : '')"
          >
            <el-input
              v-if="field.valueType === 'text'"
              v-model="form.customFields[field.fieldKey]"
              maxlength="2000"
              :placeholder="`请输入${field.label}`"
            />
            <el-input-number
              v-else-if="field.valueType === 'number'"
              v-model="form.customFields[field.fieldKey]"
              class="fill"
            />
            <el-date-picker
              v-else-if="field.valueType === 'date'"
              v-model="form.customFields[field.fieldKey]"
              type="date"
              value-format="YYYY-MM-DD"
              class="fill"
            />
            <el-select
              v-else-if="field.valueType === 'select'"
              v-model="form.customFields[field.fieldKey]"
              class="fill"
              clearable
              ><el-option
                v-for="option in field.options"
                :key="option"
                :label="option"
                :value="option"
            /></el-select>
            <el-select
              v-else-if="field.valueType === 'multi_select'"
              v-model="form.customFields[field.fieldKey]"
              class="fill"
              multiple
              collapse-tags
              collapse-tags-tooltip
              ><el-option
                v-for="option in field.options"
                :key="option"
                :label="option"
                :value="option"
            /></el-select>
            <el-switch
              v-else-if="field.valueType === 'boolean'"
              v-model="form.customFields[field.fieldKey]"
            /> </el-form-item
        ></template>
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="save">保存</el-button></template
      >
    </el-dialog>

    <el-dialog
      v-model="assignVisible"
      class="customer-batch-dialog"
      title="批量分配客户"
      width="480px"
      destroy-on-close
    >
      <p class="batch-dialog-intro">将当前选中的 {{ selectedRows.length }} 位客户分配给：</p>
      <el-select v-model="assignOwnerId" class="fill" filterable placeholder="选择有效成员">
        <el-option
          v-for="user in assignableUsers"
          :key="user.id"
          :label="user.deptName ? `${user.nickname} · ${user.deptName}` : user.nickname"
          :value="user.id"
        />
      </el-select>
      <p class="batch-dialog-help">已有负责人会被替换；每条变更都会记录操作者与前后负责人。</p>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="batchSaving"
          :disabled="!assignOwnerId"
          @click="saveBatchAssign"
          >确认分配</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="tagsVisible"
      class="customer-batch-dialog"
      title="批量维护客户标签"
      width="520px"
      destroy-on-close
    >
      <p class="batch-dialog-intro">应用到当前选中的 {{ selectedRows.length }} 位客户。</p>
      <el-radio-group v-model="tagMode" class="tag-mode-group">
        <el-radio-button value="append">追加标签</el-radio-button>
        <el-radio-button value="replace">覆盖标签</el-radio-button>
        <el-radio-button value="clear">清空标签</el-radio-button>
      </el-radio-group>
      <el-input
        v-if="tagMode !== 'clear'"
        v-model="tagText"
        type="textarea"
        :rows="3"
        maxlength="512"
        show-word-limit
        placeholder="多个标签用逗号或换行分隔，单个标签最多 32 个字符"
      />
      <p class="batch-dialog-help">
        {{
          tagMode === 'append'
            ? '已有标签会保留，重复标签只保留一份。'
            : tagMode === 'replace'
              ? '所选客户的已有标签会被整体替换。'
              : '所选客户的标签将全部清空。'
        }}
      </p>
      <template #footer>
        <el-button @click="tagsVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="saveBatchTags">保存标签</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" class="customer-detail-drawer" title="客户详情" size="520px">
      <div v-loading="detailLoading" class="customer-detail">
        <template v-if="detailCustomer">
          <div class="customer-detail-heading">
            <strong>{{ detailCustomer.name }}</strong>
            <el-tag :color="stageColor(detailCustomer.stage)" effect="light">
              {{ stageLabel(detailCustomer.stage) }}
            </el-tag>
          </div>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="联系电话">{{
              detailCustomer.phoneDisplay || '—'
            }}</el-descriptions-item>
            <el-descriptions-item label="负责人">{{
              detailCustomer.ownerName || '—'
            }}</el-descriptions-item>
            <el-descriptions-item label="来源">{{
              sourceLabel(detailCustomer.source)
            }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{
              formatTime(detailCustomer.createTime)
            }}</el-descriptions-item>
            <el-descriptions-item label="标签">
              <el-tag
                v-for="tag in splitTags(detailCustomer.tags)"
                :key="tag"
                class="customer-tag"
                effect="plain"
                >{{ tag }}</el-tag
              >
              <span v-if="!detailCustomer.tags" class="muted">—</span>
            </el-descriptions-item>
            <el-descriptions-item
              v-for="field in detailFields"
              :key="field.fieldKey"
              :label="field.label"
            >
              {{ formatCustomValue(detailCustomer.customFields?.[field.fieldKey]) }}
            </el-descriptions-item>
          </el-descriptions>
        </template>
        <el-empty v-else-if="!detailLoading" description="客户详情暂不可用" />
      </div>
      <template #footer>
        <div class="drawer-footer">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button v-if="detailCustomer && canDispatch" @click="startCall(detailCustomer)"
            >发起外呼</el-button
          >
          <el-button v-if="detailCustomer && canFollowUp" @click="goFollowUp(detailCustomer)"
            >安排跟进</el-button
          >
          <el-button v-if="detailCustomer && canSave" type="primary" @click="editDetailCustomer"
            >编辑客户</el-button
          >
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { startDirectCall } from '@/utils/callphone/direct-call'
import * as CustomerApi from '@/api/callphone/customer'
import * as PreviewStore from '@/api/callphone/preview-store'
import * as CustomerStageApi from '@/api/callphone/customer-stage'
import * as CustomerFieldApi from '@/api/callphone/customer-field'
import * as CustomerFieldPreview from '@/api/callphone/customer-field/preview'
import * as UserApi from '@/api/system/user'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
import { checkPermi } from '@/utils/permission'
import { useRoute, useRouter } from 'vue-router'

defineOptions({ name: 'CallPhoneCustomers' })
const loading = ref(false)
const route = useRoute()
const router = useRouter()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const canSave = previewMode || checkPermi(['callphone:customer:save'])
const canImport = previewMode || checkPermi(['callphone:customer:import'])
const canArchive = previewMode || checkPermi(['callphone:customer:archive'])
const canDispatch = previewMode || checkPermi(['callphone:call:dispatch:create'])
const canFollowUp = previewMode || checkPermi(['callphone:followup:save'])
const canRowActions = computed(() => canSave || canArchive || canDispatch || canFollowUp)
const saving = ref(false)
const dialogVisible = ref(false)
const error = ref('')
const formRef = ref<FormInstance>()
const importVisible = ref(false)
const importing = ref(false)
const importFileInput = ref<HTMLInputElement>()
const importFileName = ref('')
type ImportRow = CustomerApi.CustomerImportRow & {
  state: 'ready' | 'invalid' | 'duplicate' | 'imported' | 'failed'
  issue: string
}
const importRows = ref<ImportRow[]>([])
const readyCount = computed(
  () => importRows.value.filter((row) => row.state === 'ready' || row.state === 'failed').length
)
const importedCount = computed(
  () => importRows.value.filter((row) => row.state === 'imported').length
)
const issueCount = computed(
  () =>
    importRows.value.filter((row) => ['invalid', 'duplicate', 'failed'].includes(row.state)).length
)
const rows = ref<CustomerApi.CustomerVO[]>([])
const selectedRows = ref<CustomerApi.CustomerVO[]>([])
const customerTableRef = ref<{ clearSelection: () => void }>()
const assignVisible = ref(false)
const tagsVisible = ref(false)
const batchSaving = ref(false)
const assignOwnerId = ref('')
const assignableUsers = ref<{ id: string; nickname: string; deptName?: string }[]>([])
const tagMode = ref<CustomerApi.CustomerTagBatchMode>('append')
const tagText = ref('')
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailCustomer = ref<CustomerApi.CustomerVO>()
const stageOptions = ref<CustomerStageApi.CustomerStageVO[]>([])
const stageOptionsError = ref('')
const fieldOptions = ref<CustomerFieldApi.CustomerFieldVO[]>([])
const listFields = computed(() => fieldOptions.value.filter((field) => field.listVisible))
const detailFields = computed(() => fieldOptions.value)
const total = ref(0)
const query = reactive({ pageNo: 1, pageSize: 10, query: '', stage: '' })
const emptyForm = () => ({
  id: undefined as string | undefined,
  name: '',
  phone: '',
  stage: 'new',
  source: '',
  tags: '',
  customFields: {} as Record<string, any>
})
const form = reactive(emptyForm())
const rules: FormRules = {
  name: [{ required: true, message: '请填写客户姓名', trigger: 'blur' }],
  phone: [
    {
      validator: (_rule, value, callback) => {
        if (!form.id && !value) return callback(new Error('请填写联系电话'))
        if (value && !/^\+?[0-9][0-9 -]{5,19}$/.test(value))
          return callback(new Error('请输入有效的联系电话'))
        callback()
      },
      trigger: 'blur'
    }
  ]
}

async function load() {
  clearSelection()
  loading.value = true
  error.value = ''
  try {
    const params = { ...query, query: query.query || undefined, stage: query.stage || undefined }
    const result = previewMode
      ? PreviewStore.previewCustomers(params)
      : await CustomerApi.getCustomerPage(params)
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.message || '客户数据加载失败'
  } finally {
    loading.value = false
  }
}
function search() {
  query.pageNo = 1
  void load()
}
function reset() {
  query.pageNo = 1
  query.query = ''
  query.stage = ''
  load()
}
function clearSelection() {
  selectedRows.value = []
  customerTableRef.value?.clearSelection()
}
async function openBatchAssign() {
  if (!selectedRows.value.length) return
  try {
    assignableUsers.value = previewMode
      ? [
          { id: 'demo-user', nickname: '我', deptName: '当前成员' },
          { id: 'demo-user-2', nickname: '李顾问', deptName: '销售一组' },
          { id: 'demo-user-3', nickname: '周顾问', deptName: '销售二组' }
        ]
      : (await UserApi.getSimpleUserList()).map((user) => ({
          id: String(user.id),
          nickname: user.nickname,
          deptName: user.deptName
        }))
    if (!assignableUsers.value.length) throw new Error('当前没有可分配的有效成员')
    assignOwnerId.value = ''
    assignVisible.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '成员列表读取失败，请检查成员查询权限')
  }
}
async function saveBatchAssign() {
  if (!selectedRows.value.length || !assignOwnerId.value) return
  batchSaving.value = true
  try {
    const changed = previewMode
      ? PreviewStore.assignPreviewCustomers(
          selectedRows.value.map((row) => row.id),
          assignOwnerId.value,
          assignableUsers.value.find((user) => user.id === assignOwnerId.value)?.nickname || '成员'
        )
      : await CustomerApi.assignCustomers(
          selectedRows.value.map((row) => row.id),
          assignOwnerId.value
        )
    ElMessage.success(
      changed ? `已调整 ${changed} 位客户的负责人` : '所选客户已由该成员负责，无需变更'
    )
    assignVisible.value = false
    clearSelection()
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '批量分配失败，请刷新后重试')
  } finally {
    batchSaving.value = false
  }
}
function openBatchTags() {
  if (!selectedRows.value.length) return
  tagMode.value = 'append'
  tagText.value = ''
  tagsVisible.value = true
}
async function saveBatchTags() {
  if (!selectedRows.value.length) return
  const tags =
    tagMode.value === 'clear'
      ? []
      : [
          ...new Set(
            tagText.value
              .split(/[,，\n]/)
              .map((tag) => tag.trim())
              .filter(Boolean)
          )
        ]
  if (tagMode.value !== 'clear' && !tags.length) {
    ElMessage.warning('请至少填写一个标签')
    return
  }
  if (tags.some((tag) => tag.length > 32) || tags.length > 20) {
    ElMessage.warning('最多维护 20 个标签，单个标签最多 32 个字符')
    return
  }
  if (tagMode.value !== 'append') {
    try {
      await ElMessageBox.confirm(
        tagMode.value === 'clear'
          ? `确定清空 ${selectedRows.value.length} 位客户的全部标签吗？`
          : `确定用新标签覆盖 ${selectedRows.value.length} 位客户的现有标签吗？`,
        '确认批量修改',
        { type: 'warning', confirmButtonText: '确认修改', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
  }
  batchSaving.value = true
  try {
    const changed = previewMode
      ? PreviewStore.updatePreviewCustomerTags(
          selectedRows.value.map((row) => row.id),
          tagMode.value,
          tags
        )
      : await CustomerApi.updateCustomerTags(
          selectedRows.value.map((row) => row.id),
          tagMode.value,
          tags
        )
    ElMessage.success(changed ? `已更新 ${changed} 位客户的标签` : '所选客户的标签没有变化')
    tagsVisible.value = false
    clearSelection()
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '批量维护标签失败，请刷新后重试')
  } finally {
    batchSaving.value = false
  }
}
async function openDetail(row: CustomerApi.CustomerVO) {
  detailVisible.value = true
  detailLoading.value = true
  detailCustomer.value = undefined
  try {
    const customer = previewMode
      ? PreviewStore.findPreviewCustomer(row.id) || row
      : await CustomerApi.getCustomer(row.id)
    if (!customer) throw new Error('客户资料不存在或无权查看')
    detailCustomer.value = customer
  } catch (e: any) {
    detailVisible.value = false
    ElMessage.error(e?.message || '客户详情读取失败')
  } finally {
    detailLoading.value = false
  }
}
function editDetailCustomer() {
  if (!detailCustomer.value) return
  detailVisible.value = false
  void openEdit(detailCustomer.value)
}
function openCreate() {
  if (!stageOptions.value.length) {
    ElMessage.warning(stageOptionsError.value || '请先启用一个客户阶段，再新增客户')
    return
  }
  Object.assign(form, emptyForm())
  dialogVisible.value = true
}
function openImport() {
  if (!stageOptions.value.length) {
    ElMessage.warning(stageOptionsError.value || '请先启用一个客户阶段，再导入客户')
    return
  }
  importRows.value = []
  importFileName.value = ''
  importVisible.value = true
}
function chooseImportFile() {
  if (importFileInput.value) importFileInput.value.value = ''
  importFileInput.value?.click()
}
function parseCsv(text: string): string[][] {
  const records: string[][] = []
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
      if (row.some((value) => value !== '')) records.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号')
  row.push(cell.trim())
  if (row.some((value) => value !== '')) records.push(row)
  return records
}
function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[ _-]/g, '')
}
function importKey() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `customer-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}
async function readImportFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
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
    const col = (...names: string[]) => headers.findIndex((header) => names.includes(header))
    const nameCol = col('name', '姓名', '联系人', '客户姓名')
    const phoneCol = col('phone', 'mobile', 'telephone', '电话', '手机号', '联系电话')
    const stageCol = col('stage', '客户阶段', '阶段')
    const sourceCol = col('source', '来源', '来源渠道')
    const tagsCol = col('tags', '标签', '客户标签')
    const customFieldsCol = col('customfields', '扩展字段json', '自定义字段json')
    if (nameCol < 0 || phoneCol < 0) throw new Error('表头必须包含“客户姓名”和“联系电话”列')
    const sourceMap: Record<string, string> = {
      电话拓客: 'phone',
      渠道获客: 'channel',
      转介绍: 'referral',
      其他: 'other'
    }
    const seen = new Set<string>()
    importRows.value = records.slice(1).map((record, index) => {
      const name = (record[nameCol] || '').trim()
      const phone = (record[phoneCol] || '').trim()
      const stageValue = stageCol < 0 ? '' : (record[stageCol] || '').trim()
      const stage = stageValue
        ? stageOptions.value.find(
            (item) => item.stageCode === stageValue || item.name === stageValue
          )?.stageCode
        : 'new'
      const sourceValue = sourceCol < 0 ? '' : (record[sourceCol] || '').trim()
      const source = sourceValue
        ? ['phone', 'channel', 'referral', 'other'].includes(sourceValue)
          ? sourceValue
          : sourceMap[sourceValue]
        : undefined
      let issue = ''
      let customFields: Record<string, unknown> | undefined
      if (customFieldsCol >= 0 && record[customFieldsCol]) {
        try {
          const parsed = JSON.parse(record[customFieldsCol])
          if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error()
          customFields = parsed
        } catch {
          issue = '扩展字段必须是 JSON 对象'
        }
      }
      const phoneKey = phone.replace(/[\s-]/g, '')
      let state: ImportRow['state'] = 'ready'
      if (!issue && !name) issue = '姓名不能为空'
      else if (!issue && name.length > 80) issue = '姓名最多 80 个字符'
      else if (!issue && !/^\+?[0-9][0-9 -]{5,19}$/.test(phone)) issue = '联系电话格式无效'
      else if (!issue && stageCol >= 0 && stageValue && !stage) issue = '客户阶段不存在或已停用'
      else if (!issue && sourceCol >= 0 && sourceValue && !source) issue = '来源不在支持范围内'
      else if (!issue && seen.has(phoneKey)) {
        issue = '与文件中的较早行号码重复'
        state = 'duplicate'
      }
      if (issue && state !== 'duplicate') state = 'invalid'
      if (state === 'ready') seen.add(phoneKey)
      return {
        rowNo: index + 2,
        name,
        phone,
        stage: stage || 'new',
        source,
        tags: tagsCol < 0 ? undefined : record[tagsCol] || undefined,
        customFields,
        idempotencyKey: importKey(),
        state,
        issue
      }
    })
  } catch (e: any) {
    ElMessage.error(e?.message || 'CSV 读取失败，请确认文件使用 UTF-8 编码')
  }
}
async function importCustomerRows() {
  const pending = importRows.value.filter((row) => row.state === 'ready' || row.state === 'failed')
  if (!pending.length || importing.value) return
  importing.value = true
  try {
    if (previewMode) {
      for (const row of pending) {
        PreviewStore.savePreviewCustomer({
          name: row.name,
          phone: row.phone,
          stage: row.stage || 'new',
          source: row.source || '',
          tags: row.tags || '',
          customFields: row.customFields
        })
        row.state = 'imported'
        row.issue = ''
      }
    } else {
      const result = await CustomerApi.importCustomers(
        pending.map(
          ({ rowNo, name, phone, stage, source, tags, customFields, idempotencyKey }) => ({
            rowNo,
            name,
            phone,
            stage,
            source,
            tags,
            customFields,
            idempotencyKey
          })
        )
      )
      const byRow = new Map((result.rows || []).map((item) => [item.rowNo, item]))
      for (const row of pending) {
        const saved = byRow.get(row.rowNo)
        if (!saved) {
          row.state = 'failed'
          row.issue = '服务端未返回此行结果，可安全重试'
          continue
        }
        row.state = saved.status
        row.issue = saved.message || ''
      }
    }
    if (importedCount.value) {
      ElMessage.success(`已导入 ${importedCount.value} 条客户`)
      await load()
    }
  } catch (e: any) {
    for (const row of pending) {
      row.state = 'failed'
      row.issue = e?.message || '服务暂不可用，可安全重试'
    }
    ElMessage.error(e?.message || '客户导入失败，可使用相同文件安全重试')
  } finally {
    importing.value = false
  }
}
function downloadCustomerTemplate() {
  const blob = new Blob(
    [
      '客户姓名,联系电话,阶段,来源,标签,扩展字段JSON\n张三,13800138000,new,phone,重点客户,"{""industry"":""零售""}"\n'
    ],
    { type: 'text/csv;charset=utf-8' }
  )
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'callphone-customers-template.csv'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function openEdit(row: CustomerApi.CustomerVO) {
  try {
    const customer = previewMode
      ? PreviewStore.findPreviewCustomer(row.id) || row
      : await CustomerApi.getCustomer(row.id)
    if (!customer) throw new Error('客户资料不存在或无权查看')
    Object.assign(form, {
      ...customer,
      phone: '',
      customFields: { ...(customer.customFields || {}) }
    })
    dialogVisible.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '客户详情读取失败')
  }
}
async function save() {
  await formRef.value?.validate()
  for (const field of fieldOptions.value) {
    const value = form.customFields[field.fieldKey]
    if (
      field.required &&
      (value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0))
    ) {
      ElMessage.warning(`请填写必填字段“${field.label}”`)
      return
    }
  }
  saving.value = true
  try {
    if (previewMode)
      PreviewStore.savePreviewCustomer({ ...form, name: form.name, phone: form.phone })
    else await CustomerApi.saveCustomer({ ...form })
    ElMessage.success('客户已保存')
    dialogVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
async function archive(row: CustomerApi.CustomerVO) {
  try {
    await ElMessageBox.confirm(`确认归档客户“${row.name}”吗？`, '归档确认', { type: 'warning' })
    if (previewMode) PreviewStore.archivePreviewCustomer(row.id)
    else await CustomerApi.archiveCustomer(row.id)
    ElMessage.success('客户已归档')
    await load()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '归档失败')
  }
}
function stageLabel(stage?: string) {
  return stageOptions.value.find((item) => item.stageCode === stage)?.name || stage || '—'
}
function stageColor(stage?: string) {
  return stageOptions.value.find((item) => item.stageCode === stage)?.color || '#64748B'
}
function splitTags(tags?: string) {
  return (tags || '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}
function sourceLabel(source?: string) {
  return (
    (
      { phone: '电话拓客', channel: '渠道获客', referral: '转介绍', other: '其他' } as Record<
        string,
        string
      >
    )[source || ''] || '—'
  )
}
function formatTime(value?: string) {
  return value ? parseCallPhoneDateTime(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
function formatCustomValue(value: unknown) {
  if (Array.isArray(value)) return value.join('、') || '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return value === undefined || value === null || value === '' ? '—' : String(value)
}
function goFollowUp(row: CustomerApi.CustomerVO) {
  void router.push({
    path: previewMode
      ? '/callphone-preview/follow-up-tasks'
      : '/callphone/customers/follow-up-tasks',
    query: { ...(previewMode ? { preview: '1' } : {}), customerId: row.id }
  })
}
async function startCall(row: CustomerApi.CustomerVO) {
  if (previewMode) {
    ElMessage.info('预览模式不拨打真实电话')
    return
  }
  await startDirectCall({ customerId: row.id, source: 'customer_detail' })
}
function parseOptions(value?: string) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}
onMounted(async () => {
  try {
    stageOptions.value = previewMode
      ? PreviewStore.previewStages(true)
      : await CustomerStageApi.getCustomerStageOptions()
    stageOptionsError.value = ''
  } catch (e: any) {
    stageOptions.value = []
    stageOptionsError.value = e?.message || '客户阶段读取失败，请检查权限或服务状态'
  }
  try {
    if (previewMode) fieldOptions.value = CustomerFieldPreview.listPreviewCustomerFieldOptions()
    else {
      const rows = await CustomerFieldApi.getCustomerFieldOptions()
      fieldOptions.value = rows.map((field) => ({
        ...field,
        options: parseOptions(field.optionsJson),
        visibleRoleCodes: field.visibleRoleCodes || []
      }))
    }
  } catch (e: any) {
    fieldOptions.value = []
    ElMessage.error(e?.message || '客户扩展字段加载失败')
  }
  await load()
})
</script>

<style scoped>
.callphone-customers-page {
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
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

.heading-actions {
  display: flex;
  gap: 10px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: var(--el-text-color-primary);
}

.page-heading p,
.privacy-note {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.page-heading p {
  margin: 7px 0 0;
}

.filter-bar {
  margin-bottom: 8px;
}

.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin: 10px 0;
  color: #526079;
  background: #f4f7fc;
  border: 1px solid #e8edf6;
  border-radius: 8px;
}

.batch-toolbar strong {
  color: #304da5;
}

.batch-dialog-intro {
  margin: 0 0 14px;
  color: #45536b;
}

.batch-dialog-help {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #78849a;
}

.tag-mode-group {
  margin-bottom: 14px;
}

.customer-detail {
  min-height: 140px;
}

.customer-detail-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.customer-detail-heading strong {
  font-size: 18px;
  color: #20293b;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  color: var(--el-text-color-secondary);
}

.customer-tag {
  margin-right: 5px;
}

.muted {
  color: var(--el-text-color-placeholder);
}

.privacy-note {
  margin: 18px 0 0;
}

.stage-options-alert {
  margin-bottom: 16px;
}

.fill {
  width: 100%;
}

.import-intro {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 18px;
}

.import-intro strong {
  color: var(--el-text-color-primary);
}

.import-intro p {
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.import-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.import-filename,
.import-counts {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.import-counts {
  margin-left: auto;
}

.import-issue {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

:global(.el-dialog.customer-editor-dialog) {
  display: flex;
  max-height: calc(100vh - 48px);
  margin: 24px auto !important;
  overflow: hidden;
  flex-direction: column;
}

:global(.el-dialog.customer-editor-dialog .el-dialog__body) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

:global(.el-dialog.customer-editor-dialog .el-dialog__header),
:global(.el-dialog.customer-editor-dialog .el-dialog__footer) {
  flex: 0 0 auto;
}

:global(.el-dialog.customer-import-dialog) {
  --el-dialog-bg-color: #fff;
  --el-bg-color: #fff;
  --el-bg-color-page: #f5f7fb;
  --el-text-color-primary: #20293b;
  --el-text-color-regular: #596579;
  --el-text-color-secondary: #737e91;

  color: #20293b;
  background: #fff;
}

:global(.el-dialog.customer-batch-dialog) {
  --el-dialog-bg-color: #fff;
  --el-bg-color: #fff;
  --el-bg-color-page: #f5f7fb;
  --el-text-color-primary: #20293b;
  --el-text-color-regular: #596579;
  --el-text-color-secondary: #737e91;

  color: #20293b;
  background: #fff;
}

:global(.el-drawer.customer-detail-drawer) {
  --el-drawer-bg-color: #fff;
  --el-bg-color: #fff;
  --el-bg-color-page: #f5f7fb;
  --el-text-color-primary: #20293b;
  --el-text-color-regular: #596579;
  --el-text-color-secondary: #737e91;

  color: #20293b;
  background: #fff;
}
</style>
