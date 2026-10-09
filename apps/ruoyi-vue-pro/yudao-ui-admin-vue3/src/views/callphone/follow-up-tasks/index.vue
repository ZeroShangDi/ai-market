<template>
  <div class="callphone-follow-up-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="在客户列表点击“安排跟进”可直接带入客户；新建、编辑、完成和取消状态会保存在当前浏览器。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div><h1>跟进事项</h1><p>把客户沟通后的下一步变成有负责人和截止时间的待办。</p></div>
        <el-button type="primary" @click="openCreate()">新建跟进</el-button>
      </header>

      <div class="summary-cards">
        <button
          v-for="item in statusCards"
          :key="item.key"
          class="summary-card"
          :class="{ active: query.status === item.key }"
          @click="selectStatus(item.key)"
        >
          <span>{{ item.label }}</span
          ><strong>{{ statusCount(item.key) }}</strong>
        </button>
      </div>
      <el-form :inline="true" :model="query" class="filter-bar">
        <el-form-item label="事项状态"
          ><el-select v-model="query.status" clearable placeholder="全部状态" @change="load"
            ><el-option label="待处理" value="pending" /><el-option
              label="已逾期"
              value="overdue" /><el-option label="已完成" value="completed" /><el-option
              label="已取消"
              value="cancelled" /></el-select
        ></el-form-item>
        <el-form-item><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="跟进事项" min-width="210"
          ><template #default="{ row }"
            ><strong>{{ row.title }}</strong
            ><p class="task-content">{{ row.content || '暂无补充内容' }}</p></template
          ></el-table-column
        >
        <el-table-column label="关联客户" min-width="160"
          ><template #default="{ row }"
            ><div>{{ row.customerName }}</div
            ><small class="muted">{{ row.phoneDisplay }}</small></template
          ></el-table-column
        >
        <el-table-column label="截止时间" min-width="170"
          ><template #default="{ row }"
            ><span :class="{ overdue: row.status === 'overdue' }">{{
              formatTime(row.dueAt)
            }}</span></template
          ></el-table-column
        >
        <el-table-column label="状态" width="110"
          ><template #default="{ row }"
            ><el-tag :type="statusType(row.status)" effect="light">{{
              statusLabel(row.status)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="关联通话" width="130"
          ><template #default="{ row }">{{
            row.sourceCallRecordId || '—'
          }}</template></el-table-column
        >
        <el-table-column label="操作" width="150" fixed="right"
          ><template #default="{ row }"
            ><el-button
              v-if="row.status === 'pending' || row.status === 'overdue'"
              link
              type="success"
              @click="complete(row)"
              >完成</el-button
            ><el-button
              v-if="row.status === 'pending' || row.status === 'overdue'"
              link
              type="danger"
              @click="cancel(row)"
              >取消</el-button
            ><el-button
              v-if="row.status === 'pending' || row.status === 'overdue'"
              link
              type="primary"
              @click="openEdit(row)"
              >编辑</el-button
            ></template
          ></el-table-column
        >
        <template #empty><el-empty :description="error || '当前没有跟进事项'" /></template>
      </el-table>
      <footer class="table-footer"
        ><span>共 {{ total.toLocaleString() }} 项</span
        ><el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="load"
      /></footer>
      <p class="privacy-note"
        >跟进内容在数据库中加密保存；完成与取消会保留状态审计，通话结果不会自动改变客户阶段。</p
      >
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑跟进事项' : '新建跟进事项'"
      width="540px"
      destroy-on-close
    >
      <el-alert
        v-if="form.sourceCallRecordId"
        class="source-call-alert"
        title="此事项已关联本次通话"
        description="保存后可从通话详情追溯此跟进事项。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="关联客户" prop="customerId"
          ><el-select
            v-model="form.customerId"
            class="fill"
            filterable
            remote
            clearable
            :remote-method="searchCustomers"
            :loading="customerLoading"
            placeholder="搜索客户姓名或手机号后四位"
            ><el-option
              v-for="item in customers"
              :key="item.customerId"
              :label="`${item.customerName} · ${item.phoneDisplay}`"
              :value="item.customerId" /></el-select
        ></el-form-item>
        <el-form-item label="事项标题" prop="title"
          ><el-input
            v-model="form.title"
            maxlength="120"
            placeholder="例如：发送产品资料并确认收货"
        /></el-form-item>
        <el-form-item label="截止时间" prop="dueAt"
          ><el-date-picker
            v-model="form.dueAt"
            class="fill"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="选择提醒时间"
        /></el-form-item>
        <el-form-item label="跟进内容"
          ><el-input
            v-model="form.content"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="记录需要执行的下一步"
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
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import * as FollowUpApi from '@/api/callphone/follow-up-task'
import * as OutboundApi from '@/api/callphone/outbound'
import * as CustomerApi from '@/api/callphone/customer'
import * as PreviewStore from '@/api/callphone/preview-store'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
import { useRoute } from 'vue-router'

defineOptions({ name: 'CallPhoneFollowUpTasks' })
const loading = ref(false),
  saving = ref(false),
  customerLoading = ref(false),
  dialogVisible = ref(false),
  error = ref('')
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const formRef = ref<FormInstance>()
const rows = ref<FollowUpApi.FollowUpTaskVO[]>([])
const total = ref(0)
const counts = reactive({ pending: 0, overdue: 0, completed: 0, cancelled: 0 })
const allCount = computed(
  () => counts.pending + counts.overdue + counts.completed + counts.cancelled
)
const customers = ref<{ customerId: string; customerName: string; phoneDisplay: string }[]>([])
let customerSearchTimer: ReturnType<typeof setTimeout> | undefined
let customerSearchVersion = 0
const query = reactive({
  pageNo: 1,
  pageSize: 10,
  status: undefined as FollowUpApi.FollowUpTaskVO['status'] | undefined
})
const emptyForm = () => ({
  id: undefined as string | undefined,
  customerId: '',
  title: '',
  content: '',
  dueAt: '',
  sourceCallRecordId: undefined as string | undefined
})
const form = reactive(emptyForm())
const rules: FormRules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  title: [{ required: true, message: '请填写事项标题', trigger: 'blur' }],
  dueAt: [{ required: true, message: '请选择截止时间', trigger: 'change' }]
}
const statusCards = [
  { key: undefined, label: '全部事项' },
  { key: 'pending', label: '待处理' },
  { key: 'overdue', label: '已逾期' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' }
] as const

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = previewMode
      ? PreviewStore.previewFollowUpTasks({ ...query })
      : await FollowUpApi.getFollowUpTaskPage({ ...query })
    rows.value = result.list || []
    total.value = result.total || 0
    counts.pending = result.pendingCount || 0
    counts.overdue = result.overdueCount || 0
    counts.completed = result.completedCount || 0
    counts.cancelled = result.cancelledCount || 0
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.message || '跟进事项加载失败'
  } finally {
    loading.value = false
  }
}
function selectStatus(status: (typeof statusCards)[number]['key']) {
  query.pageNo = 1
  query.status = status || undefined
  load()
}
function statusCount(status: (typeof statusCards)[number]['key']) {
  return status === 'pending'
    ? counts.pending
    : status === 'overdue'
      ? counts.overdue
      : status === 'completed'
        ? counts.completed
        : status === 'cancelled'
          ? counts.cancelled
          : allCount.value
}
function reset() {
  query.pageNo = 1
  query.status = undefined
  load()
}
function searchCustomers(value: string) {
  if (customerSearchTimer) clearTimeout(customerSearchTimer)
  const version = ++customerSearchVersion
  customerSearchTimer = setTimeout(async () => {
    customerLoading.value = true
    try {
      const result = previewMode
        ? PreviewStore.searchPreviewCustomers(value)
        : await OutboundApi.getCustomerOptions(value || '')
      if (version !== customerSearchVersion) return
      const selected = customers.value.find((item) => item.customerId === form.customerId)
      customers.value = result
      if (selected && !customers.value.some((item) => item.customerId === selected.customerId)) {
        customers.value.unshift(selected)
      }
    } catch {
      if (version === customerSearchVersion) customers.value = []
    } finally {
      if (version === customerSearchVersion) customerLoading.value = false
    }
  }, 250)
}
function openCreate(loadCustomerOptions = true) {
  Object.assign(form, emptyForm())
  dialogVisible.value = true
  if (loadCustomerOptions) void searchCustomers('')
}
function openEdit(row: FollowUpApi.FollowUpTaskVO) {
  Object.assign(form, {
    ...row,
    dueAt:
      row.dueAt
        ?.replace(/\.\d{3}Z$/, '')
        .replace(/Z$/, '')
        .replace(' ', 'T') || ''
  })
  customers.value = [
    { customerId: row.customerId, customerName: row.customerName, phoneDisplay: row.phoneDisplay }
  ]
  dialogVisible.value = true
}
async function save() {
  await formRef.value?.validate()
  saving.value = true
  try {
    if (previewMode) {
      const customer = PreviewStore.findPreviewCustomer(form.customerId)
      if (!customer) throw new Error('所选客户已不存在')
      PreviewStore.savePreviewFollowUpTask({ ...form }, customer.name, customer.phoneDisplay)
    } else await FollowUpApi.saveFollowUpTask({ ...form })
    ElMessage.success('跟进事项已保存')
    dialogVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
async function complete(row: FollowUpApi.FollowUpTaskVO) {
  try {
    await ElMessageBox.confirm(`确认完成“${row.title}”吗？`, '完成跟进')
    if (previewMode) PreviewStore.completePreviewFollowUpTask(row.id)
    else await FollowUpApi.completeFollowUpTask(row.id)
    ElMessage.success('跟进事项已完成')
    await load()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '操作失败')
  }
}
async function cancel(row: FollowUpApi.FollowUpTaskVO) {
  try {
    await ElMessageBox.confirm(
      `取消后此事项将保留在已取消列表，确认取消“${row.title}”吗？`,
      '取消跟进'
    )
    if (previewMode) PreviewStore.cancelPreviewFollowUpTask(row.id)
    else await FollowUpApi.cancelFollowUpTask(row.id)
    ElMessage.success('跟进事项已取消')
    await load()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '取消失败')
  }
}
function statusLabel(status: string) {
  return (
    (
      { pending: '待处理', overdue: '已逾期', completed: '已完成', cancelled: '已取消' } as Record<
        string,
        string
      >
    )[status] || status
  )
}
function statusType(status: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  return status === 'completed'
    ? 'success'
    : status === 'overdue'
      ? 'danger'
      : status === 'cancelled'
        ? 'info'
        : 'warning'
}
function formatTime(value?: string) {
  return value ? parseCallPhoneDateTime(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
onMounted(async () => {
  void load()
  const customerId = typeof route.query.customerId === 'string' ? route.query.customerId : ''
  const sourceCallRecordId =
    typeof route.query.sourceCallRecordId === 'string' ? route.query.sourceCallRecordId : ''
  if (customerId) {
    const customer = previewMode
      ? PreviewStore.findPreviewCustomer(customerId)
      : await CustomerApi.getCustomer(customerId)
    if (customer) {
      form.customerId = customer.id
      customers.value = [
        {
          customerId: customer.id,
          customerName: customer.name,
          phoneDisplay: customer.phoneDisplay
        }
      ]
    }
    openCreate(false)
    if (customer) {
      form.customerId = customer.id
      customers.value = [
        {
          customerId: customer.id,
          customerName: customer.name,
          phoneDisplay: customer.phoneDisplay
        }
      ]
    }
    form.sourceCallRecordId = sourceCallRecordId || undefined
  }
})
onBeforeUnmount(() => {
  if (customerSearchTimer) clearTimeout(customerSearchTimer)
  customerSearchVersion += 1
})
</script>

<style scoped>
.callphone-follow-up-page {
  padding: 20px;
}

.page-panel {
  padding: 22px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
}

.preview-banner {
  margin-bottom: 14px;
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
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

.source-call-alert {
  margin-bottom: 18px;
}

.page-heading p {
  margin: 7px 0 0;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(100px, 1fr));
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

.summary-card strong {
  display: block;
  margin-top: 7px;
  font-size: 22px;
  color: var(--el-text-color-primary);
}

.summary-card.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

.task-content {
  max-width: 400px;
  margin: 5px 0 0;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--el-text-color-placeholder);
}

.overdue {
  color: var(--el-color-danger);
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  color: var(--el-text-color-secondary);
}

.privacy-note {
  margin-top: 18px;
}

.fill {
  width: 100%;
}

@media (width <= 750px) {
  .summary-cards {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }

  .callphone-follow-up-page {
    padding: 10px;
  }

  .page-panel {
    padding: 14px;
  }
}

@media (751px <= width <= 1100px) {
  .summary-cards {
    grid-template-columns: repeat(3, minmax(100px, 1fr));
  }
}
</style>
