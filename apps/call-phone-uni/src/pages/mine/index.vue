<template><view class="page"><view class="wrap">
  <view class="head">我的</view><PreviewBanner />
  <view class="license"><text class="edition">{{ bootstrap?.license?.edition || 'Call Phone' }}</text><text>{{ licenseText }}</text><text>{{ pairedText }}</text><image src="/static/figma/2-112-imgFrame.svg" /></view>
  <view v-if="loading" class="state">正在加载账户与设备信息…</view>
  <view v-if="errorMessage" class="state" @tap="load">{{ errorMessage }} · 点击重试</view>
  <view class="setting" @tap="open('account')"><view class="setting-icon"><image src="/static/figma/2-112-imgFrame1.svg" /></view><view class="setting-text"><text>账户与授权</text><text>查看有效期与设备授权</text></view><image class="arrow" src="/static/figma/2-112-imgFrame2.svg" /></view>
  <view class="setting" @tap="open('device')"><view class="setting-icon"><image src="/static/figma/2-112-imgFrame3.svg" /></view><view class="setting-text"><text>本机与配对</text><text>{{ device?.paired_computer || '尚未配对电脑' }} · {{ device?.paired ? '已连接' : '未配对' }}</text></view><image class="arrow" src="/static/figma/2-112-imgFrame2.svg" /></view>
  <view class="setting" @tap="open('diagnostics')"><view class="setting-icon"><image src="/static/figma/2-112-imgFrame4.svg" /></view><view class="setting-text"><text>诊断与帮助</text><text>权限、录音、同步状态</text></view><image class="arrow" src="/static/figma/2-112-imgFrame2.svg" /></view>
  <view class="divider" /><text class="hint">{{ pendingCompletionCount() ? `有 ${pendingCompletionCount()} 条通话结果待同步（仅当前进程保留）` : '发生同步异常时，这里会显示待处理项' }}</text>
  <view v-if="panel" class="panel-scrim" @tap="panel = ''"><view class="panel" @tap.stop>
    <text class="panel-title">{{ panelTitle }}</text>
    <template v-if="panel === 'account'"><text>账户：{{ bootstrap?.user?.name || '未登录' }}</text><text>工作区：{{ bootstrap?.workspace?.name || '未配置' }}</text><text>授权状态：{{ licenseStatus }}</text><text>最后验证：{{ bootstrap?.license?.last_verified_at ? when(bootstrap.license.last_verified_at) : '暂无' }}</text></template>
    <template v-if="panel === 'device'"><text>本机：{{ device?.name || '未配置' }}</text><text>配对电脑：{{ device?.paired_computer || (device?.paired ? '已连接' : '无') }}</text><text>上次同步：{{ device?.last_sync_at ? when(device.last_sync_at) : '暂无' }}</text><view v-if="!device?.paired" class="pairing-form"><text class="pairing-title">连接电脑</text><text>输入电脑“电脑与配对”页面显示的六位配对码</text><input v-model="pairingCode" class="pairing-input code-input" type="digit" maxlength="6" placeholder="六位配对码" @input="onPairingCodeInput" /><input v-model="pairingDeviceName" class="pairing-input" maxlength="40" placeholder="手机名称（如：销售手机）" /><button class="primary" :disabled="claimingPairing" @tap="claimPairing">{{ claimingPairing ? '正在配对…' : '确认配对' }}</button><text class="pairing-hint">设备密钥仅保存在本次运行内存中；重启应用后需重新配对。</text></view><text>连通性测试：{{ connectivityStatus }}</text><button class="secondary" :disabled="checkingConnectivity" @tap="testConnectivity">{{ checkingConnectivity ? '检查中…' : '测试客户侧数据服务连通性' }}</button><button v-if="device?.paired" class="secondary" @tap="unpair">解绑本机</button></template>
    <template v-if="panel === 'diagnostics'"><text>数据服务：{{ diagnosticLabel(diagnostics?.data_service) }}</text><text>授权检查：{{ diagnosticLabel(diagnostics?.license_check) }}</text><text>待同步结果：{{ pendingCompletionCount() }}</text><text>通话插件：{{ phoneCapability.available() ? '已检测到' : '当前环境不可用' }}</text><text>自动录音：{{ recordingStatus }}</text><text>文件权限：{{ fileStatus }}</text><text>拨号测试：{{ testCallStatus }}</text><button class="secondary" @tap="checkNative">检查本机权限</button><button class="secondary" :disabled="testCallBusy" @tap="testCall">测试拨号 10086</button><button class="secondary" @tap="retry">重试同步</button></template>
    <button class="close" @tap="panel = ''">完成</button>
  </view></view>
</view><TabBar current="mine" /></view></template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import TabBar from '@/components/TabBar.vue'
import PreviewBanner from '@/components/PreviewBanner.vue'
import { mobileService } from '@/services/mobile'
import { checkDataService, clearCallphoneDeviceCredential, messageOf } from '@/api/http'
import { mockEnabled } from '@/config'
import { clearCallState, pendingCompletionCount, retryPendingCompletions } from '@/services/calls'
import { phoneCapability } from '@/native/phone'
import { when, toast } from '@/ui/format'
import type { Bootstrap, Device, Diagnostics } from '@/types/mobile'
const bootstrap = ref<Bootstrap>(), device = ref<Device>(), diagnostics = ref<Diagnostics>(), loading = ref(false), errorMessage = ref(''), panel = ref<'account' | 'device' | 'diagnostics' | ''>(''), pairingCode = ref(''), pairingDeviceName = ref('我的手机'), claimingPairing = ref(false), recordingStatus = ref('未检查'), fileStatus = ref('未检查'), connectivityStatus = ref('未检查'), checkingConnectivity = ref(false), testCallStatus = ref('未测试'), testCallBusy = ref(false)
const licenseStatus = computed(() => ({ active: '有效', grace: '宽限期', expired: '已过期', unavailable: '暂不可用' }[bootstrap.value?.license?.status || 'unavailable']))
const licenseText = computed(() => bootstrap.value?.license?.expires_at ? `授权有效至 ${bootstrap.value.license.expires_at.slice(0,10)}` : `授权状态：${licenseStatus.value}`)
const pairedText = computed(() => bootstrap.value?.device?.paired ? `已配对 ${bootstrap.value.device.paired_computer || '1 台电脑'}` : '尚未配对电脑')
const panelTitle = computed(() => ({ account: '账户与授权', device: '本机与配对', diagnostics: '诊断与帮助', '': '' }[panel.value]))
const diagnosticLabels: Record<string, string> = { available: '可用', unavailable: '暂不可用', simulated: '开发模拟模式', active: '有效', expired: '已过期', suspended: '已暂停', not_configured: '未配置' }
function diagnosticLabel(value?: string) { return value ? diagnosticLabels[value] || '未知状态' : '未检查' }
onShow(() => { void load() })
async function load() { loading.value = true; errorMessage.value = ''; try { bootstrap.value = await mobileService.bootstrap(); device.value = await mobileService.device() } catch (e) { errorMessage.value = messageOf(e) } finally { loading.value = false } }
async function open(value: 'account' | 'device' | 'diagnostics') { panel.value = value; if (value === 'diagnostics') { try { diagnostics.value = await mobileService.diagnostics() } catch (e) { toast(messageOf(e)) } } }
async function checkNative() { const [recording, files] = await Promise.all([phoneCapability.recordingConfigured(), phoneCapability.filePermission()]); recordingStatus.value = recording === null ? '插件不可用' : recording ? '已开启' : '未开启'; fileStatus.value = files === null ? '插件不可用' : files ? '已授权' : '未授权' }
async function testConnectivity() {
  if (mockEnabled) { connectivityStatus.value = '开发模拟模式，未检查真实服务'; return }
  checkingConnectivity.value = true
  connectivityStatus.value = '检查中…'
  try { connectivityStatus.value = await checkDataService() }
  catch { connectivityStatus.value = '无法连接客户侧数据服务' }
  finally { checkingConnectivity.value = false }
}
async function testCall() {
  if (!phoneCapability.available()) { testCallStatus.value = '当前环境没有 Android 通话插件'; return }
  const confirmed = await new Promise<boolean>(resolve => uni.showModal({ title: '测试拨号 10086', content: '将使用本机电话插件直接拨打 10086。此测试不会生成客户通话记录。', success: r => resolve(!!r.confirm) }))
  if (!confirmed) return
  testCallBusy.value = true
  try { await phoneCapability.dial('10086'); testCallStatus.value = '拨号已启动，请在本机确认通话状态' }
  catch (e) { testCallStatus.value = messageOf(e) }
  finally { testCallBusy.value = false }
}
async function retry() { await retryPendingCompletions(); toast(pendingCompletionCount() ? '仍有结果待同步' : '待同步结果已处理') }
function onPairingCodeInput(event: any) { const value = event?.detail?.value ?? event?.target?.value ?? event; pairingCode.value = String(value).replace(/\D/g, '').slice(0, 6) }
async function claimPairing() { const code = String(pairingCode.value).trim(); if (!/^\d{6}$/.test(code)) return toast('请输入六位配对码'); const system = uni.getSystemInfoSync(); const platform = String(system.platform || '').toLowerCase() === 'ios' ? 'ios' : 'android'; const confirmed = await new Promise<boolean>(resolve => uni.showModal({ title: '确认配对', content: '将本手机连接到当前账户下的电脑，并允许接收外呼派发。', success: r => resolve(!!r.confirm) })); if (!confirmed) return; claimingPairing.value = true; try { await mobileService.claimPairing(code, pairingDeviceName.value.trim() || '我的手机', platform); pairingCode.value = ''; await load(); toast('手机已配对') } catch (e) { toast(messageOf(e)) } finally { claimingPairing.value = false } }
async function unpair() { const confirmed = await new Promise<boolean>(resolve => uni.showModal({ title: '解绑本机', content: '解绑后会撤销本机配对并清理当前设备凭据和待处理结果。', success: r => resolve(!!r.confirm) })); if (!confirmed) return; try { await mobileService.unpair('mobile-unpair-' + Date.now()); clearCallphoneDeviceCredential(); clearCallState(); panel.value = ''; toast('本机已解绑'); await load() } catch (e) { toast(messageOf(e)) } }
</script>
<style scoped lang="scss">
.page { min-height: 100vh; background: #f7f8fc; padding-bottom: calc(110px + env(safe-area-inset-bottom)); }.wrap { max-width: 500px; margin: auto; padding: calc(19px + var(--status-bar-height) + env(safe-area-inset-top)) 15px 0; }.head { height: 46px; margin: 0 4px; display: flex; align-items: center; font-size: 25px; font-weight: 500; }.license { height: 118px; margin-top: 12px; padding: 18px; border-radius: 22px; background: #294fdb; box-shadow: 0 6px 16px rgba(20,31,51,.06); color: #dbe8ff; display: flex; flex-direction: column; gap: 11px; position: relative; font-size: 12px; }.license .edition { color: white; font-size: 15px; font-weight: 500; }.license image { position: absolute; right: 20px; top: 45px; width: 20px; height: 20px; }.setting { height: 68px; margin-top: 12px; padding: 14px; background: white; border-radius: 18px; box-shadow: 0 6px 16px rgba(20,31,51,.06); display: flex; align-items: center; gap: 12px; }.setting:first-of-type { margin-top: 22px; }.setting-icon { width: 40px; height: 40px; border-radius: 14px; background: #e8f0ff; display: flex; align-items: center; justify-content: center; }.setting-icon image { width: 20px; height: 20px; }.setting-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }.setting-text text:first-child { font-size: 14px; font-weight: 500; }.setting-text text:last-child { font-size: 11px; color: #636e82; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.arrow { width: 18px; height: 18px; }.divider { height: 1px; margin: 25px 16px 15px; background: #e3e8f2; }.hint { margin: 0 4px; font-size: 12px; color: #636e82; }.state { margin-top: 12px; padding: 12px; border-radius: 12px; background: white; color: #636e82; font-size: 12px; }.panel-scrim { position: fixed; z-index: 30; inset: 0; background: rgba(14,22,42,.42); display: flex; align-items: flex-end; }.panel { width: 100%; border-radius: 22px 22px 0 0; background: white; padding: 24px 20px calc(20px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 14px; font-size: 13px; color: #636e82; }.panel-title { color: #1a1f2e; font-size: 18px; font-weight: 600; }.panel button { width: 100%; border-radius: 14px; font-size: 13px; }.secondary { color: #294fdb; background: #e8f0ff; }.close { color: white; background: #294fdb; }
</style>
<style scoped lang="scss">
.pairing-form { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 14px; background: #f7f8fc; }
.pairing-title { color: #1a1f2e; font-size: 14px; font-weight: 600; }
.pairing-input { width: 100%; height: 44px; padding: 0 12px; border: 1px solid #e3e8f2; border-radius: 11px; background: #fff; color: #1a1f2e; font-size: 14px; }
.code-input { text-align: center; letter-spacing: 8px; font-size: 18px; }
.pairing-form .primary { background: #294fdb; color: #fff; }
.pairing-form .primary[disabled] { opacity: .55; }
.pairing-hint { color: #8490a5; font-size: 11px; line-height: 1.5; }
</style>
