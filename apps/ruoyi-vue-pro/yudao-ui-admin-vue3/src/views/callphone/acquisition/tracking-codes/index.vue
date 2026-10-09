<template>
  <div class="acquisition-page">
    <el-alert
      v-if="previewMode"
      class="preview-note"
      title="本地交互预览"
      description="二维码、渠道与效果数据保存在此浏览器，尚未连接客户服务器。可创建活码、预览并模拟扫码，刷新后记录仍保留。"
      type="warning"
      :closable="false"
    />
    <el-alert
      v-else
      class="preview-note"
      title="真实活码"
      description="扫码跳转会附加来源编码；落地页创建线索时需将 cp_ref 写入来源字段。本页只统计当前用户负责且来源码匹配的线索数量，不展示客户姓名或手机号；匿名扫码仍不记录 IP、设备标识或 UA。"
      type="info"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div
          ><h1>{{ title }}</h1
          ><p>{{ description }}</p></div
        >
        <el-button type="primary" @click="openCreate">{{ createLabel }}</el-button>
      </header>
      <div class="overview-row">
        <article class="overview-card"
          ><span>本页有效活码</span><strong>{{ activeCount }}</strong></article
        >
        <article class="overview-card"
          ><span>{{ previewMode ? '本页演示扫码' : '本页匿名扫码' }}</span
          ><strong>{{ totalScans.toLocaleString() }}</strong
          ><small>{{ previewMode ? '仅本地演示数据' : '累计次数，不代表独立访客' }}</small></article
        >
        <article class="overview-card"
          ><span>{{ previewMode ? '新增线索' : '本页本人名下线索' }}</span
          ><strong>{{ totalLeads.toLocaleString() }}</strong
          ><small>{{
            previewMode ? '本地演示数据' : '按来源码汇总，不展示个人信息'
          }}</small></article
        >
        <el-input
          v-model="query"
          clearable
          class="search-box"
          :placeholder="type === 'employee' ? '搜索员工或活码名称' : '搜索活码名称或渠道'"
          @input="previewMode ? filterRows() : undefined"
          @keyup.enter="search"
        />
      </div>
      <el-table v-loading="loading" :data="visibleRows" row-key="id">
        <el-table-column label="活码名称" min-width="190"
          ><template #default="{ row }"
            ><div class="code-name"
              ><span class="qr-icon"><Icon icon="ep:full-screen" /></span
              ><div
                ><strong>{{ row.name }}</strong
                ><small>{{ row.id }}</small></div
              ></div
            ></template
          ></el-table-column
        >
        <el-table-column v-if="type === 'employee'" label="归属员工" min-width="120"
          ><template #default="{ row }">{{ row.employeeName || '—' }}</template></el-table-column
        >
        <el-table-column v-if="type === 'store'" label="归属门店" min-width="120"
          ><template #default="{ row }">{{ row.storeName || '—' }}</template></el-table-column
        >
        <el-table-column label="归属渠道" min-width="150"
          ><template #default="{ row }"
            ><div>{{ channelName(row.channelId) }}</div
            ><small class="muted">{{ channelCode(row.channelId) }}</small></template
          ></el-table-column
        >
        <el-table-column v-if="previewMode" label="扫码 / 新增" width="150"
          ><template #default="{ row }"
            ><strong>{{ row.scans }}</strong
            ><span class="muted"> / {{ row.leads }}</span></template
          ></el-table-column
        >
        <el-table-column v-else label="扫码 / 本人线索" width="150"
          ><template #default="{ row }"
            ><strong>{{ row.scans.toLocaleString() }}</strong
            ><span class="muted"> / {{ row.leads.toLocaleString() }}</span></template
          ></el-table-column
        >
        <el-table-column v-if="!previewMode" label="追踪编码" prop="publicCode" min-width="150" />
        <el-table-column label="状态" width="96"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="light">{{
              row.status === 'active' ? '使用中' : '已停用'
            }}</el-tag
            ><small v-if="!previewMode && !row.landingUrl" class="muted"
              >需补落地页</small
            ></template
          ></el-table-column
        >
        <el-table-column label="创建时间" min-width="160"
          ><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column
        >
        <el-table-column label="操作" width="270" fixed="right"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              :disabled="!previewMode && !row.landingUrl"
              @click="showCode(row)"
              >查看二维码</el-button
            ><el-button link type="primary" @click="edit(row)">编辑</el-button
            ><el-button
              link
              :type="row.status === 'active' ? 'danger' : 'success'"
              @click="toggle(row)"
              >{{ row.status === 'active' ? '停用' : '启用' }}</el-button
            ></template
          ></el-table-column
        >
        <template #empty
          ><el-empty description="还没有活码，创建后可在此管理归属和效果"
        /></template>
      </el-table>
      <div v-if="!previewMode" class="table-footer"
        ><span>共 {{ totalCount }} 个活码</span
        ><el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          :total="totalCount"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="changePageSize"
      /></div>
    </section>

    <el-dialog
      v-model="formVisible"
      :title="form.id ? '编辑活码' : createLabel"
      width="540px"
      class="tracking-dialog"
      append-to-body
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="活码名称" prop="name"
          ><el-input v-model="form.name" maxlength="48" placeholder="例如：十月新品朋友圈"
        /></el-form-item>
        <el-form-item v-if="type === 'employee'" label="员工" prop="employeeId"
          ><el-select
            v-model="form.employeeId"
            class="fill"
            popper-class="acquisition-popper"
            placeholder="选择归属员工"
            ><el-option
              v-for="staff in staffOptions"
              :key="staff.id"
              :label="staff.name"
              :value="staff.id" /></el-select
        ></el-form-item>
        <el-form-item v-if="type === 'store'" label="门店" prop="storeName"
          ><el-select
            v-if="previewMode"
            v-model="form.storeName"
            class="fill"
            popper-class="acquisition-popper"
            placeholder="选择归属门店"
            ><el-option
              v-for="store in storeOptions"
              :key="store"
              :label="store"
              :value="store" /></el-select
          ><el-input v-else v-model="form.storeName" maxlength="64" placeholder="填写门店名称"
        /></el-form-item>
        <el-form-item label="归属渠道" prop="channelId"
          ><el-select
            v-model="form.channelId"
            class="fill"
            popper-class="acquisition-popper"
            placeholder="选择来源渠道"
            ><el-option
              v-for="channel in availableChannels"
              :key="channel.id"
              :label="`${channel.name} · ${channel.code}`"
              :value="channel.id" /></el-select
          ><small v-if="!availableChannels.length" class="form-tip"
            >请先在「平台渠道」页面创建并启用渠道。</small
          ></el-form-item
        >
        <el-form-item label="扫码后访问的 HTTPS 落地页" prop="landingUrl"
          ><el-input
            v-model="form.landingUrl"
            maxlength="2048"
            placeholder="https://example.com/contact"
          /><small class="form-tip"
            >服务端只做匿名次数统计后重定向，并附加 utm_source、cp_ref、cp_type 参数。</small
          >
        </el-form-item>
        <el-form-item label="扫码欢迎语"
          ><el-input
            v-model="form.welcomeText"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="配置扫码后的欢迎语"
        /></el-form-item>
        <el-form-item v-if="type === 'visitor_identification'" label="识客匹配规则"
          ><el-select v-model="form.matchRule" class="fill" popper-class="acquisition-popper"
            ><el-option label="手机号精确匹配（尚未接入）" value="phone_exact" disabled /><el-option
              label="企业微信身份关联（尚未接入）"
              value="wecom_identity"
              disabled /><el-option
              label="仅记录匿名访问，不自动匹配"
              value="anonymous_only" /></el-select
          ><small class="form-tip"
            >当前只支持匿名访问统计。历史配置若选择了未接入的身份识别规则，请改为匿名访问后再保存。</small
          ></el-form-item
        >
        <el-alert
          title="停用会阻止后续扫码并保留历史汇总；匿名计数按天保存，不记录访客身份。"
          type="info"
          :closable="false"
        />
      </el-form>
      <template #footer
        ><el-button @click="formVisible = false">取消</el-button
        ><el-button type="primary" :disabled="!canSave" @click="save">保存活码</el-button></template
      >
    </el-dialog>

    <el-dialog
      v-model="qrVisible"
      title="活码预览"
      width="420px"
      align-center
      class="tracking-dialog"
      append-to-body
    >
      <div v-if="selected" class="qr-preview"
        ><img v-if="qrDataUrl" :src="qrDataUrl" alt="活码二维码" /><div v-else class="qr-loading"
          ><el-icon class="is-loading"><Loading /></el-icon>正在生成二维码</div
        ><strong>{{ selected.name }}</strong
        ><span
          >{{ channelName(selected.channelId)
          }}<template v-if="selected.employeeName"> · {{ selected.employeeName }}</template></span
        ><code>{{ qrContent }}</code
        ><div class="qr-actions"
          ><el-button @click="copyCode">复制二维码链接</el-button
          ><el-button
            type="primary"
            :disabled="selected.status !== 'active' || (!previewMode && !selected.landingUrl)"
            @click="downloadCode"
            >下载二维码</el-button
          ><el-button
            v-if="previewMode"
            :disabled="selected.status !== 'active'"
            @click="simulateScan"
            >模拟扫码</el-button
          ></div
        ><el-alert
          v-if="!previewMode"
          title="线上二维码只统计匿名访问次数，再跳转到配置的 HTTPS 页面；不在业务库保存访客身份。"
          type="warning"
          :closable="false"
        /><small v-if="previewMode">模拟动作仅更新本地演示数据，不会生成真实访客记录。</small></div
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import * as Acquisition from '@/api/callphone/acquisition-preview'
import * as ChannelApi from '@/api/callphone/acquisition/channel'
import * as TrackingCodeApi from '@/api/callphone/acquisition/tracking-code'
import { getSimpleUserList, type UserVO } from '@/api/system/user'

defineOptions({ name: 'CallPhoneTrackingCodes' })
const route = useRoute()
const routeCodeType = computed(() =>
  String(route.meta.codeType || route.path.split('/').pop() || 'channel')
)
const type = computed<Acquisition.TrackingCode['type']>(
  () =>
    (
      ({
        'channel-codes': 'channel',
        'employee-codes': 'employee',
        'store-codes': 'store',
        'visitor-codes': 'visitor_identification'
      }) as Record<string, Acquisition.TrackingCode['type']>
    )[routeCodeType.value] ||
    (['employee', 'store', 'visitor_identification'].includes(routeCodeType.value)
      ? (routeCodeType.value as Acquisition.TrackingCode['type'])
      : 'channel')
)
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
const title = computed(
  () =>
    (
      ({
        channel: '渠道活码',
        employee: '员工活码',
        store: '门店活码',
        visitor_identification: '识客活码'
      }) as Record<string, string>
    )[type.value]
)
const description = computed(
  () =>
    (
      ({
        channel: '按渠道创建二维码，匿名统计扫码次数并跳转至已配置的 HTTPS 页面。',
        employee:
          '为员工生成专属二维码，匿名访问按员工与来源渠道汇总；落地页可用来源编码关联线索。',
        store: '为门店创建专属二维码，匿名访问按门店与来源渠道汇总；落地页可用来源编码关联线索。',
        visitor_identification:
          '设置识客策略。当前版本只统计匿名次数，不执行身份识别，也不采集访客标识。'
      }) as Record<string, string>
    )[type.value]
)
const createLabel = computed(() => `创建${title.value}`)
type TrackingRow = Acquisition.TrackingCode & { publicCode?: string; landingUrl?: string }
const loading = ref(false),
  query = ref(''),
  rows = ref<TrackingRow[]>([]),
  channels = ref<Acquisition.AcquisitionChannel[]>([]),
  pageNo = ref(1),
  pageSize = ref(20),
  totalCount = ref(0),
  loadError = ref('')
const visibleRows = ref<Acquisition.TrackingCode[]>([]),
  formVisible = ref(false),
  qrVisible = ref(false),
  selected = ref<Acquisition.TrackingCode>(),
  qrDataUrl = ref(''),
  formRef = ref<FormInstance>()
const staffOptions = ref<Array<{ id: string | number; name: string }>>([])
const storeOptions = ['上海徐汇体验店', '上海浦东旗舰店', '杭州滨江服务中心']
const emptyForm = () => ({
  id: undefined as string | undefined,
  name: '',
  channelId: '',
  employeeId: '',
  employeeName: '',
  storeName: '',
  matchRule: 'anonymous_only',
  welcomeText: '',
  landingUrl: ''
})
const form = reactive(emptyForm())
const rules: FormRules = {
  name: [{ required: true, message: '请填写活码名称', trigger: 'blur' }],
  channelId: [{ required: true, message: '请选择归属渠道', trigger: 'change' }],
  employeeId: [
    {
      validator: (_rule, value, callback) => {
        if (type.value === 'employee' && !value) callback(new Error('请选择员工'))
        else callback()
      },
      trigger: 'change'
    }
  ],
  storeName: [
    {
      validator: (_rule, value, callback) => {
        if (type.value === 'store' && !value) callback(new Error('请选择门店'))
        else callback()
      },
      trigger: 'change'
    }
  ],
  landingUrl: [
    { required: true, message: '请填写 HTTPS 落地页地址', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          const parsed = new URL(String(value))
          if (
            parsed.protocol !== 'https:' ||
            !parsed.hostname ||
            parsed.username ||
            parsed.password
          ) {
            callback(new Error('落地页必须使用 HTTPS，且不能包含账号密码'))
          } else callback()
        } catch {
          callback(new Error('请输入有效的 HTTPS 地址'))
        }
      },
      trigger: 'blur'
    }
  ]
}
const availableChannels = computed(() => channels.value.filter((item) => item.status === 'active'))
const canSave = computed(
  () =>
    availableChannels.value.length > 0 &&
    (type.value !== 'visitor_identification' || form.matchRule === 'anonymous_only')
)
const activeCount = computed(() => rows.value.filter((row) => row.status === 'active').length)
const totalScans = computed(() => rows.value.reduce((sum, row) => sum + row.scans, 0))
const totalLeads = computed(() => rows.value.reduce((sum, row) => sum + row.leads, 0))
const qrContent = computed(() =>
  selected.value
    ? previewMode.value
      ? `https://go.callphone.local/t/${selected.value.id}`
      : `${String(import.meta.env.VITE_BASE_URL || window.location.origin).replace(/\/+$/, '')}/admin-api/callphone/public/tracking-code/${selected.value.publicCode || ''}`
    : ''
)
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    if (previewMode.value) {
      channels.value = Acquisition.listAcquisitionChannels()
      const allRows = Acquisition.listTrackingCodes(type.value)
      totalCount.value = allRows.length
      const offset = (pageNo.value - 1) * pageSize.value
      rows.value = allRows.slice(offset, offset + pageSize.value)
      filterRows()
    } else {
      const [channelPage, codePage] = await Promise.all([
        ChannelApi.getAcquisitionChannelPage({ pageNo: 1, pageSize: 100 }),
        TrackingCodeApi.getTrackingCodePage({
          codeType: type.value,
          pageNo: pageNo.value,
          pageSize: pageSize.value,
          query: query.value.trim() || undefined
        })
      ])
      channels.value = channelPage.list.map((row) => ({
        id: row.id,
        name: row.name,
        platform: row.platform,
        code: row.channelCode,
        ownerName: row.ownerName || '',
        attributionWindowDays: row.attributionWindowDays,
        status: row.status,
        createdAt: row.createdAt
      }))
      rows.value = codePage.list.map((row) => ({
        id: row.id,
        publicCode: row.publicCode,
        name: row.name,
        type: row.codeType,
        channelId: row.channelId,
        employeeId: row.employeeId ? String(row.employeeId) : undefined,
        employeeName: row.employeeName,
        storeName: row.storeName,
        matchRule: row.matchRule,
        welcomeText: row.welcomeText,
        landingUrl: row.landingUrl || '',
        status: row.status,
        scans: row.scans || 0,
        leads: row.leads || 0,
        createdAt: row.createTime
      }))
      totalCount.value = codePage.total
      visibleRows.value = rows.value
    }
  } catch (error: any) {
    loadError.value = error?.message || '活码列表加载失败'
    ElMessage.error(loadError.value)
  } finally {
    loading.value = false
  }
}
function filterRows() {
  const needle = query.value.trim().toLowerCase()
  visibleRows.value = rows.value.filter(
    (row) =>
      !needle ||
      row.name.toLowerCase().includes(needle) ||
      (row.employeeName || '').toLowerCase().includes(needle) ||
      channelName(row.channelId).toLowerCase().includes(needle)
  )
}
function search() {
  pageNo.value = 1
  void load()
}
function channelName(id: string) {
  return channels.value.find((item) => item.id === id)?.name || '渠道已停用/不存在'
}
function channelCode(id: string) {
  return channels.value.find((item) => item.id === id)?.code || ''
}
function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
function openCreate() {
  Object.assign(form, emptyForm(), { channelId: String(route.query.channelId || '') })
  formVisible.value = true
}
function edit(row: Acquisition.TrackingCode) {
  Object.assign(form, {
    ...emptyForm(),
    id: row.id,
    name: row.name,
    channelId: row.channelId,
    employeeId: row.employeeId || '',
    employeeName: row.employeeName || '',
    storeName: row.storeName || '',
    matchRule: row.matchRule || 'anonymous_only',
    welcomeText: row.welcomeText,
    landingUrl: row.landingUrl || ''
  })
  formVisible.value = true
}
async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  try {
    const staff = staffOptions.value.find((item) => String(item.id) === String(form.employeeId))
    if (previewMode.value)
      Acquisition.saveTrackingCode({
        ...form,
        type: type.value,
        employeeName: type.value === 'employee' ? staff?.name || '' : undefined
      })
    else
      await TrackingCodeApi.saveTrackingCode({
        id: form.id,
        name: form.name,
        codeType: type.value,
        channelId: form.channelId,
        employeeId: type.value === 'employee' ? Number(form.employeeId) : undefined,
        storeName: type.value === 'store' ? form.storeName : undefined,
        matchRule: type.value === 'visitor_identification' ? form.matchRule : undefined,
        welcomeText: form.welcomeText,
        landingUrl: form.landingUrl
      })
    ElMessage.success('活码配置已保存')
    formVisible.value = false
    if (!form.id) pageNo.value = 1
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败')
  }
}
async function toggle(row: TrackingRow) {
  const status = row.status === 'active' ? 'disabled' : 'active'
  try {
    const updated = previewMode.value
      ? (Acquisition.updateTrackingCode(row.id, { status }), true)
      : await TrackingCodeApi.setTrackingCodeStatus(row.id, status)
    if (!updated) {
      ElMessage.error('请先配置 HTTPS 落地页，再启用活码')
      return
    }
    ElMessage.success(status === 'active' ? '活码已启用' : '活码已停用')
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '活码状态更新失败')
  }
}
function changePageSize() {
  pageNo.value = 1
  void load()
}
async function showCode(row: Acquisition.TrackingCode) {
  if (!previewMode.value && !row.landingUrl) {
    ElMessage.warning('请先编辑并配置 HTTPS 落地页')
    return
  }
  selected.value = row
  qrDataUrl.value = ''
  qrVisible.value = true
  try {
    qrDataUrl.value = await QRCode.toDataURL(qrContent.value, {
      width: 220,
      margin: 2,
      color: { dark: '#18253b', light: '#ffffff' }
    })
  } catch {
    ElMessage.error('二维码生成失败')
  }
}
async function copyCode() {
  await navigator.clipboard.writeText(qrContent.value)
  ElMessage.success('二维码链接已复制')
}
function downloadCode() {
  if (!qrDataUrl.value || !selected.value) return
  const link = document.createElement('a')
  link.href = qrDataUrl.value
  link.download = `${selected.value.name || 'tracking-code'}.png`
  link.click()
}
function simulateScan() {
  if (!selected.value || !previewMode.value) return
  const id = selected.value.id
  Acquisition.simulateTrackingScan(id)
  ElMessage.success('已模拟扫码；统计数据已在本地更新')
  void load().then(() => {
    selected.value = rows.value.find((row) => row.id === id)
  })
}
watch([type, previewMode], () => {
  pageNo.value = 1
  void load()
})
onMounted(async () => {
  if (previewMode.value)
    staffOptions.value = [
      { id: 'staff-1', name: '林静' },
      { id: 'staff-2', name: '王小虎' },
      { id: 'staff-3', name: '周宁' }
    ]
  else {
    try {
      staffOptions.value = (await getSimpleUserList()).map((user: UserVO) => ({
        id: user.id,
        name: user.nickname
      }))
    } catch {
      staffOptions.value = []
    }
  }
  await load()
})
</script>

<style scoped>
.acquisition-page {
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

.overview-row {
  display: flex;
  align-items: stretch;
  gap: 14px;
  margin-bottom: 16px;
}

.overview-card {
  min-width: 140px;
  padding: 12px 16px;
  border: 1px solid #e8ecf3;
  border-radius: 8px;
}

.overview-card span,
.overview-card small {
  display: block;
  font-size: 12px;
  color: #8792a5;
}

.overview-card strong {
  display: block;
  margin-top: 6px;
  font-size: 21px;
  color: #253149;
}

.overview-card small {
  margin-top: 2px;
}

.search-box {
  width: 260px;
  margin-left: auto;
  align-self: center;
}

.code-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.code-name strong,
.code-name small {
  display: block;
}

.code-name small {
  margin-top: 4px;
  font-size: 11px;
  color: #9aa3b1;
}

.qr-icon {
  display: grid;
  width: 36px;
  height: 36px;
  color: #3558cc;
  background: #eff3ff;
  border-radius: 8px;
  place-items: center;
}

.muted,
.form-tip {
  font-size: 12px;
  color: #929cad;
}

.fill {
  width: 100%;
}

.form-tip {
  display: block;
  margin-top: 6px;
}

.qr-preview {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 9px;
  padding: 4px 0 12px;
}

.qr-preview img {
  width: 220px;
  height: 220px;
}

.qr-loading {
  display: grid;
  width: 220px;
  height: 220px;
  color: #8993a6;
  background: #f6f8fb;
  place-items: center;
}

.qr-preview strong {
  font-size: 16px;
}

.qr-preview > span {
  font-size: 13px;
  color: #687489;
}

.qr-preview code {
  padding: 6px 10px;
  font-size: 12px;
  color: #526077;
  background: #f4f6fa;
  border-radius: 5px;
}

.qr-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.qr-preview > small {
  font-size: 11px;
  color: #929cad;
  text-align: center;
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  font-size: 13px;
  color: #8792a5;
}

:global(.el-dialog.tracking-dialog) {
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

:global(.el-popper.acquisition-popper) {
  --el-bg-color-overlay: #fff;
  --el-text-color-regular: #606266;
  --el-fill-color-light: #f5f7fa;

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

  .overview-row {
    flex-wrap: wrap;
  }

  .search-box {
    width: 100%;
    margin-left: 0;
  }

  .page-heading {
    align-items: flex-start;
    gap: 12px;
  }

  .table-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
