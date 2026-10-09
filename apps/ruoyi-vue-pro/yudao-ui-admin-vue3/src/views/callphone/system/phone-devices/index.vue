<template>
  <div class="phone-devices-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="设备状态保存在当前浏览器；真实设备列表与撤销调用 Call Phone 配对 API。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading"
        ><div
          ><h1>手机设备</h1
          ><p>查看当前账号已登记的手机和最近心跳；解绑后立即禁止该设备接收新外呼。</p></div
        ><el-button @click="load" :loading="loading"
          ><Icon icon="ep:refresh" />刷新状态</el-button
        ></header
      >
      <div class="summary-grid"
        ><article
          ><span>全部设备</span><strong>{{ devices.length }}</strong></article
        ><article
          ><span>在线设备</span><strong class="online">{{ counts.online }}</strong></article
        ><article
          ><span>离线设备</span><strong class="offline">{{ counts.offline }}</strong></article
        ><article
          ><span>已解绑</span><strong>{{ counts.revoked }}</strong></article
        ></div
      >
      <el-form :inline="true" class="filter-bar"
        ><el-form-item label="设备状态"
          ><el-select v-model="statusFilter" clearable placeholder="全部状态"
            ><el-option label="在线" value="online" /><el-option
              label="离线"
              value="offline" /><el-option
              label="已解绑"
              value="revoked" /></el-select></el-form-item
        ><el-form-item label="设备名称"
          ><el-input v-model="query" clearable placeholder="输入名称筛选" /></el-form-item
      ></el-form>
      <el-table v-loading="loading" :data="filteredDevices" row-key="id">
        <el-table-column label="设备名称" min-width="220"
          ><template #default="{ row }"
            ><div class="device-name"
              ><span class="device-icon"
                ><Icon :icon="row.platform === 'ios' ? 'ep:iphone' : 'ep:cellphone'" /></span
              ><div
                ><strong>{{ row.displayName }}</strong
                ><small>{{ row.platform === 'ios' ? 'iOS' : 'Android' }}</small></div
              ></div
            ></template
          ></el-table-column
        >
        <el-table-column label="连接状态" width="130"
          ><template #default="{ row }"
            ><el-tag :type="statusType(row.status)" effect="light">{{
              statusLabel(row.status)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="最近心跳" min-width="190"
          ><template #default="{ row }">{{ formatTime(row.lastSeenAt) }}</template></el-table-column
        >
        <el-table-column label="设备标识" min-width="150"
          ><template #default="{ row }"
            ><span class="device-id">{{ shortId(row.id) }}</span></template
          ></el-table-column
        >
        <el-table-column label="操作" width="180" fixed="right"
          ><template #default="{ row }"
            ><el-button v-if="row.status !== 'revoked'" link type="danger" @click="revoke(row)"
              >撤销设备授权</el-button
            ><el-button v-else link type="primary" @click="goPairing">重新配对</el-button></template
          ></el-table-column
        >
        <template #empty
          ><el-empty :description="loading ? '' : '暂无手机设备。请在“电脑与配对”页生成配对码。'"
            ><el-button type="primary" @click="goPairing">前往电脑与配对</el-button></el-empty
          ></template
        >
      </el-table>
      <p class="privacy-note"
        >设备密钥只在手机首次配对时发送，服务端仅保留密钥摘要。本页不会读取或展示令牌。</p
      >
    </section>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute, useRouter } from 'vue-router'
import * as DeviceApi from '@/api/callphone/device'
import * as PreviewStore from '@/api/callphone/preview-store'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
defineOptions({ name: 'CallPhonePhoneDevices' })
const route = useRoute(),
  router = useRouter(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false),
  devices = ref<DeviceApi.PairedDeviceVO[]>([]),
  statusFilter = ref(''),
  query = ref('')
const counts = computed(() => ({
  online: devices.value.filter((item) => item.status === 'online').length,
  offline: devices.value.filter((item) => item.status === 'offline').length,
  revoked: devices.value.filter((item) => item.status === 'revoked').length
}))
const filteredDevices = computed(() =>
  devices.value.filter(
    (item) =>
      (!statusFilter.value || item.status === statusFilter.value) &&
      (!query.value || item.displayName.toLowerCase().includes(query.value.trim().toLowerCase()))
  )
)
async function load() {
  loading.value = true
  try {
    devices.value = previewMode
      ? PreviewStore.previewPairedDevices()
      : await DeviceApi.getPairedDevicePage()
  } catch (e: any) {
    devices.value = []
    ElMessage.error(e?.message || '设备状态加载失败')
  } finally {
    loading.value = false
  }
}
async function revoke(row: DeviceApi.PairedDeviceVO) {
  try {
    await ElMessageBox.confirm(
      `撤销“${row.displayName}”的授权后，这台手机无法继续接收外呼。`,
      '撤销设备授权',
      { type: 'warning', confirmButtonText: '确认撤销' }
    )
    if (previewMode) PreviewStore.revokePreviewDevice(row.id)
    else {
      const ok = await DeviceApi.revokePairedDevice(row.id)
      if (!ok) throw new Error('设备状态已变化，请刷新列表')
    }
    ElMessage.success('设备授权已撤销')
    await load()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '撤销失败')
  }
}
function goPairing() {
  router.push({
    path: previewMode ? '/callphone-preview/device-pairing' : '/callphone/settings/device-pairing',
    query: previewMode ? { preview: '1' } : undefined
  })
}
function statusLabel(v: string) {
  return ({ online: '在线', offline: '离线', revoked: '已解绑' } as Record<string, string>)[v] || v
}
function statusType(v: string): 'success' | 'info' | 'danger' {
  return v === 'online' ? 'success' : v === 'offline' ? 'info' : 'danger'
}
function formatTime(v?: string) {
  return v ? parseCallPhoneDateTime(v).toLocaleString('zh-CN', { hour12: false }) : '—'
}
function shortId(v: string) {
  return v.length > 14 ? `${v.slice(0, 6)}…${v.slice(-5)}` : v
}
onMounted(load)
</script>

<style scoped>
.phone-devices-page {
  padding: 20px;
}

.preview-banner {
  margin-bottom: 14px;
}

.page-panel {
  padding: 24px;
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

.page-heading h1 {
  margin: 0;
  font-size: 20px;
}

.page-heading p,
.privacy-note {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.page-heading p {
  margin: 7px 0 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 22px;
}

.summary-grid article {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 17px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 9px;
}

.summary-grid span {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.summary-grid strong {
  font-size: 23px;
  color: var(--el-text-color-primary);
}

.summary-grid strong.online {
  color: var(--el-color-success);
}

.summary-grid strong.offline {
  color: var(--el-color-info);
}

.filter-bar {
  margin-bottom: 7px;
}

.device-name {
  display: flex;
  align-items: center;
  gap: 11px;
}

.device-name strong,
.device-name small {
  display: block;
}

.device-name small {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
}

.device-icon {
  display: grid;
  width: 38px;
  height: 38px;
  font-size: 18px;
  color: var(--el-color-primary);
  background: var(--el-fill-color-light);
  border-radius: 9px;
  place-items: center;
}

.device-id {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.privacy-note {
  margin: 18px 0 0;
}

@media (width <= 800px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
