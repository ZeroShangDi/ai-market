import { getAccessToken } from '@/utils/auth'
import { h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as OutboundApi from '@/api/callphone/outbound'

let busy = false
let preferredDevice = ''
let lastSession: string | undefined
const attempts = new Map<string, { key: string; deviceId: string; dispatchId?: string }>()

/** A single click sends one intent. Retrying an ambiguous response reuses its key. */
export async function startDirectCall(target: {
  customerId?: string
  leadId?: string
  source: string
}) {
  if (busy) return
  busy = true
  const session = getAccessToken()
  if (lastSession !== session) {
    attempts.clear()
    preferredDevice = ''
    lastSession = session
  }
  const current = () => session === getAccessToken()
  const targetKey = JSON.stringify(target)
  try {
    let attempt = attempts.get(targetKey)
    if (attempt?.dispatchId) {
      const prior: OutboundApi.DispatchVO = await OutboundApi.getCallDispatch(attempt.dispatchId)
      if (!current()) return
      if (
        (prior.status === 'queued' || prior.status === 'accepted') &&
        prior.callStage !== 'completed'
      ) {
        ElMessage.info('该外呼正在处理中，请先完成手机上的通话')
        return prior
      }
      attempts.delete(targetKey)
      attempt = undefined
    }
    const devices: OutboundApi.PairedDeviceVO[] = (await OutboundApi.getPairedDevices()).filter(
      (device: OutboundApi.PairedDeviceVO) =>
        device.status === 'online' && device.platform === 'android'
    )
    if (!current()) return
    if (!devices.length) throw new Error('没有在线 Android 手机，请先配对并保持手机 App 在前台')
    let deviceId =
      attempt?.deviceId || devices.find((device) => device.id === preferredDevice)?.id || ''
    if (attempt && !devices.some((device) => device.id === deviceId))
      throw new Error('上次请求状态待确认，请恢复原手机连接后再试，避免重复拨号')
    if (!deviceId && devices.length === 1) deviceId = devices[0].id
    if (!deviceId) {
      deviceId = devices[0].id
      await ElMessageBox({
        title: '选择拨号手机',
        confirmButtonText: '拨号',
        showCancelButton: true,
        message: h(
          'select',
          {
            style: { width: '100%', padding: '10px' },
            'aria-label': '拨号手机',
            onChange: (event: Event) => {
              deviceId = (event.target as HTMLSelectElement).value
            }
          },
          devices.map((device) => h('option', { value: device.id }, device.displayName))
        )
      })
    }
    if (!current()) return
    preferredDevice = deviceId
    attempt ||= { key: crypto.randomUUID(), deviceId }
    attempts.set(targetKey, attempt)
    const dispatch: OutboundApi.DispatchVO = await OutboundApi.createCallDispatch({
      ...target,
      deviceId,
      idempotencyKey: attempt.key
    })
    if (!current()) return
    attempt.dispatchId = dispatch.id
    ElMessage.success(`已发送至 ${dispatch.deviceName || '手机'}，手机将自动拨号`)
    return dispatch
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(error?.message || '拨号请求未成功，请重试')
  } finally {
    busy = false
  }
}
