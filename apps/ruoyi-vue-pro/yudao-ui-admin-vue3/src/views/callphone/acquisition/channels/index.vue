<template>
  <div class="acquisition-page">
    <el-alert
      v-if="previewMode"
      class="preview-note"
      title="本地交互预览"
      description="渠道配置保存在此浏览器。新建渠道后，可回到渠道活码或员工活码创建二维码并归属到该渠道。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading"
        ><div
          ><h1>平台渠道</h1><p>维护获客来源及归因周期，为活码、获客链接统一提供渠道口径。</p></div
        ><el-button type="primary" @click="openCreate">新建渠道</el-button></header
      >
      <div class="summary"
        ><div
          ><span>渠道总数</span><strong>{{ totalCount }}</strong></div
        ><div
          ><span>本页启用中</span><strong>{{ activeCount }}</strong></div
        ><el-input
          v-model="query"
          clearable
          placeholder="搜索渠道名称或编码"
          class="search"
          @keyup.enter="search"
      /></div>
      <el-table v-loading="loading" :data="filteredRows" row-key="id">
        <el-table-column label="渠道名称" min-width="160"
          ><template #default="{ row }"
            ><div class="channel-name"
              ><span class="channel-mark"><Icon :icon="platformIcon(row.platform)" /></span
              ><div
                ><strong>{{ row.name }}</strong
                ><small>{{ platformLabel(row.platform) }}</small></div
              ></div
            ></template
          ></el-table-column
        >
        <el-table-column label="渠道编码" prop="code" min-width="140" />
        <el-table-column label="负责人" prop="ownerName" width="100" />
        <el-table-column label="归因窗口" width="100"
          ><template #default="{ row }"
            >{{ row.attributionWindowDays }} 天</template
          ></el-table-column
        >
        <el-table-column label="状态" width="90"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 'active' ? 'success' : 'info'">{{
              row.status === 'active' ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="创建时间" min-width="165"
          ><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column
        >
        <el-table-column label="操作" width="180" fixed="right"
          ><template #default="{ row }"
            ><div class="channel-actions"
              ><el-button v-if="previewMode" link type="primary" @click="createCode(row)"
                >创建活码</el-button
              ><el-button link type="primary" @click="edit(row)">编辑</el-button
              ><el-button
                link
                :type="row.status === 'active' ? 'danger' : 'success'"
                @click="toggle(row)"
                >{{ row.status === 'active' ? '停用' : '启用' }}</el-button
              ></div
            ></template
          ></el-table-column
        >
        <template #empty
          ><el-empty :description="loadError || '暂无渠道，请先新增获客平台或来源'"
        /></template>
      </el-table>
      <div class="table-footer"
        ><span>共 {{ totalCount }} 个渠道</span
        ><el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          :total="totalCount"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="changePageSize"
      /></div>
    </section>
    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑渠道' : '新建渠道'"
      width="520px"
      class="acquisition-dialog"
      append-to-body
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="渠道名称" prop="name"
          ><el-input v-model="form.name" maxlength="48" placeholder="例如：微信朋友圈"
        /></el-form-item>
        <el-form-item label="来源平台" prop="platform"
          ><el-select v-model="form.platform" class="fill"
            ><el-option label="微信" value="wechat" /><el-option
              label="抖音"
              value="douyin" /><el-option label="官网" value="website" /><el-option
              label="线下物料"
              value="offline" /></el-select
        ></el-form-item>
        <el-form-item label="渠道编码" prop="code"
          ><el-input
            v-model="form.code"
            maxlength="32"
            :disabled="Boolean(form.id)"
            placeholder="仅小写字母、数字和短横线"
        /></el-form-item>
        <el-form-item label="负责人"
          ><el-select v-model="form.ownerUserId" class="fill" clearable placeholder="选择负责人"
            ><el-option
              v-for="staff in staffOptions"
              :key="staff.id"
              :label="staff.nickname"
              :value="staff.id" /></el-select
        ></el-form-item>
        <el-form-item label="归因窗口"
          ><el-input-number v-model="form.attributionWindowDays" :min="1" :max="365" /><span
            class="inline-hint"
            >天内扫码和留资归属此渠道</span
          ></el-form-item
        >
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" @click="save">保存渠道</el-button></template
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import * as Acquisition from '@/api/callphone/acquisition-preview'
import * as ChannelApi from '@/api/callphone/acquisition/channel'
import { getSimpleUserList, type UserVO } from '@/api/system/user'

defineOptions({ name: 'CallPhoneAcquisitionChannels' })
const router = useRouter()
const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
type ChannelRow = Acquisition.AcquisitionChannel & { ownerUserId?: number }
const rows = ref<ChannelRow[]>([]),
  query = ref(''),
  dialogVisible = ref(false),
  formRef = ref<FormInstance>(),
  loading = ref(false),
  loadError = ref(''),
  pageNo = ref(1),
  pageSize = ref(20),
  totalCount = ref(0)
const staffOptions = ref<UserVO[]>([])
const blank = () => ({
  id: undefined as string | undefined,
  name: '',
  platform: 'wechat' as Acquisition.AcquisitionChannel['platform'],
  code: '',
  ownerUserId: undefined as number | undefined,
  attributionWindowDays: 30
})
const form = reactive(blank())
const rules: FormRules = {
  name: [{ required: true, message: '请填写渠道名称', trigger: 'blur' }],
  platform: [{ required: true, message: '请选择来源平台', trigger: 'change' }],
  code: [
    {
      required: true,
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      message: '编码仅可使用小写字母、数字和短横线',
      trigger: 'blur'
    }
  ]
}
const filteredRows = computed(() => {
  const value = query.value.trim().toLowerCase()
  return rows.value.filter(
    (row) =>
      !value || row.name.toLowerCase().includes(value) || row.code.toLowerCase().includes(value)
  )
})
const activeCount = computed(() => rows.value.filter((row) => row.status === 'active').length)
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    if (previewMode.value) {
      const allRows = Acquisition.listAcquisitionChannels().map((row) => ({
        ...row,
        ownerUserId: staffOptions.value.find((staff) => staff.nickname === row.ownerName)?.id
      }))
      totalCount.value = allRows.length
      const start = (pageNo.value - 1) * pageSize.value
      rows.value = allRows.slice(start, start + pageSize.value)
    } else {
      const page = await ChannelApi.getAcquisitionChannelPage({
        pageNo: pageNo.value,
        pageSize: pageSize.value,
        query: query.value.trim() || undefined
      })
      rows.value = page.list.map((row) => ({
        id: row.id,
        name: row.name,
        platform: row.platform,
        code: row.channelCode,
        ownerName: row.ownerName || '',
        ownerUserId: row.ownerUserId,
        attributionWindowDays: row.attributionWindowDays,
        status: row.status,
        createdAt: row.createdAt
      }))
      totalCount.value = page.total
    }
  } catch (error: any) {
    loadError.value = error?.message || '渠道列表加载失败'
    ElMessage.error(error?.message || '渠道列表加载失败')
  } finally {
    loading.value = false
  }
}
function openCreate() {
  Object.assign(form, blank())
  dialogVisible.value = true
}
function search() {
  pageNo.value = 1
  void load()
}
function changePageSize() {
  pageNo.value = 1
  void load()
}
function edit(row: ChannelRow) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    platform: row.platform,
    code: row.code,
    ownerUserId: row.ownerUserId,
    attributionWindowDays: row.attributionWindowDays
  })
  dialogVisible.value = true
}
async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  try {
    if (previewMode.value) {
      Acquisition.saveAcquisitionChannel({
        id: form.id,
        name: form.name,
        platform: form.platform,
        code: form.code,
        ownerName:
          staffOptions.value.find((staff) => staff.id === form.ownerUserId)?.nickname || '',
        attributionWindowDays: form.attributionWindowDays
      })
    } else {
      await ChannelApi.saveAcquisitionChannel({
        id: form.id,
        name: form.name,
        platform: form.platform,
        channelCode: form.code,
        ownerUserId: form.ownerUserId,
        attributionWindowDays: form.attributionWindowDays
      })
    }
    ElMessage.success('渠道已保存')
    dialogVisible.value = false
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败')
  }
}
async function toggle(row: ChannelRow) {
  const status = row.status === 'active' ? 'disabled' : 'active'
  try {
    if (previewMode.value) Acquisition.setAcquisitionChannelStatus(row.id, status)
    else await ChannelApi.setAcquisitionChannelStatus(row.id, status)
    await load()
    ElMessage.success('渠道状态已更新')
  } catch (error: any) {
    ElMessage.error(error?.message || '渠道状态更新失败')
  }
}
function createCode(row: ChannelRow) {
  void router.push({
    path: '/callphone-preview/channel-codes',
    query: { preview: '1', channelId: row.id }
  })
}
function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
function platformLabel(value: string) {
  return (
    (
      { wechat: '微信', douyin: '抖音', website: '官网', offline: '线下物料' } as Record<
        string,
        string
      >
    )[value] || value
  )
}
function platformIcon(value: string) {
  return (
    (
      {
        wechat: 'ep:chat-dot-round',
        douyin: 'ep:video-camera',
        website: 'ep:monitor',
        offline: 'ep:shop'
      } as Record<string, string>
    )[value] || 'ep:connection'
  )
}
onMounted(async () => {
  if (previewMode.value) {
    staffOptions.value = [
      { id: 1, nickname: '林静' } as UserVO,
      { id: 2, nickname: '王小虎' } as UserVO,
      { id: 3, nickname: '周宁' } as UserVO
    ]
  } else {
    try {
      staffOptions.value = await getSimpleUserList()
    } catch {
      staffOptions.value = []
    }
  }
  await load()
})
</script>

<style scoped>
.acquisition-page {
  --el-bg-color: #fff;
  --el-bg-color-page: #f5f7fc;
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;
  --el-fill-color-blank: #fff;
  --el-fill-color-light: #f5f7fa;

  min-height: calc(100vh - 100px);
  padding: 20px;
  color: #293347;
  background: #f5f7fc;
  color-scheme: light;
}

.preview-note {
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
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
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
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 12px 0 18px;
}

.summary div span,
.summary div strong {
  display: block;
}

.summary div span {
  font-size: 12px;
  color: #8792a5;
}

.summary div strong {
  margin-top: 3px;
  font-size: 20px;
  color: #253149;
}

.search {
  width: 260px;
  margin-left: auto;
}

.channel-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.channel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.channel-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.channel-name strong,
.channel-name small {
  display: block;
}

.channel-name small {
  margin-top: 4px;
  font-size: 12px;
  color: #8792a5;
}

.channel-mark {
  display: grid;
  width: 36px;
  height: 36px;
  font-size: 18px;
  color: #3c61d6;
  background: #eff3ff;
  border-radius: 8px;
  place-items: center;
}

.fill {
  width: 100%;
}

.inline-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #8792a5;
}

:global(.el-dialog.acquisition-dialog) {
  --el-bg-color: #fff;
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;
  --el-fill-color-blank: #fff;

  color: #303133;
  background: #fff;
  color-scheme: light;
}

@media (width <= 700px) {
  .acquisition-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .summary {
    flex-wrap: wrap;
    gap: 14px;
  }

  .search {
    width: 100%;
    margin-left: 0;
  }

  .page-heading {
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
