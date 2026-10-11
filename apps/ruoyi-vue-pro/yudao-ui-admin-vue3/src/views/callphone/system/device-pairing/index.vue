<template>
  <div class="device-pairing-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="此处的配对码和设备状态仅保存在当前浏览器；真实手机配对 API 已接入，但需服务端运行。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div
          ><h1>电脑与配对</h1
          ><p>把 Call Phone 手机端绑定到当前成员，手机扫码登录后自动执行电脑发起的外呼。</p></div
        >
        <el-button
          type="primary"
          :disabled="Boolean(activeCode && activeCode.status === 'pending')"
          :loading="creating"
          @click="createCode"
          ><Icon icon="ep:plus" /> 创建配对码</el-button
        >
      </header>

      <el-form label-position="top">
        <el-form-item label="手机可访问的服务器地址（本电脑保存一次即可）">
          <el-input v-model="mobileServiceUrl" :disabled="activeCode?.status === 'pending'"
            placeholder="例如 http://192.168.31.25:48080" @change="saveServiceUrl" />
        </el-form-item>
      </el-form>
      <div class="security-note"
        ><Icon icon="ep:lock" /><div
          ><strong>配对安全</strong
          ><span
            >配对码 5 分钟内有效且只能使用一次；手机配对后获得独立设备密钥，PC
            不会显示或保存该密钥。</span
          ></div
        ></div
      >

      <div class="section-heading"
        ><div><h2>已配对手机</h2><p>设备在线状态依据最近心跳判断，超过 2 分钟显示离线。</p></div
        ><span>{{ devices.length }} 台设备</span></div
      >
      <el-table v-loading="loading" :data="devices" row-key="id">
        <el-table-column label="设备名称" min-width="220"
          ><template #default="{ row }"
            ><div class="device-name"
              ><span class="device-icon"
                ><Icon :icon="row.platform === 'ios' ? 'ep:phone' : 'ep:monitor'" /></span
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
        <el-table-column label="最近活动" min-width="180"
          ><template #default="{ row }">{{ formatTime(row.lastSeenAt) }}</template></el-table-column
        >
        <el-table-column label="操作" width="110" fixed="right"
          ><template #default="{ row }"
            ><el-button v-if="row.status !== 'revoked'" link type="danger" @click="revoke(row)"
              >解除绑定</el-button
            ><span v-else class="muted">已解除</span></template
          ></el-table-column
        >
        <template #empty><el-empty description="暂未绑定手机，请创建配对码" /></template>
      </el-table>

      <div v-if="activeCode" class="recent-code">
        <div
          ><strong>最近一次配对</strong
          ><span
            >状态：{{ codeStatusLabel(activeCode.status) }} · 有效期至
            {{ formatTime(activeCode.expiresAt)
            }}{{ activeCode.status === 'pending' ? ' · 等待期间可以取消或让它自动过期' : '' }}</span
          ></div
        >
        <el-button v-if="activeCode.status === 'pending'" link type="primary" @click="reopenPairing"
          >继续配对</el-button
        >
        <el-button v-if="activeCode.status === 'pending'" link type="danger" @click="cancelCode"
          >取消配对码</el-button
        >
      </div>
    </section>

    <el-dialog
      v-model="dialogVisible"
      title="使用手机端完成配对"
      width="460px"
      @closed="onDialogClosed"
    >
      <div v-if="activeCode" class="pair-dialog-content">
        <el-steps
          :active="activeCode.status === 'claimed' ? 2 : 1"
          align-center
          finish-status="success"
        >
          <el-step title="打开手机端" /><el-step title="扫码登录" /><el-step
            title="配对完成"
          />
        </el-steps>
        <p class="pair-hint">手机打开 App 扫码，即可登录当前员工账户并完成配对</p>
        <img
          v-if="qrDataUrl && activeCode.status === 'pending'"
          :src="qrDataUrl"
          class="pair-qr"
          alt="Call Phone 一次性配对二维码"
        />
        <p class="pair-hint"
          >二维码包含一次性登录授权，请仅使用自己的手机扫描。</p
        >
        <div class="pair-code" aria-label="一次性配对码">{{
          activeCode.pairingCode || '••••••'
        }}</div>
        <div class="pair-expiry"
          ><el-icon><Clock /></el-icon
          ><span>{{
            activeCode.status === 'pending'
              ? `剩余 ${remainingSeconds} 秒，等待手机扫码`
              : codeStatusLabel(activeCode.status)
          }}</span></div
        >
        <el-alert
          v-if="activeCode.status === 'claimed'"
          class="claimed-alert"
          title="手机已配对"
          description="设备密钥已发送到手机并且只显示一次；后续可以在设备列表中解除绑定。"
          type="success"
          :closable="false"
        />
        <el-alert
          v-else-if="activeCode.status === 'expired' || activeCode.status === 'revoked'"
          class="claimed-alert"
          :title="codeStatusLabel(activeCode.status)"
          description="请关闭窗口后重新创建配对码。"
          type="warning"
          :closable="false"
        />
        <div v-if="previewMode && activeCode.status === 'pending'" class="preview-sim"
          ><span>本地交互演示</span
          ><el-button size="small" @click="simulatePairing">模拟手机扫码完成</el-button></div
        >
      </div>
      <template #footer
        ><el-button @click="dialogVisible = false">{{
          activeCode?.status === 'pending' ? '稍后配对' : '完成'
        }}</el-button></template
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock } from '@element-plus/icons-vue'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import * as DeviceApi from '@/api/callphone/device'
import * as PreviewStore from '@/api/callphone/preview-store'
import QRCode from 'qrcode'
import { getTenantId } from '@/utils/auth'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'

defineOptions({ name: 'CallPhoneDevicePairing' })
const route = useRoute(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
function reopenPairing() {
  dialogVisible.value = true
  void buildQr()
  tickCountdown()
}
const loading = ref(false),
  creating = ref(false),
  dialogVisible = ref(false),
  remainingSeconds = ref(0)
const devices = ref<DeviceApi.PairedDeviceVO[]>([]),
  activeCode = ref<DeviceApi.PairingCodeVO>()
const qrDataUrl = ref('')
const serviceStorageKey = `callphone-mobile-service:${location.origin}:${getTenantId() || '1'}`
const mobileServiceUrl = ref(localStorage.getItem(serviceStorageKey) || import.meta.env.VITE_CALLPHONE_MOBILE_SERVICE_URL || '')
function saveServiceUrl() {
  try {
    const url = new URL(mobileServiceUrl.value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
        url.pathname !== '/' || ['localhost', '0.0.0.0', '[::1]'].includes(url.hostname) || /^127\./.test(url.hostname)) throw new Error()
    mobileServiceUrl.value = url.origin
    localStorage.setItem(serviceStorageKey, url.origin)
    return true
  } catch {
    ElMessage.warning('请填写手机可访问的服务器地址，不能使用 localhost 或本机回环地址')
    return false
  }
}
let qrGeneration = 0
let pollInFlight = false
let deviceTimer: ReturnType<typeof setInterval> | undefined
async function buildQr() {
  const current = activeCode.value
  const generation = ++qrGeneration
  qrDataUrl.value = ''
  if (!current?.pairingCode || current.status !== 'pending') return
  const url = mobileServiceUrl.value.trim().replace(/\/+$/, '')
  if (url && !/^https?:\/\/[^/\s?#@]+(?:\/[^\s?#]*)?$/.test(url)) {
    ElMessage.warning('手机服务地址无效，请使用 http 或 https 地址')
    return
  }
  const payload = JSON.stringify({
    type: 'callphone-pairing',
    version: previewMode ? 1 : 2,
    pairingId: current.id,
    loginSecret: current.loginSecret,
    code: current.pairingCode,
    tenantId: String(previewMode ? '1' : getTenantId() || '1'),
    ...(url ? { serviceUrl: url } : {})
  })
  try {
    const result = await QRCode.toDataURL(payload, {
      width: 216,
      margin: 2,
      errorCorrectionLevel: 'M'
    })
    if (generation === qrGeneration) qrDataUrl.value = result
  } catch {
    if (generation === qrGeneration) ElMessage.error('二维码生成失败，请关闭后重新打开')
  }
}
let pollTimer: ReturnType<typeof setInterval> | undefined,
  clockTimer: ReturnType<typeof setInterval> | undefined

async function loadDevices(silent = false) {
  loading.value = true
  try {
    devices.value = previewMode
      ? PreviewStore.previewPairedDevices()
      : await DeviceApi.getPairedDevicePage()
  } catch (error: any) {
    devices.value = []
    if (!silent) ElMessage.error(error?.message || '设备列表加载失败')
  } finally {
    loading.value = false
  }
}
async function createCode() {
  if (creating.value || !saveServiceUrl()) return
  creating.value = true
  try {
    activeCode.value = previewMode
      ? PreviewStore.createPreviewPairingCode()
      : await DeviceApi.createPairingCode()
    dialogVisible.value = true
    await buildQr()
    tickCountdown()
    startPolling()
  } catch (error: any) {
    ElMessage.error(error?.message || '配对码创建失败')
  } finally {
    creating.value = false
  }
}
function tickCountdown() {
  updateCountdown()
  if (clockTimer) clearInterval(clockTimer)
  clockTimer = setInterval(updateCountdown, 1000)
}
function updateCountdown() {
  remainingSeconds.value = Math.max(
    0,
    Math.ceil(
      (parseCallPhoneDateTime(activeCode.value?.expiresAt || 0).getTime() - Date.now()) / 1000
    )
  )
}
function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (pollInFlight) return
    const current = activeCode.value
    if (!current || current.status !== 'pending') return stopPolling()
    pollInFlight = true
    try {
      const latest = previewMode
        ? PreviewStore.getPreviewPairingCode(current.id)
        : await DeviceApi.getPairingCode(current.id)
      if (activeCode.value?.id !== current.id || activeCode.value?.status !== 'pending') return
      if (latest) activeCode.value = { ...current, ...latest, pairingCode: current.pairingCode, loginSecret: current.loginSecret }
      const latestCode = activeCode.value
      if (latestCode && latestCode.status !== 'pending') {
        stopPolling()
        await loadDevices()
      }
    } catch {
      /* Keep last confirmed state; next interval retries. */
    } finally {
      pollInFlight = false
    }
  }, 2500)
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
}
async function cancelCode() {
  const current = activeCode.value
  if (!current || current.status !== 'pending') return
  try {
    if (previewMode) PreviewStore.cancelPreviewPairingCode(current.id)
    else {
      const cancelled = await DeviceApi.cancelPairingCode(current.id)
      if (!cancelled) {
        const latest = await DeviceApi.getPairingCode(current.id)
        if (latest) activeCode.value = { ...current, ...latest }
        await loadDevices()
        ElMessage.warning('配对状态已变化，请查看最新状态')
        return
      }
    }
    activeCode.value = { ...current, status: 'revoked' }
    stopPolling()
    ElMessage.success('配对码已取消')
  } catch (error: any) {
    ElMessage.error(error?.message || '取消失败')
  }
}
async function simulatePairing() {
  if (!activeCode.value) return
  if (PreviewStore.simulatePreviewPairing(activeCode.value.id)) {
    const latest = PreviewStore.getPreviewPairingCode(activeCode.value.id)
    if (latest) activeCode.value = { ...activeCode.value, ...latest }
    stopPolling()
    await loadDevices()
    ElMessage.success('演示手机已完成配对')
  }
}
async function revoke(row: DeviceApi.PairedDeviceVO) {
  try {
    await ElMessageBox.confirm(
      `解除“${row.displayName}”的绑定后，该设备将无法接受新的外呼派发。`,
      '解除设备绑定',
      { type: 'warning', confirmButtonText: '解除绑定' }
    )
    if (previewMode) PreviewStore.revokePreviewDevice(row.id)
    else if (!(await DeviceApi.revokePairedDevice(row.id)))
      throw new Error('设备状态已变化，请刷新后重试')
    ElMessage.success('设备已解除绑定')
    await loadDevices()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '解除绑定失败')
  }
}
function statusLabel(status: string) {
  return (
    ({ online: '在线', offline: '离线', revoked: '已解除' } as Record<string, string>)[status] ||
    status
  )
}
function statusType(status: string): 'success' | 'info' | 'danger' {
  return status === 'online' ? 'success' : status === 'offline' ? 'info' : 'danger'
}
function codeStatusLabel(status: string) {
  return (
    (
      {
        pending: '等待手机扫码',
        claimed: '已配对',
        expired: '已过期',
        revoked: '已取消'
      } as Record<string, string>
    )[status] || status
  )
}
function formatTime(value?: string) {
  return value
    ? parseCallPhoneDateTime(value).toLocaleString('zh-CN', {
        hour12: false
      })
    : '—'
}
function onDialogClosed() {
  if (clockTimer) clearInterval(clockTimer)
  clockTimer = undefined
  qrGeneration++
  qrDataUrl.value = ''
  if (activeCode.value?.status !== 'pending') stopPolling()
}
onMounted(() => {
  void loadDevices()
  deviceTimer = setInterval(() => {
    if (!loading.value) void loadDevices(true)
  }, 15000)
})
onBeforeUnmount(() => {
  stopPolling()
  qrGeneration++
  if (deviceTimer) clearInterval(deviceTimer)
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<style scoped>
.pair-qr {
  display: block;
  width: 216px;
  height: 216px;
  margin: 16px auto;
}
.device-pairing-page {
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

.page-heading,
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-heading {
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: var(--el-text-color-primary);
}

.page-heading p,
.section-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.security-note {
  display: flex;
  padding: 15px 17px;
  margin-bottom: 26px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: 8px;
  gap: 12px;
  align-items: flex-start;
}

.security-note :deep(svg) {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 1px;
}

.security-note strong,
.security-note span {
  display: block;
}

.security-note span {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.section-heading {
  margin: 0 0 13px;
}

.section-heading h2 {
  margin: 0;
  font-size: 16px;
  color: var(--el-text-color-primary);
}

.section-heading p {
  margin-top: 5px;
}

.section-heading > span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
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

.recent-code {
  display: flex;
  padding: 14px 16px;
  margin-top: 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  justify-content: space-between;
  align-items: center;
}

.recent-code strong,
.recent-code span {
  display: block;
}

.recent-code span {
  margin-top: 5px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.muted {
  color: var(--el-text-color-placeholder);
}

.pair-dialog-content {
  padding: 5px 4px 0;
}

.pair-hint {
  margin: 25px 0 14px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.pair-code {
  padding-left: 12px;
  font-size: 42px;
  font-weight: 700;
  letter-spacing: 12px;
  color: var(--el-text-color-primary);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.pair-expiry {
  display: flex;
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-color-warning);
  justify-content: center;
  align-items: center;
  gap: 7px;
}

.claimed-alert {
  margin-top: 22px;
}

.preview-sim {
  display: flex;
  padding: 12px;
  margin-top: 18px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border: 1px dashed var(--el-border-color);
  border-radius: 7px;
  justify-content: space-between;
  align-items: center;
}
</style>
