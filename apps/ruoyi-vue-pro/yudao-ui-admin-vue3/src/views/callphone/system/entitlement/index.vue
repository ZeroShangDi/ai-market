<template>
  <main class="entitlement-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览"
      description="预览不连接授权服务，也不显示虚构的套餐或额度数据。"
      type="warning"
      :closable="false"
    />

    <header class="page-heading">
      <div>
        <h1>账户与授权</h1>
        <p>查看 Call Phone 核心服务的授权状态与功能额度。</p>
      </div>
      <div class="heading-actions">
        <el-button :loading="loading" :disabled="previewMode" @click="load(true)">
          <Icon icon="ep:refresh" />刷新授权
        </el-button>
        <el-button v-if="snapshot.billingUrl" type="primary" @click="openBilling">
          续期与账单<Icon icon="ep:top-right" />
        </el-button>
      </div>
    </header>

    <section class="privacy-note">
      <Icon icon="ep:lock" />
      <span
        >客户姓名、手机号、通话记录和业务内容保存在本地；本页只向核心服务查询授权摘要。核心 AI
        能力由服务端再次验权。</span
      >
    </section>

    <section class="summary-grid">
      <article class="plan-card">
        <div class="plan-topline">
          <span class="eyebrow">当前方案</span>
          <el-tag :type="statusType" effect="light">{{ statusLabel }}</el-tag>
        </div>
        <template v-if="snapshot.state === 'available'">
          <h2>{{ snapshot.planName || '未命名方案' }}</h2>
          <span class="plan-code">{{ snapshot.planCode || '—' }}</span>
          <div class="plan-meta">
            <span>授权到期</span>
            <strong>{{ formatDate(snapshot.expiresAt) }}</strong>
          </div>
        </template>
        <el-empty v-else :image-size="72" :description="emptyTitle" />
      </article>

      <article class="device-card">
        <div class="card-title"><Icon icon="ep:iphone" /><strong>已配对手机</strong></div>
        <template v-if="snapshot.state === 'available'">
          <div class="device-count">
            <strong>{{ snapshot.pairedDeviceCount ?? '—' }}</strong>
            <span>/ {{ snapshot.pairedDeviceLimit ?? '不限' }} 台</span>
          </div>
          <el-progress
            v-if="snapshot.pairedDeviceLimit && snapshot.pairedDeviceLimit > 0"
            :percentage="devicePercentage"
            :show-text="false"
            :stroke-width="8"
          />
          <p>可在“手机设备”页面管理设备配对。</p>
        </template>
        <el-empty v-else :image-size="72" description="授权服务连通后显示设备额度" />
      </article>
    </section>

    <section class="feature-panel">
      <div class="section-heading">
        <div
          ><h2>功能授权与额度</h2
          ><p>额度状态由 Call Phone 核心服务返回，不在本地数据库中作为授权依据。</p></div
        >
        <span v-if="snapshot.checkedAt" class="checked-at"
          >最近查询 {{ formatDateTime(snapshot.checkedAt) }}</span
        >
      </div>
      <el-table v-if="snapshot.features.length" :data="snapshot.features" stripe>
        <el-table-column label="功能" min-width="220">
          <template #default="{ row }"
            ><strong>{{ row.name }}</strong
            ><small class="feature-code">{{ row.code }}</small></template
          >
        </el-table-column>
        <el-table-column label="授权状态" width="130">
          <template #default="{ row }"
            ><el-tag :type="row.enabled ? 'success' : 'info'" effect="light">{{
              row.enabled ? '已开通' : '未开通'
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="使用量 / 上限" width="180">
          <template #default="{ row }"
            >{{ row.used ?? '—' }} / {{ row.limit == null ? '不限' : row.limit }}</template
          >
        </el-table-column>
        <el-table-column label="用量" min-width="180">
          <template #default="{ row }"
            ><el-progress
              v-if="row.limit && row.limit > 0"
              :percentage="usagePercentage(row.used, row.limit)"
              :show-text="false"
              :stroke-width="7"
            /><span v-else class="muted">{{
              row.limit === 0 ? '无可用额度' : '不限量'
            }}</span></template
          >
        </el-table-column>
      </el-table>
      <el-empty v-else :image-size="88" :description="emptyDetail" />
    </section>

    <el-alert
      class="state-message"
      :title="snapshot.message"
      :type="
        snapshot.state === 'available'
          ? 'success'
          : snapshot.state === 'unavailable'
            ? 'error'
            : 'info'
      "
      :closable="false"
      show-icon
    />

    <section v-if="snapshot.state === 'not_configured'" class="configure-card">
      <div
        ><strong>先配置核心服务连接</strong
        ><p>在扩展服务配置中录入核心服务地址和 API Key 后，可在此刷新授权摘要。</p></div
      >
      <el-button type="primary" @click="goIntegrations">前往扩展服务配置</el-button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import {
  getEntitlement,
  refreshEntitlement,
  type EntitlementSnapshotVO
} from '@/api/callphone/entitlement'

defineOptions({ name: 'CallPhoneEntitlement' })
const route = useRoute()
const router = useRouter()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false)
const snapshot = ref<EntitlementSnapshotVO>({
  state: 'not_configured',
  message: '尚未查询授权服务。',
  features: []
})

const statusLabel = computed(() => {
  if (snapshot.value.state === 'not_configured') return '未配置'
  if (snapshot.value.state === 'unavailable') return '暂不可用'
  return ({ active: '有效', trial: '试用中', expired: '已到期', suspended: '已暂停' } as const)[
    snapshot.value.status || 'suspended'
  ]
})
const statusType = computed(() => {
  if (snapshot.value.state === 'unavailable') return 'danger'
  if (snapshot.value.state === 'not_configured') return 'info'
  return snapshot.value.status === 'active' || snapshot.value.status === 'trial'
    ? 'success'
    : 'warning'
})
const emptyTitle = computed(() =>
  snapshot.value.state === 'unavailable' ? '暂时无法取得方案信息' : '尚未连接授权服务'
)
const emptyDetail = computed(() =>
  previewMode ? '预览模式不加载授权样例数据' : '暂无功能额度数据'
)
const devicePercentage = computed(() =>
  usagePercentage(snapshot.value.pairedDeviceCount, snapshot.value.pairedDeviceLimit)
)

async function load(showToast = false) {
  if (previewMode) return
  loading.value = true
  try {
    snapshot.value = showToast ? await refreshEntitlement() : await getEntitlement()
    if (showToast && snapshot.value.state === 'available') ElMessage.success('授权信息已刷新')
    else if (showToast) ElMessage.warning(snapshot.value.message)
  } catch {
    snapshot.value = {
      state: 'unavailable',
      message: '授权服务暂时不可用，请检查网络和服务配置后重试。',
      features: []
    }
    if (showToast) ElMessage.error(snapshot.value.message)
  } finally {
    loading.value = false
  }
}

function usagePercentage(used?: number, limit?: number) {
  if (!used || !limit || limit <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)))
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString() : '未设定'
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '—'
}

function openBilling() {
  if (!snapshot.value.billingUrl) return
  window.open(snapshot.value.billingUrl, '_blank', 'noopener,noreferrer')
}

function goIntegrations() {
  if (previewMode) {
    router.push({ path: '/callphone-preview/integrations', query: { preview: '1' } })
    return
  }
  router.push('/callphone/settings/integrations')
}

onMounted(() => load())
</script>

<style scoped>
.entitlement-page {
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
  margin-bottom: 16px;
}

.page-heading,
.section-heading,
.plan-topline,
.heading-actions,
.card-title,
.plan-meta,
.device-count,
.configure-card {
  display: flex;
  align-items: center;
}

.page-heading {
  justify-content: space-between;
  margin-bottom: 16px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: #253149;
}

.page-heading p,
.section-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7a8598;
}

.heading-actions {
  gap: 8px;
}

.heading-actions .el-button .el-icon + span {
  margin-left: 5px;
}

.privacy-note {
  display: flex;
  padding: 13px 15px;
  margin-bottom: 16px;
  font-size: 12px;
  line-height: 1.65;
  color: #536b91;
  background: #f3f7ff;
  border: 1px solid #dbe7fb;
  border-radius: 8px;
  gap: 9px;
  align-items: flex-start;
}

.privacy-note :deep(svg) {
  flex: none;
  margin-top: 2px;
  color: #4c6fc1;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 16px;
  margin-bottom: 16px;
}

.plan-card,
.device-card,
.feature-panel,
.configure-card {
  padding: 20px;
  background: #fff;
  border: 1px solid #e5e9f0;
  border-radius: 10px;
}

.plan-topline {
  justify-content: space-between;
}

.eyebrow,
.checked-at,
.muted {
  font-size: 12px;
  color: #8792a5;
}

.plan-card h2 {
  margin: 18px 0 3px;
  font-size: 23px;
  color: #253149;
}

.plan-code,
.feature-code {
  display: block;
  margin-top: 4px;
  font-family: monospace;
  font-size: 11px;
  color: #929cad;
}

.plan-meta {
  padding-top: 14px;
  margin-top: 22px;
  font-size: 12px;
  border-top: 1px solid #eef1f6;
  justify-content: space-between;
}

.plan-meta span {
  color: #8792a5;
}

.plan-meta strong {
  color: #35435a;
}

.card-title {
  gap: 8px;
  color: #60759e;
}

.card-title strong {
  color: #35435a;
}

.device-count {
  gap: 6px;
  margin: 26px 0 16px;
}

.device-count strong {
  font-size: 34px;
  line-height: 1;
  color: #253149;
}

.device-count span {
  font-size: 13px;
  color: #8792a5;
}

.device-card p {
  margin-top: 15px;
  font-size: 12px;
  color: #8792a5;
}

.section-heading {
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-heading h2 {
  margin: 0;
  font-size: 16px;
  color: #35435a;
}

.checked-at {
  white-space: nowrap;
}

.feature-panel :deep(.el-table),
.feature-panel :deep(.el-table tr),
.feature-panel :deep(.el-table th.el-table__cell) {
  color: #303133;
  background: #fff;
}

.configure-card {
  margin-top: 16px;
  background: #fbfcff;
  border-color: #dbe7fb;
  justify-content: space-between;
  gap: 16px;
}

.configure-card strong {
  color: #35435a;
}

.configure-card p {
  margin-top: 5px;
  font-size: 12px;
  color: #7a8598;
}

.state-message {
  margin-top: 16px;
}

@media (width <= 760px) {
  .entitlement-page {
    padding: 12px;
  }

  .page-heading {
    align-items: flex-start;
    gap: 12px;
  }

  .heading-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .section-heading {
    align-items: flex-start;
    gap: 12px;
    flex-direction: column;
  }

  .configure-card {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
