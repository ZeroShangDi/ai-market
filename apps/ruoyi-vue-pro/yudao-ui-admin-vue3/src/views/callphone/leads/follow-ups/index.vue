<template>
  <div class="followup-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="跟进记录保存在当前浏览器。可先在线索池领取一条线索，再回来记录跟进。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div><h1>线索跟进</h1><p>为本人负责的线索记录沟通情况和下一次跟进时间。</p></div>
        <div class="heading-actions">
          <el-button :disabled="!selectedLeadId" @click="openCreate">记录跟进</el-button>
          <el-button type="primary" :disabled="!selectedLeadId" @click="openDispatch"
            >发起手机外呼</el-button
          >
        </div>
      </header>
      <el-form :inline="true" class="filter-bar"
        ><el-form-item label="我的线索"
          ><el-select
            v-model="selectedLeadId"
            class="lead-select"
            style="width: 420px"
            filterable
            clearable
            placeholder="选择一条已领取线索"
            @change="load"
            ><el-option
              v-for="lead in leads"
              :key="lead.id"
              :label="`${lead.name} · ${lead.phoneDisplay}`"
              :value="lead.id" /></el-select></el-form-item
      ></el-form>
      <el-alert
        v-if="sourceCallRecordId"
        class="source-call-banner"
        title="已定位到这次通话关联的线索跟进"
        description="完成的手机外呼会自动写入线索时间线；可从高亮记录查看通话详情。"
        type="info"
        :closable="false"
      />
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        :row-class-name="leadActivityRowClassName"
      >
        <el-table-column label="跟进时间" min-width="170"
          ><template #default="{ row }">{{ formatTime(row.createTime) }}</template></el-table-column
        >
        <el-table-column label="跟进方式" width="120"
          ><template #default="{ row }">{{
            typeLabel(row.activityType)
          }}</template></el-table-column
        >
        <el-table-column label="沟通结果" width="130"
          ><template #default="{ row }">{{
            outcomeLabel(row.outcomeCode)
          }}</template></el-table-column
        >
        <el-table-column label="跟进记录" min-width="260" prop="note" show-overflow-tooltip />
        <el-table-column label="关联通话" width="120">
          <template #default="{ row }">
            <el-button v-if="row.callRecordId" link type="primary" @click="openCallRecord(row)">
              查看通话
            </el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="下次跟进" min-width="170"
          ><template #default="{ row }">{{
            formatTime(row.nextFollowUpAt)
          }}</template></el-table-column
        >
        <template #empty
          ><el-empty
            :description="
              error ||
              (selectedLeadId ? '这条线索还没有跟进记录' : '选择一条本人已领取的线索以查看跟进记录')
            "
        /></template>
      </el-table>
      <footer class="table-footer"
        ><span>共 {{ total }} 条跟进记录</span
        ><el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="load"
      /></footer>
      <p class="privacy-note">跟进说明加密存储。拨号和录音结果仍由“通话记录”页及已配对手机处理。</p>
    </section>
    <el-dialog
      v-model="dispatchVisible"
      title="发起手机外呼"
      width="560px"
      destroy-on-close
      @closed="stopLeadDispatchPolling"
    >
      <template v-if="activeDispatch">
        <el-result
          :icon="dispatchResultIcon"
          :title="dispatchResultTitle"
          :sub-title="dispatchResultDescription"
        />
        <el-descriptions :column="1" border>
          <el-descriptions-item label="线索">{{
            selectedLead?.name || '本人线索'
          }}</el-descriptions-item>
          <el-descriptions-item label="拨号设备">{{
            activeDispatch.deviceName || '配对手机'
          }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            dispatchStatusLabel(activeDispatch.status, activeDispatch.callStage)
          }}</el-descriptions-item>
          <el-descriptions-item label="有效期至">{{
            formatTime(activeDispatch.expiresAt)
          }}</el-descriptions-item>
        </el-descriptions>
        <el-timeline v-if="activeDispatch.events?.length" class="dispatch-timeline">
          <el-timeline-item
            v-for="event in activeDispatch.events"
            :key="event.id"
            :timestamp="formatTime(event.occurredAt)"
          >
            {{ dispatchEventLabel(event.eventType) }}
          </el-timeline-item>
        </el-timeline>
        <el-alert
          v-if="activeDispatch.status === 'queued'"
          class="dispatch-hint"
          title="手机接受后才会拨号"
          description="手机自动接受后会读取号码；结束通话后，结果和备注会自动回到这条线索的跟进记录。"
          type="info"
          :closable="false"
        />
        <el-alert
          v-if="activeDispatch.status === 'accepted' && activeDispatch.callStage === 'completed'"
          class="dispatch-hint"
          title="通话结果已回填"
          description="通话记录已关联到这条线索的跟进时间线。"
          type="success"
          :closable="false"
        />
        <section
          v-if="
            previewMode &&
            ['queued', 'accepted'].includes(activeDispatch.status) &&
            activeDispatch.callStage !== 'completed'
          "
          class="preview-simulator"
        >
          <strong>预览交互</strong>
          <template v-if="activeDispatch.status === 'queued'">
            <p>模拟手机端收到派发请求后的操作：</p>
            <el-button size="small" type="primary" @click="simulateLeadAccept">手机接受</el-button>
            <el-button size="small" @click="simulateLeadDecline">手机拒绝</el-button>
            <el-button size="small" type="danger" plain @click="simulateLeadExpire"
              >模拟过期</el-button
            >
          </template>
          <template v-else>
            <p>模拟手机通话结束并回填结果：</p>
            <el-select v-model="previewCallResult" class="preview-result-select">
              <el-option label="已接通" value="connected" />
              <el-option label="无人接听" value="no_answer" />
              <el-option label="稍后联系" value="callback" />
              <el-option label="有意向" value="interested" />
              <el-option label="无意向" value="not_interested" />
            </el-select>
            <el-input
              v-model="previewCallNote"
              class="preview-result-note"
              placeholder="通话备注"
            />
            <el-button size="small" type="primary" @click="simulateLeadComplete"
              >回填通话结果</el-button
            >
          </template>
        </section>
      </template>
      <el-form v-else label-position="top">
        <div class="lead-call-summary">
          <strong>{{ selectedLead?.name }}</strong>
          <span>{{ selectedLead?.phoneDisplay }} · 本人已领取线索</span>
        </div>
        <el-form-item label="拨号设备">
          <el-select v-model="callDeviceId" class="fill" placeholder="选择在线配对手机">
            <el-option
              v-for="device in pairedDevices"
              :key="device.id"
              :label="device.displayName + ' · ' + (device.status === 'online' ? '在线' : '离线')"
              :value="device.id"
              :disabled="device.status !== 'online'"
            />
          </el-select>
          <el-button
            v-if="!pairedDevices.length"
            class="pair-device-link"
            link
            type="primary"
            @click="goToPairing"
            >前往电脑与配对</el-button
          >
        </el-form-item>
        <el-form-item label="下次跟进时间">
          <el-date-picker
            v-model="callNextFollowUpAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="fill"
            placeholder="可选；将写入外呼结果对应的线索跟进"
          />
        </el-form-item>
        <el-form-item label="给手机的拨号备注">
          <el-input
            v-model="callRequestNote"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="仅发送本次联系需要的信息"
          />
        </el-form-item>
        <el-alert
          title="号码只会在手机确认后下发"
          description="电脑先创建 5 分钟有效的派发请求；手机端确认后才读取完整号码并调用系统拨号。"
          type="info"
          :closable="false"
        />
      </el-form>
      <template #footer>
        <el-button
          v-if="activeDispatch?.status === 'queued'"
          type="danger"
          plain
          :loading="dispatchCancelling"
          @click="cancelLeadDispatch"
          >撤回请求</el-button
        >
        <el-button
          v-if="activeDispatch && ['expired', 'declined', 'failed'].includes(activeDispatch.status)"
          type="primary"
          @click="retryLeadDispatch"
          >重新发起</el-button
        >
        <el-button @click="dispatchVisible = false">{{
          activeDispatch ? '关闭' : '取消'
        }}</el-button>
        <el-button
          v-if="!activeDispatch"
          type="primary"
          :loading="dispatching"
          :disabled="!callDeviceId"
          @click="sendLeadDispatch"
          >发送到手机</el-button
        >
      </template>
    </el-dialog>

    <el-dialog v-model="dialogVisible" title="记录线索跟进" width="540px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="线索"
          ><el-input
            :model-value="selectedLead?.name + ' · ' + selectedLead?.phoneDisplay"
            disabled
        /></el-form-item>
        <el-form-item label="跟进方式" prop="activityType"
          ><el-select v-model="form.activityType" class="fill"
            ><el-option label="电话沟通" value="phone" /><el-option
              label="短信/消息"
              value="message" /><el-option label="会议/拜访" value="meeting" /><el-option
              label="其他"
              value="other" /></el-select
        ></el-form-item>
        <el-form-item label="沟通结果" prop="outcomeCode"
          ><el-select v-model="form.outcomeCode" class="fill" clearable placeholder="可选"
            ><el-option label="已接通" value="connected" /><el-option
              label="无人接听"
              value="no_answer" /><el-option label="稍后联系" value="callback" /><el-option
              label="有意向"
              value="interested" /><el-option label="无意向" value="not_interested" /></el-select
        ></el-form-item>
        <el-form-item label="跟进说明" prop="note"
          ><el-input
            v-model="form.note"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="记录客户需求、疑问或沟通结论"
        /></el-form-item>
        <el-form-item label="下次跟进时间"
          ><el-date-picker
            v-model="form.nextFollowUpAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="fill"
            placeholder="可选"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="save">保存跟进</el-button></template
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { startDirectCall } from '@/utils/callphone/direct-call'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import * as LeadApi from '@/api/callphone/lead'
import * as OutboundApi from '@/api/callphone/outbound'
import * as PreviewStore from '@/api/callphone/preview-store'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
defineOptions({ name: 'CallPhoneLeadFollowUps' })
const route = useRoute(),
  router = useRouter(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const sourceCallRecordId =
  typeof route.query.sourceCallRecordId === 'string' ? route.query.sourceCallRecordId : ''
const leads = ref<LeadApi.LeadVO[]>([]),
  selectedLeadId = ref(''),
  rows = ref<LeadApi.LeadActivityVO[]>([]),
  total = ref(0)
const loading = ref(false),
  saving = ref(false),
  dialogVisible = ref(false),
  error = ref(''),
  formRef = ref<FormInstance>()
const query = reactive({ pageNo: 1, pageSize: 10 })
const form = reactive({ activityType: 'phone', outcomeCode: '', note: '', nextFollowUpAt: '' })
const rules: FormRules = {
  activityType: [{ required: true, message: '请选择跟进方式', trigger: 'change' }],
  note: [{ required: true, message: '请填写跟进说明', trigger: 'blur' }]
}
const selectedLead = computed(() => leads.value.find((lead) => lead.id === selectedLeadId.value))
const pairedDevices = ref<OutboundApi.PairedDeviceVO[]>([])
const dispatchVisible = ref(false)
const dispatching = ref(false)
const dispatchCancelling = ref(false)
const activeDispatch = ref<OutboundApi.DispatchVO>()
const callDeviceId = ref('')
const callNextFollowUpAt = ref('')
const callRequestNote = ref('')
const previewCallResult = ref('connected')
const previewCallNote = ref('预览外呼已完成')
let leadDispatchPollTimer: ReturnType<typeof setTimeout> | undefined
let leadDispatchPollGeneration = 0
const dispatchResultTitle = computed(() => {
  const status = activeDispatch.value?.status
  if (status === 'queued') return '等待手机执行'
  if (status === 'accepted') {
    if (activeDispatch.value?.callStage === 'completed') return '通话结果已同步'
    if (activeDispatch.value?.callStage === 'dialing') return '手机正在通话'
    if (activeDispatch.value?.callStage === 'waiting') return '手机已接受，等待拨号'
    return '手机已接受'
  }
  if (status === 'expired') return '派发请求已过期'
  if (status === 'declined') return '手机端拒绝了请求'
  if (status === 'cancelled') return '派发已撤回'
  if (status === 'failed') return '派发失败'
  return '外呼状态'
})
const dispatchResultDescription = computed(() => {
  const status = activeDispatch.value?.status
  if (status === 'queued') return '请求有效期为 5 分钟，手机自动接受后会拨号。'
  if (status === 'accepted') {
    if (activeDispatch.value?.callStage === 'completed')
      return '通话记录已关联到这条线索的跟进时间线。'
    if (activeDispatch.value?.callStage === 'dialing') return '通话结束后，手机会自动回填结果。'
    if (activeDispatch.value?.callStage === 'waiting') return '手机已确认请求，请在手机上继续拨号。'
    return '等待手机拨号并回填通话结果。'
  }
  return '你可以关闭窗口，或重新发起一次外呼。'
})
const dispatchResultIcon = computed(() =>
  activeDispatch.value?.status === 'accepted'
    ? 'success'
    : ['declined', 'expired', 'failed'].includes(activeDispatch.value?.status || '')
      ? 'warning'
      : 'info'
)
async function loadLeads() {
  try {
    const page = previewMode
      ? PreviewStore.previewLeads({ pageNo: 1, pageSize: 100 })
      : await LeadApi.getLeadPage({ pageNo: 1, pageSize: 100 })
    leads.value = (page.list || []).filter((lead: LeadApi.LeadVO) => lead.status === 'claimed')
    if (!selectedLeadId.value && leads.value.length) selectedLeadId.value = leads.value[0].id
  } catch (e: any) {
    error.value = e?.message || '线索加载失败'
  }
}
async function load() {
  if (!selectedLeadId.value) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  error.value = ''
  try {
    const params = { ...query, leadId: selectedLeadId.value }
    const page = previewMode
      ? PreviewStore.previewLeadActivities(params)
      : await LeadApi.getLeadActivityPage(params)
    rows.value = page.list || []
    total.value = page.total || 0
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.message || '跟进记录加载失败'
  } finally {
    loading.value = false
  }
}
function openCreate() {
  Object.assign(form, { activityType: 'phone', outcomeCode: '', note: '', nextFollowUpAt: '' })
  dialogVisible.value = true
}
async function save() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const payload = {
      ...form,
      leadId: selectedLeadId.value,
      outcomeCode: form.outcomeCode || undefined,
      nextFollowUpAt: form.nextFollowUpAt || undefined
    }
    if (previewMode) {
      if (!PreviewStore.createPreviewLeadActivity(payload))
        throw new Error('线索状态已变化，请刷新')
    } else await LeadApi.createLeadActivity(payload)
    ElMessage.success('跟进记录已保存')
    dialogVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
async function openDispatch() {
  if (!selectedLead.value) return
  if (previewMode) {
    ElMessage.info('预览模式不拨打真实电话')
    return
  }
  const result = await startDirectCall({ leadId: selectedLead.value.id, source: 'lead_followup' })
  if (result) activeDispatch.value = result
}
async function sendLeadDispatch() {
  if (!selectedLead.value || !callDeviceId.value) return
  dispatching.value = true
  try {
    const device = pairedDevices.value.find((item) => item.id === callDeviceId.value)
    activeDispatch.value = previewMode
      ? {
          id: `preview-lead-${Date.now()}`,
          leadId: selectedLead.value.id,
          customerName: selectedLead.value.name,
          phoneDisplay: selectedLead.value.phoneDisplay,
          status: 'queued',
          deviceName: device?.displayName || '预览手机',
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          events: [
            {
              id: `event-${Date.now()}`,
              eventType: 'created',
              occurredAt: new Date().toISOString()
            }
          ]
        }
      : await OutboundApi.createCallDispatch({
          leadId: selectedLead.value.id,
          deviceId: callDeviceId.value,
          source: 'lead_followup',
          requestNote: callRequestNote.value || undefined,
          nextFollowUpAt: callNextFollowUpAt.value || undefined,
          idempotencyKey: crypto.randomUUID()
        })
    ElMessage.success('外呼请求已发送到手机')
    startLeadDispatchPolling()
  } catch (e: any) {
    ElMessage.error(e?.message || '外呼派发失败')
  } finally {
    dispatching.value = false
  }
}
function startLeadDispatchPolling() {
  stopLeadDispatchPolling()
  if (previewMode || !activeDispatch.value) return
  const generation = leadDispatchPollGeneration
  const poll = async () => {
    const current = activeDispatch.value
    if (
      generation !== leadDispatchPollGeneration ||
      !current ||
      !dispatchVisible.value ||
      !leadDispatchNeedsPolling(current)
    )
      return stopLeadDispatchPolling()
    try {
      const latest = await OutboundApi.getCallDispatch(current.id)
      if (generation !== leadDispatchPollGeneration || activeDispatch.value?.id !== current.id)
        return
      if (!latest) {
        leadDispatchPollTimer = setTimeout(poll, 2000)
        return
      }
      activeDispatch.value = latest
      if (!leadDispatchNeedsPolling(latest)) {
        stopLeadDispatchPolling()
        if (latest.status === 'accepted' && latest.callStage === 'completed') await load()
        return
      }
    } catch {
      /* Keep the last known dispatch state; the next poll can recover. */
    }
    if (generation === leadDispatchPollGeneration) leadDispatchPollTimer = setTimeout(poll, 2000)
  }
  void poll()
}
function leadDispatchNeedsPolling(dispatch?: OutboundApi.DispatchVO) {
  return (
    dispatch?.status === 'queued' ||
    (dispatch?.status === 'accepted' && dispatch.callStage !== 'completed')
  )
}
function stopLeadDispatchPolling() {
  if (leadDispatchPollTimer) clearTimeout(leadDispatchPollTimer)
  leadDispatchPollTimer = undefined
  leadDispatchPollGeneration += 1
}
async function cancelLeadDispatch() {
  if (!activeDispatch.value) return
  dispatchCancelling.value = true
  try {
    if (previewMode) {
      activeDispatch.value = {
        ...activeDispatch.value,
        status: 'cancelled',
        events: [
          ...(activeDispatch.value.events || []),
          {
            id: `event-${Date.now()}`,
            eventType: 'cancelled',
            occurredAt: new Date().toISOString()
          }
        ]
      }
    } else {
      await OutboundApi.cancelCallDispatch(activeDispatch.value.id)
      activeDispatch.value = await OutboundApi.getCallDispatch(activeDispatch.value.id)
    }
    stopLeadDispatchPolling()
  } catch (e: any) {
    ElMessage.error(e?.message || '撤回失败')
  } finally {
    dispatchCancelling.value = false
  }
}
function retryLeadDispatch() {
  activeDispatch.value = undefined
  void openDispatch()
}
function goToPairing() {
  dispatchVisible.value = false
  router.push(
    previewMode
      ? { path: '/callphone-preview/device-pairing', query: { preview: '1' } }
      : { path: '/callphone/settings/device-pairing' }
  )
}
function dispatchStatusLabel(status: string, callStage?: OutboundApi.DispatchVO['callStage']) {
  if (status === 'accepted' && callStage === 'completed') return '通话已完成'
  if (status === 'accepted' && callStage === 'dialing') return '通话中'
  return (
    (
      {
        queued: '等待手机',
        accepted: '已接受',
        expired: '已过期',
        declined: '已拒绝',
        cancelled: '已撤回',
        failed: '失败'
      } as Record<string, string>
    )[status] || status
  )
}
function dispatchEventLabel(type: string) {
  return (
    (
      {
        created: '请求已创建',
        accepted: '手机已接受',
        declined: '手机已拒绝',
        expired: '请求已过期',
        cancelled: '请求已撤回',
        failed: '派发失败'
      } as Record<string, string>
    )[type] || type
  )
}
function simulateLeadAccept() {
  if (activeDispatch.value)
    activeDispatch.value = {
      ...activeDispatch.value,
      status: 'accepted',
      callStage: 'dialing',
      events: [
        ...(activeDispatch.value.events || []),
        { id: `event-${Date.now()}`, eventType: 'accepted', occurredAt: new Date().toISOString() }
      ]
    }
}
function simulateLeadDecline() {
  if (activeDispatch.value)
    activeDispatch.value = {
      ...activeDispatch.value,
      status: 'declined',
      events: [
        ...(activeDispatch.value.events || []),
        { id: `event-${Date.now()}`, eventType: 'declined', occurredAt: new Date().toISOString() }
      ]
    }
}
function simulateLeadExpire() {
  if (activeDispatch.value)
    activeDispatch.value = {
      ...activeDispatch.value,
      status: 'expired',
      events: [
        ...(activeDispatch.value.events || []),
        { id: `event-${Date.now()}`, eventType: 'expired', occurredAt: new Date().toISOString() }
      ]
    }
}
async function simulateLeadComplete() {
  if (!activeDispatch.value || !selectedLead.value) return
  const saved = PreviewStore.completePreviewLeadCall({
    leadId: selectedLead.value.id,
    deviceName: activeDispatch.value.deviceName,
    outcomeCode: previewCallResult.value,
    note: previewCallNote.value || '预览外呼已完成',
    nextFollowUpAt: callNextFollowUpAt.value || undefined
  })
  if (!saved) return ElMessage.error('线索状态已变化，请刷新后重试')
  activeDispatch.value = {
    ...activeDispatch.value,
    callRecordId: saved.id,
    status: 'accepted',
    callStage: 'completed',
    events: activeDispatch.value.events || []
  }
  ElMessage.success('模拟通话结果已写入线索跟进')
  await load()
}
function openCallRecord(row: LeadApi.LeadActivityVO) {
  if (!row.callRecordId) return
  void router.push(
    previewMode
      ? {
          path: '/callphone-preview/outbound-records',
          query: { preview: '1', callRecordId: row.callRecordId }
        }
      : { path: '/callphone/outbound/records', query: { callRecordId: row.callRecordId } }
  )
}
function typeLabel(value: string) {
  return (
    (
      { phone: '电话沟通', message: '短信/消息', meeting: '会议/拜访', other: '其他' } as Record<
        string,
        string
      >
    )[value] || value
  )
}
function outcomeLabel(value?: string) {
  return (
    (
      {
        connected: '已接通',
        no_answer: '无人接听',
        callback: '稍后联系',
        interested: '有意向',
        not_interested: '无意向'
      } as Record<string, string>
    )[value || ''] || '—'
  )
}
function leadActivityRowClassName({ row }: { row: LeadApi.LeadActivityVO }) {
  return sourceCallRecordId && row.callRecordId === sourceCallRecordId ? 'related-call-row' : ''
}
function formatTime(value?: string) {
  return value ? parseCallPhoneDateTime(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
onMounted(async () => {
  await loadLeads()
  const leadId = typeof route.query.leadId === 'string' ? route.query.leadId : ''
  if (leadId && leads.value.some((lead) => lead.id === leadId)) selectedLeadId.value = leadId
  await load()
})
onBeforeUnmount(stopLeadDispatchPolling)
</script>

<style scoped>
.followup-page {
  padding: 20px;
}

.preview-banner {
  margin-bottom: 14px;
}

.page-panel {
  padding: 22px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.filter-bar {
  margin-bottom: 8px;
}

.lead-select {
  width: min(420px, 100%);
}

.source-call-banner {
  margin: 0 0 14px;
}

:deep(.el-table__body tr.related-call-row > td) {
  background: var(--el-color-primary-light-9) !important;
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

.heading-actions {
  display: flex;
  gap: 10px;
}

.lead-call-summary {
  display: grid;
  padding: 14px 16px;
  margin-bottom: 18px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  gap: 6px;
}

.lead-call-summary span,
.preview-simulator p {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.pair-device-link {
  margin-top: 6px;
}

.dispatch-hint {
  margin-top: 18px;
}

.dispatch-timeline {
  margin: 20px 0 0;
}

.preview-simulator {
  display: flex;
  padding: 14px;
  margin-top: 18px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 8px;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.preview-simulator p {
  width: 100%;
  margin: 0;
}

.preview-result-select {
  width: 130px;
}

.preview-result-note {
  flex: 1;
  min-width: 140px;
}

@media (width <= 720px) {
  .page-heading,
  .table-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }

  .page-panel {
    padding: 16px;
  }

  .followup-page {
    padding: 12px;
  }
}
</style>
