<template>
  <div class="acquisition-page">
    <el-alert
      v-if="previewMode"
      class="page-note"
      title="本地交互预览"
      description="海报草稿、二维码和 PNG 文件仅在此浏览器生成，不会记录真实访问或线索归因。"
      type="warning"
      :closable="false"
    />
    <el-alert
      v-else
      class="page-note"
      title="海报配置已接入服务端"
      description="可保存并维护海报配置。正式投放二维码依赖公开活码落地服务，服务上线前不会生成可投放文件。"
      type="info"
      :closable="false"
    />

    <section class="page-panel">
      <header class="page-heading">
        <div>
          <h1>组合海报</h1>
          <p>选择海报样式、配置推广标题并绑定活码，生成获客物料。</p>
        </div>
        <el-button type="primary" @click="openCreate">新建海报</el-button>
      </header>

      <div class="template-strip">
        <div v-for="item in templates" :key="item.id" class="template-card" :class="item.id">
          <span>{{ item.name }}</span>
          <small>{{ item.subtitle }}</small>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="海报名称" min-width="200">
          <template #default="{ row }">
            <div>
              <strong>{{ row.name }}</strong>
              <small class="sub">{{ row.title }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="模板" width="120">
          <template #default="{ row }">{{ templateName(row.template) }}</template>
        </el-table-column>
        <el-table-column label="绑定活码" min-width="180">
          <template #default="{ row }">{{ codeName(row.trackingCodeId) }}</template>
        </el-table-column>
        <el-table-column label="生成状态" width="120">
          <template #default="{ row }">
            <el-tag
              v-if="row.backendStatus"
              :type="row.backendStatus === 'active' ? 'success' : 'info'"
            >
              {{ row.backendStatus === 'active' ? '配置有效' : '已停用' }}
            </el-tag>
            <el-tag v-else :type="row.status === 'ready' ? 'success' : 'info'">
              {{ row.status === 'ready' ? '已生成' : '待生成' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="previewMode" label="本地下载次数" width="125" prop="downloads" />
        <el-table-column label="操作" width="245" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="edit(row)">编辑</el-button>
            <el-button link type="primary" @click="render(row)">
              {{ previewMode ? (row.status === 'ready' ? '预览' : '生成') : '生成预览' }}
            </el-button>
            <el-button
              v-if="previewMode"
              link
              type="primary"
              :disabled="row.status !== 'ready'"
              @click="download(row)"
              >下载 PNG</el-button
            >
            <el-button
              v-else
              link
              :type="row.backendStatus === 'active' ? 'danger' : 'success'"
              @click="toggle(row)"
            >
              {{ row.backendStatus === 'active' ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="loadError || '选择模板并绑定一个渠道活码，开始制作组合海报'" />
        </template>
      </el-table>
      <div v-if="!previewMode" class="table-footer">
        <span>共 {{ totalCount }} 张海报配置</span>
        <el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          :total="totalCount"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="load"
          @current-change="load"
        />
      </div>
    </section>

    <el-dialog
      v-model="formVisible"
      :title="form.id ? '编辑组合海报' : '新建组合海报'"
      width="520px"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="海报名称" prop="name"
          ><el-input v-model="form.name" maxlength="48"
        /></el-form-item>
        <el-form-item label="海报标题" prop="title">
          <el-input v-model="form.title" maxlength="36" placeholder="例如：扫码预约专属体验" />
        </el-form-item>
        <el-form-item label="海报模板" prop="template">
          <el-radio-group v-model="form.template">
            <el-radio-button v-for="item in templates" :key="item.id" :value="item.id">{{
              item.name
            }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="绑定活码" prop="trackingCodeId">
          <el-select v-model="form.trackingCodeId" class="fill" placeholder="选择已启用活码">
            <el-option
              v-for="code in codes"
              :key="code.id"
              :label="`${code.name} · ${code.status !== 'active' ? '已停用' : !previewMode && !code.landingUrl ? '未配置落地页' : '可投放'}`"
              :value="code.id"
              :disabled="code.status !== 'active' || (!previewMode && !code.landingUrl)"
            />
          </el-select>
        </el-form-item>
        <el-alert
          :title="
            previewMode
              ? '二维码为本地演示内容，不可用于正式投放。'
              : '请选择有效且已配置 HTTPS 落地页的活码。二维码经匿名统计后跳转。'
          "
          type="info"
          :closable="false"
        />
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="
            !codes.some((item) => item.status === 'active' && (previewMode || item.landingUrl))
          "
          @click="save"
          >保存海报</el-button
        >
      </template>
    </el-dialog>

    <el-dialog v-model="previewVisible" title="海报预览" width="460px" align-center>
      <p v-if="!previewMode" class="preview-hint"
        >此二维码匿名统计访问次数后跳转到活码配置的 HTTPS 落地页；不记录访客身份。</p
      >
      <div v-if="previewRow" class="poster-preview" :class="previewRow.template">
        <div class="poster-copy">
          <small>CALL PHONE · {{ channelName(previewRow.trackingCodeId) }}</small>
          <h2>{{ previewRow.title }}</h2>
          <p>扫码了解详情<br />专属顾问为您服务</p>
        </div>
        <img v-if="qrUrl" :src="qrUrl" :alt="previewMode ? '演示二维码' : '可投放活码二维码'" />
        <div v-else class="qr-placeholder">请先配置可用落地页</div>
        <strong>{{ codeName(previewRow.trackingCodeId) }}</strong>
      </div>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
        <el-button type="primary" :disabled="!qrUrl" @click="download(previewRow!)"
          >下载 PNG</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import QRCode from 'qrcode'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import * as Acquisition from '@/api/callphone/acquisition-preview'
import * as TrackingCodeApi from '@/api/callphone/acquisition/tracking-code'
import * as PosterApi from '@/api/callphone/acquisition/poster-composition'

defineOptions({ name: 'CallPhonePosterCompositions' })

const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
const templates = [
  { id: 'sunset', name: '暖橙', subtitle: '亲和 · 促转化' },
  { id: 'ocean', name: '清爽蓝', subtitle: '专业 · 清晰' },
  { id: 'mint', name: '薄荷绿', subtitle: '轻量 · 自然' }
]
type PosterRow = Omit<Acquisition.PosterComposition, 'downloads'> & {
  downloads?: number
  backendStatus?: 'active' | 'disabled'
}
type CodeOption = {
  id: string
  name: string
  status: 'active' | 'disabled'
  channelId: string
  publicCode?: string
  landingUrl?: string
}
const rows = ref<PosterRow[]>([])
const codes = ref<CodeOption[]>([])
const formVisible = ref(false)
const previewVisible = ref(false)
const loading = ref(false)
const loadError = ref('')
const totalCount = ref(0)
const pageNo = ref(1)
const pageSize = ref(20)
const formRef = ref<FormInstance>()
const previewRow = ref<PosterRow>()
const qrUrl = ref('')
const empty = () => ({
  id: undefined as string | undefined,
  name: '',
  title: '扫码预约专属体验',
  template: 'sunset',
  trackingCodeId: ''
})
const form = reactive(empty())
const rules: FormRules = {
  name: [{ required: true, message: '请填写海报名称', trigger: 'blur' }],
  title: [{ required: true, message: '请填写海报标题', trigger: 'blur' }],
  trackingCodeId: [{ required: true, message: '请选择渠道活码', trigger: 'change' }]
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    if (previewMode.value) {
      rows.value = Acquisition.listPosterCompositions()
      codes.value = [
        ...Acquisition.listTrackingCodes('channel'),
        ...Acquisition.listTrackingCodes('employee'),
        ...Acquisition.listTrackingCodes('store'),
        ...Acquisition.listTrackingCodes('visitor_identification')
      ]
      totalCount.value = rows.value.length
      return
    }
    const codePages = await Promise.all(
      (['channel', 'employee', 'store', 'visitor_identification'] as const).map((codeType) =>
        TrackingCodeApi.getTrackingCodePage({ codeType, pageNo: 1, pageSize: 100 })
      )
    )
    codes.value = codePages.flatMap((page) =>
      page.list.map((code) => ({
        id: code.id,
        name: code.name,
        status: code.status,
        channelId: code.channelId,
        publicCode: code.publicCode,
        landingUrl: code.landingUrl
      }))
    )
    const page = await PosterApi.getPosterCompositionPage({
      pageNo: pageNo.value,
      pageSize: pageSize.value
    })
    rows.value = page.list.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      template: row.templateId,
      trackingCodeId: row.trackingCodeId,
      status: 'draft',
      createdAt: row.createTime,
      backendStatus: row.status
    }))
    totalCount.value = page.total
  } catch (error: any) {
    loadError.value = error?.message || '海报配置加载失败'
    ElMessage.error(loadError.value)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  Object.assign(form, empty())
  formVisible.value = true
}
function edit(row: PosterRow) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    title: row.title,
    template: row.template,
    trackingCodeId: row.trackingCodeId
  })
  formVisible.value = true
}
async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  try {
    if (previewMode.value) {
      Acquisition.savePosterComposition({
        id: form.id,
        name: form.name,
        title: form.title,
        template: form.template,
        trackingCodeId: form.trackingCodeId
      })
    } else {
      await PosterApi.savePosterComposition({
        id: form.id,
        name: form.name,
        title: form.title,
        templateId: form.template as 'sunset' | 'ocean' | 'mint',
        trackingCodeId: form.trackingCodeId
      })
    }
    ElMessage.success('海报配置已保存')
    formVisible.value = false
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '海报配置保存失败')
  }
}
function findCode(id: string) {
  return codes.value.find((item) => item.id === id)
}
function codeName(id: string) {
  return findCode(id)?.name || '活码已删除'
}
function channelName(id: string) {
  const code = findCode(id)
  if (!code) return '渠道'
  return previewMode.value
    ? Acquisition.getAcquisitionChannel(code.channelId)?.name || '渠道'
    : '获客渠道'
}
function templateName(id: string) {
  return templates.find((item) => item.id === id)?.name || id
}
function trackingCodeUrl(code: CodeOption) {
  if (previewMode.value) return `https://go.callphone.local/t/${code.id}`
  const baseUrl = String(import.meta.env.VITE_BASE_URL || window.location.origin).replace(
    /\/+$/,
    ''
  )
  return `${baseUrl}/admin-api/callphone/public/tracking-code/${code.publicCode || ''}`
}
async function render(row: PosterRow) {
  const code = findCode(row.trackingCodeId)
  if (!code || code.status !== 'active' || (!previewMode.value && !code.landingUrl)) {
    ElMessage.warning('请先绑定已启用且配置 HTTPS 落地页的活码')
    return
  }
  if (previewMode.value) {
    Acquisition.renderPoster(row.id)
    await load()
    previewRow.value = rows.value.find((item) => item.id === row.id)
  } else previewRow.value = row
  if (!previewRow.value) return
  qrUrl.value = await QRCode.toDataURL(trackingCodeUrl(code), {
    width: 220,
    margin: 1
  })
  previewVisible.value = true
}
async function download(row: PosterRow) {
  const code = findCode(row.trackingCodeId)
  if (!code || code.status !== 'active' || (!previewMode.value && !code.landingUrl)) {
    ElMessage.warning('请先绑定已启用且配置 HTTPS 落地页的活码')
    return
  }
  const data = await QRCode.toDataURL(trackingCodeUrl(code), {
    width: 420,
    margin: 1
  })
  const image = new Image()
  image.src = data
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('二维码生成失败'))
  })
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 1200
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const colors = (
    {
      sunset: ['#fff0e5', '#d5653b'],
      ocean: ['#e9f3ff', '#315ecb'],
      mint: ['#e8f8f1', '#238d69']
    } as Record<string, string[]>
  )[row.template] || ['#f4f5f7', '#315ecb']
  ctx.fillStyle = colors[0]
  ctx.fillRect(0, 0, 900, 1200)
  ctx.fillStyle = colors[1]
  ctx.fillRect(0, 0, 900, 32)
  ctx.fillStyle = '#263449'
  ctx.font = 'bold 58px sans-serif'
  ctx.fillText(row.title, 80, 205, 740)
  ctx.fillStyle = '#69778c'
  ctx.font = '30px sans-serif'
  ctx.fillText('扫码了解详情 · 专属顾问为您服务', 80, 278)
  ctx.drawImage(image, 240, 380, 420, 420)
  ctx.fillStyle = '#293347'
  ctx.font = 'bold 27px sans-serif'
  ctx.fillText(code?.name || 'Call Phone', 80, 910)
  ctx.fillStyle = '#8190a2'
  ctx.font = '22px sans-serif'
  ctx.fillText(`CALL PHONE  /  ${channelName(row.trackingCodeId)}`, 80, 972)
  const anchor = document.createElement('a')
  anchor.href = canvas.toDataURL('image/png')
  anchor.download = `${row.name}.png`
  anchor.click()
  if (previewMode.value) {
    Acquisition.downloadPoster(row.id)
    await load()
  }
  ElMessage.success(previewMode.value ? '本地演示海报 PNG 已下载' : '可投放海报 PNG 已下载')
}
async function toggle(row: PosterRow) {
  try {
    const status = row.backendStatus === 'active' ? 'disabled' : 'active'
    await PosterApi.setPosterCompositionStatus(row.id, status)
    await load()
    ElMessage.success('海报状态已更新')
  } catch (error: any) {
    ElMessage.error(error?.message || '海报状态更新失败')
  }
}

onMounted(load)
</script>

<style scoped>
.acquisition-page {
  min-height: calc(100vh - 100px);
  padding: 20px;
  color: #293347;
  background: #f5f7fc;
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
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
}

.page-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7a8598;
}

.template-strip {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}

.template-card {
  display: flex;
  height: 95px;
  min-width: 180px;
  padding: 17px;
  color: #914826;
  background: linear-gradient(140deg, #fff0e5, #ffd2ac);
  border-radius: 8px;
  flex-direction: column;
  justify-content: space-between;
}

.template-card.ocean {
  color: #3153a2;
  background: linear-gradient(140deg, #e9f3ff, #bad6ff);
}

.template-card.mint {
  color: #277254;
  background: linear-gradient(140deg, #e8f8f1, #b8e8d5);
}

.template-card small,
.sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #8490a1;
}

.fill {
  width: 100%;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  color: #7a8598;
}

.poster-preview {
  display: flex;
  width: 330px;
  height: 440px;
  padding: 26px;
  margin: 0 auto 8px;
  color: #914826;
  background: linear-gradient(150deg, #fff0e5, #ffd2ac);
  border-radius: 10px;
  flex-direction: column;
  justify-content: space-between;
}

.poster-preview.ocean {
  color: #3153a2;
  background: linear-gradient(150deg, #e9f3ff, #bad6ff);
}

.poster-preview.mint {
  color: #277254;
  background: linear-gradient(150deg, #e8f8f1, #b8e8d5);
}

.poster-copy small {
  font-size: 10px;
  letter-spacing: 1px;
}

.poster-copy h2 {
  margin: 18px 0 8px;
  font-size: 25px;
  line-height: 1.35;
}

.poster-copy p {
  font-size: 13px;
  line-height: 1.7;
}

.poster-preview img,
.qr-placeholder {
  width: 145px;
  height: 145px;
  background: #fff;
  border-radius: 7px;
  align-self: center;
}

.poster-preview img {
  padding: 6px;
}

.qr-placeholder {
  display: grid;
  padding: 16px;
  font-size: 12px;
  color: #7a8598;
  text-align: center;
  place-items: center;
}

.poster-preview > strong {
  font-size: 12px;
  text-align: center;
}

.preview-hint {
  color: #7a8598;
}

:global(.el-dialog),
:global(.el-popper),
:global(.el-select-dropdown),
:global(.el-color-picker__panel) {
  --el-bg-color: #fff;
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color-light: #e4e7ed;
}

@media (width <= 700px) {
  .acquisition-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .template-strip {
    flex-wrap: wrap;
  }

  .template-card {
    min-width: 120px;
    flex: 1;
  }

  .poster-preview {
    width: 280px;
    height: 390px;
  }

  .table-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}
</style>
