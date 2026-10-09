<template>
  <div class="acquisition-page">
    <el-alert
      v-if="previewMode"
      class="page-note"
      title="本地交互预览"
      description="链接、渠道和访问数据保存在浏览器本地。可编辑、复制或模拟访问；不会产生真实访客或线索归因。"
      type="warning"
      :closable="false"
    />
    <el-alert
      v-else
      class="page-note"
      title="获客链接配置"
      description="公开链接跳转时附加 utm_source 与 cp_ref。落地页服务端可将 cp_ref 作为 sourceCode 写入 Call Phone 线索；本页按当前成员名下的线索统计，不收集独立访客身份、IP 或设备信息。"
      type="info"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div>
          <h1>获客链接</h1>
          <p>绑定来源渠道与 UTM 参数，生成可复制的推广地址。</p>
        </div>
        <el-button type="primary" @click="openCreate">新建获客链接</el-button>
      </header>
      <div class="summary">
        <div
          ><span>本页有效链接</span><strong>{{ activeCount }}</strong></div
        >
        <div>
          <span>{{ previewMode ? '本地累计访问' : '本页累计跳转' }}</span>
          <strong>{{ totalVisits.toLocaleString() }}</strong>
          <small v-if="previewMode">本地演示数据</small>
        </div>
        <div>
          <span>{{ previewMode ? '本地留资' : '线索归因' }}</span>
          <strong>{{ totalLeads.toLocaleString() }}</strong>
          <small>{{ previewMode ? '本地演示数据' : '本页链接、当前成员名下' }}</small>
        </div>
        <el-input
          v-model="query"
          class="search"
          clearable
          placeholder="搜索链接名称"
          @input="previewMode ? filterRows() : undefined"
          @keyup.enter="search"
        />
      </div>
      <el-table v-loading="loading" :data="visibleRows" row-key="id">
        <el-table-column label="链接名称" prop="name" min-width="180" />
        <el-table-column label="目标页面" min-width="260">
          <template #default="{ row }">
            <a :href="row.destinationUrl" target="_blank" rel="noopener noreferrer" class="url">
              {{ row.destinationUrl }}
            </a>
          </template>
        </el-table-column>
        <el-table-column label="来源渠道" min-width="150">
          <template #default="{ row }">
            {{ channelName(row.channelId) }}
            <small class="sub">UTM：{{ row.utmSource }}</small>
          </template>
        </el-table-column>
        <el-table-column label="访问 / 留资" width="140">
          <template #default="{ row }">
            {{ row.visits }} <span class="sub">/ {{ row.leads }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="light">
              {{ row.status === 'active' ? '生效中' : '已停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="edit(row)">编辑</el-button>
            <el-button link type="primary" @click="copy(row)">{{
              previewMode ? '复制 UTM 链接' : '复制跟踪链接'
            }}</el-button>
            <el-button v-if="previewMode" link type="primary" @click="simulate(row)"
              >模拟访问</el-button
            >
            <el-button
              link
              :type="row.status === 'active' ? 'danger' : 'success'"
              @click="toggle(row)"
              >{{ row.status === 'active' ? '停用' : '启用' }}</el-button
            >
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="loadError || '创建获客链接后可复制带来源参数的推广地址'" />
        </template>
      </el-table>
      <div v-if="!previewMode" class="table-footer">
        <span>共 {{ totalCount }} 个获客链接</span>
        <el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          :total="totalCount"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="changePageSize"
        />
      </div>
    </section>

    <el-dialog
      v-model="visible"
      :title="form.id ? '编辑获客链接' : '新建获客链接'"
      width="540px"
      class="marketing-link-dialog"
      append-to-body
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="链接名称" prop="name">
          <el-input v-model="form.name" maxlength="50" placeholder="例如：秋季新品落地页" />
        </el-form-item>
        <el-form-item label="目标落地页" prop="destinationUrl">
          <el-input
            v-model="form.destinationUrl"
            maxlength="2048"
            placeholder="https://example.com/landing"
          />
        </el-form-item>
        <el-form-item label="来源渠道" prop="channelId">
          <el-select
            v-model="form.channelId"
            class="fill"
            popper-class="acquisition-popper"
            placeholder="选择来源渠道"
          >
            <el-option
              v-for="item in channels"
              :key="item.id"
              :label="`${item.name} · ${item.code}`"
              :value="item.id"
              :disabled="item.status !== 'active'"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="UTM 来源" prop="utmSource">
          <el-input v-model="form.utmSource" maxlength="100" placeholder="例如 wechat_feed" />
          <small class="field-hint">仅可用英文字母、数字、点、下划线和短横线。</small>
        </el-form-item>
        <el-alert
          :title="
            previewMode
              ? '复制链接时会保留目标页已有参数，并添加 utm_source 和 cp_ref。'
              : '目标地址仅接受 HTTPS；跳转会保留原有参数并写入 utm_source、cp_ref。落地页服务端可把 cp_ref 作为线索 sourceCode 提交。'
          "
          type="info"
          :closable="false"
        />
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="!availableChannels.length" @click="save"
          >保存链接</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import * as Acquisition from '@/api/callphone/acquisition-preview'
import * as ChannelApi from '@/api/callphone/acquisition/channel'
import * as MarketingLinkApi from '@/api/callphone/acquisition/marketing-link'

defineOptions({ name: 'CallPhoneMarketingLinks' })
const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
type LinkRow = Acquisition.MarketingLink & {
  createdAt: string
  publicCode?: string
  lastClickedAt?: string
  leadCount?: number
}
const rows = ref<LinkRow[]>([])
const channels = ref<Acquisition.AcquisitionChannel[]>([])
const query = ref('')
const visible = ref(false)
const formRef = ref<FormInstance>()
const loading = ref(false)
const loadError = ref('')
const pageNo = ref(1)
const pageSize = ref(20)
const totalCount = ref(0)
const empty = () => ({
  id: undefined as string | undefined,
  name: '',
  destinationUrl: '',
  channelId: '',
  utmSource: ''
})
const form = reactive(empty())
const rules: FormRules = {
  name: [{ required: true, message: '请填写链接名称', trigger: 'blur' }],
  destinationUrl: [
    {
      required: true,
      validator: (_rule, value, callback) => {
        try {
          const url = new URL(value)
          if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
            throw new Error()
          callback()
        } catch {
          callback(new Error('请输入不包含账号密码的有效 HTTPS 落地页'))
        }
      },
      trigger: 'blur'
    }
  ],
  channelId: [{ required: true, message: '请选择渠道', trigger: 'change' }],
  utmSource: [
    { required: true, message: '请填写 UTM 来源', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9._-]+$/, message: 'UTM 来源格式无效', trigger: 'blur' }
  ]
}
const availableChannels = computed(() => channels.value.filter((row) => row.status === 'active'))
const visibleRows = ref<LinkRow[]>([])
const activeCount = computed(() => rows.value.filter((row) => row.status === 'active').length)
const totalVisits = computed(() => rows.value.reduce((sum, row) => sum + row.visits, 0))
const totalLeads = computed(() => rows.value.reduce((sum, row) => sum + row.leads, 0))

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    if (previewMode.value) {
      channels.value = Acquisition.listAcquisitionChannels()
      const allRows = Acquisition.listMarketingLinks()
      totalCount.value = allRows.length
      const offset = (pageNo.value - 1) * pageSize.value
      rows.value = allRows
        .slice(offset, offset + pageSize.value)
        .map((row) => ({ ...row, createdAt: row.createdAt }))
      filterRows()
    } else {
      const [channelPage, linkPage] = await Promise.all([
        ChannelApi.getAcquisitionChannelPage({ pageNo: 1, pageSize: 100 }),
        MarketingLinkApi.getMarketingLinkPage({
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
      rows.value = linkPage.list.map((row) => ({
        id: row.id,
        publicCode: row.publicCode,
        name: row.name,
        destinationUrl: row.destinationUrl,
        channelId: row.channelId,
        utmSource: row.utmSource,
        status: row.status,
        visits: row.clickCount || 0,
        leads: row.leadCount || 0,
        lastClickedAt: row.lastClickedAt,
        createdAt: row.createTime
      }))
      totalCount.value = linkPage.total
      visibleRows.value = rows.value
    }
  } catch (error: any) {
    loadError.value = error?.message || '获客链接加载失败'
    ElMessage.error(loadError.value)
  } finally {
    loading.value = false
  }
}

function filterRows() {
  const needle = query.value.trim().toLowerCase()
  visibleRows.value = rows.value.filter((row) => !needle || row.name.toLowerCase().includes(needle))
}
function search() {
  pageNo.value = 1
  void load()
}
function changePageSize() {
  pageNo.value = 1
  void load()
}
function openCreate() {
  Object.assign(form, empty())
  visible.value = true
}
function edit(row: LinkRow) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    destinationUrl: row.destinationUrl,
    channelId: row.channelId,
    utmSource: row.utmSource
  })
  visible.value = true
}
async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  try {
    if (previewMode.value) {
      Acquisition.saveMarketingLink({ ...form })
    } else {
      await MarketingLinkApi.saveMarketingLink({ ...form })
    }
    ElMessage.success('获客链接已保存')
    visible.value = false
    if (!form.id) pageNo.value = 1
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存链接失败')
  }
}
function channelName(id: string) {
  return channels.value.find((row) => row.id === id)?.name || '渠道已停用/不存在'
}
function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
async function copy(row: LinkRow) {
  try {
    let url: string
    if (previewMode.value) {
      const target = new URL(row.destinationUrl)
      target.searchParams.set('utm_source', row.utmSource)
      target.searchParams.set('cp_ref', row.publicCode || row.id)
      url = target.toString()
    } else {
      if (!row.publicCode) throw new Error('公开跳转码尚未迁移，请完成 v40 数据库升级')
      url = new URL(
        `/admin-api/callphone/public/acquisition-link/${row.publicCode}`,
        window.location.origin
      ).toString()
    }
    await navigator.clipboard.writeText(url)
    ElMessage.success(previewMode.value ? '带来源参数的目标链接已复制' : '跟踪与归因链接已复制')
  } catch (error: any) {
    ElMessage.error(error?.message || '复制失败，请检查浏览器剪贴板权限')
  }
}
function simulate(row: LinkRow) {
  if (!previewMode.value) return
  Acquisition.simulateLinkVisit(row.id)
  void load()
  ElMessage.success('已模拟一次访问，仅更新本地演示统计')
}
async function toggle(row: LinkRow) {
  const status = row.status === 'active' ? 'disabled' : 'active'
  try {
    if (previewMode.value) Acquisition.updateMarketingLink(row.id, { status })
    else await MarketingLinkApi.setMarketingLinkStatus(row.id, status)
    await load()
    ElMessage.success(status === 'active' ? '获客链接已启用' : '获客链接已停用')
  } catch (error: any) {
    ElMessage.error(error?.message || '状态更新失败')
  }
}
watch([previewMode], () => {
  pageNo.value = 1
  void load()
})
onMounted(load)
</script>

<style scoped>
.acquisition-page {
  min-height: calc(100vh - 100px);
  padding: 20px;
  color: #293347;
  background: #f5f7fc;
  color-scheme: light;
}

.page-note {
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
.summary div strong,
.summary div small {
  display: block;
}

.summary div span,
.summary div small {
  font-size: 12px;
  color: #8792a5;
}

.summary div strong {
  margin-top: 3px;
  font-size: 20px;
  color: #253149;
}

.summary div small {
  margin-top: 2px;
}

.search {
  width: 250px;
  margin-left: auto;
}

.url {
  color: #3159d9;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.sub,
.field-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #909bad;
}

.fill {
  width: 100%;
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  font-size: 13px;
  color: #8792a5;
}

:global(.el-dialog.marketing-link-dialog) {
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

  .summary {
    flex-wrap: wrap;
  }

  .search {
    width: 100%;
    margin-left: 0;
  }

  .table-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
