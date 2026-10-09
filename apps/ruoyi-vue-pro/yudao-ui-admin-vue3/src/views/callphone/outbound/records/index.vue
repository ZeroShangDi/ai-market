<template>
  <div class="call-records-page">
    <div v-if="previewMode" class="preview-banner">
      样例数据仅用于交互预览，不对应数据库中的真实客户或通话记录
    </div>

    <section class="page-panel">
      <header class="page-heading">
        <div>
          <h1>通话记录</h1>
          <p>查看手机端外呼与来电结果；拨号请求经配对手机确认后执行。</p>
        </div>
        <div class="heading-actions">
          <el-button v-if="previewMode" disabled>导出</el-button>
          <el-button
            v-else
            v-hasPermi="['callphone:call:record:export']"
            :loading="exportLoading"
            @click="handleExport"
            >导出</el-button
          >
          <el-button type="primary" @click="openStartDrawer()">发起外呼</el-button>
        </div>
      </header>

      <section class="metrics-grid">
        <article v-for="metric in metrics" :key="metric.label" class="metric-card">
          <span>{{ metric.label }}</span>
          <div class="metric-value-line">
            <strong>{{ metric.value }}</strong>
            <small :class="{ positive: metric.positive }">{{ metric.hint }}</small>
          </div>
        </article>
      </section>

      <el-form class="filter-bar" :inline="true" :model="query" @submit.prevent="search">
        <el-form-item label="日期范围">
          <el-select v-model="query.dateRange" class="w-160" @change="handleDateRangeChange">
            <el-option label="近 7 天" value="7d" />
            <el-option label="近 30 天" value="30d" />
            <el-option label="今天" value="today" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="query.dateRange === 'custom'" label="自定义日期">
          <el-date-picker
            v-model="query.customDateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            range-separator="至"
            :clearable="false"
            @change="search"
          />
        </el-form-item>
        <el-form-item label="方向">
          <el-select
            v-model="query.direction"
            clearable
            class="w-92"
            placeholder="全部"
            @change="search"
          >
            <el-option label="呼出" value="outbound" />
            <el-option label="呼入" value="inbound" />
          </el-select>
        </el-form-item>
        <el-form-item label="通话结果">
          <el-select
            v-model="query.resultCode"
            clearable
            class="w-124"
            placeholder="全部结果"
            @change="search"
          >
            <el-option
              v-for="item in resultOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="previewMode" label="负责人">
          <el-select
            v-model="query.ownerUserId"
            clearable
            class="w-124"
            placeholder="全部成员"
            @change="search"
          >
            <el-option v-for="item in owners" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="录音">
          <el-select
            v-model="query.recordingState"
            clearable
            class="w-92"
            placeholder="全部"
            @change="search"
          >
            <el-option label="有录音" value="ready" />
            <el-option label="待同步" value="pending" />
            <el-option label="无录音" value="none" />
          </el-select>
        </el-form-item>
        <el-form-item class="search-item">
          <el-input
            v-model="query.query"
            clearable
            placeholder="搜索号码后四位"
            @keyup.enter="search"
          />
        </el-form-item>
        <el-form-item>
          <el-button @click="search">筛选</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table
        v-loading="loading"
        :data="rows"
        class="record-table"
        row-key="id"
        @row-click="openDetail"
      >
        <el-table-column label="客户" prop="customerName" min-width="110" />
        <el-table-column label="号码" prop="phoneDisplay" min-width="130" />
        <el-table-column label="方向" width="76">
          <template #default="{ row }"
            ><el-tag effect="light" round>{{
              row.direction === 'outbound' ? '呼出' : '呼入'
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="负责人" prop="ownerName" min-width="96" />
        <el-table-column label="开始时间" min-width="145">
          <template #default="{ row }">{{ formatTime(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column label="时长" width="86">
          <template #default="{ row }">{{ duration(row.durationSeconds) }}</template>
        </el-table-column>
        <el-table-column label="通话结果" width="112">
          <template #default="{ row }"
            ><el-tag :type="resultType(row.resultCode)" effect="light" round>{{
              resultLabel(row.resultCode, row.status)
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="录音/摘要" min-width="142">
          <template #default="{ row }">
            <el-button
              v-if="row.recordingState === 'ready' && previewMode"
              link
              type="primary"
              @click.stop="showNotice('这是演示通话，没有真实录音文件')"
              >录音</el-button
            >
            <el-button
              v-else-if="row.recordingState === 'ready'"
              link
              type="primary"
              @click.stop="openDetail(row)"
              >可播放</el-button
            >
            <span v-else>{{ row.recordingState === 'pending' ? '录音待同步' : '无录音' }}</span>
            <span class="muted"> · {{ row.summaryState === 'ready' ? '摘要' : '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="下一步" prop="nextStep" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="84" fixed="right">
          <template #default="{ row }"
            ><el-button link type="primary" @click.stop="openDetail(row)">详情</el-button></template
          >
        </el-table-column>
        <template #empty>
          <el-empty :description="loadError || '暂无通话记录'" />
        </template>
      </el-table>

      <footer class="table-footer">
        <span
          >共 {{ total.toLocaleString() }} 条 · 外呼
          {{ outboundCount === null ? '—' : `${outboundCount.toLocaleString()} 条` }}</span
        >
        <el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="loadRecords"
        />
      </footer>
      <p class="privacy-note">外呼请求发到手机后，只有手机确认并完成拨号才会生成通话记录。</p>
    </section>

    <el-drawer
      v-model="startVisible"
      title="发起外呼"
      size="500px"
      class="callphone-drawer"
      :before-close="closeStartDrawer"
    >
      <template #header
        ><div class="drawer-title"
          ><div
            ><strong>发起外呼</strong
            ><p>将客户与拨号信息发送到已配对手机；手机确认后才会调用系统拨号。</p></div
          ></div
        ></template
      >
      <div class="drawer-content">
        <el-form label-position="top" class="dispatch-form customer-picker">
          <el-form-item label="选择客户">
            <el-select
              v-model="dispatch.customerId"
              class="fill"
              filterable
              remote
              clearable
              :remote-method="searchCustomers"
              :loading="customerLoading"
              placeholder="搜索客户姓名或号码后四位"
              @change="selectCustomer"
            >
              <el-option
                v-for="customer in customerOptions"
                :key="customer.customerId"
                :label="`${customer.customerName} · ${customer.phoneDisplay}`"
                :value="customer.customerId"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <div class="customer-summary">
          <strong>{{ selectedCustomer?.customerName || '尚未选择客户' }}</strong>
          <span>{{ selectedCustomer?.phoneDisplay || '选择客户后展示脱敏号码' }}</span>
          <small v-if="selectedCustomer">负责人：{{ selectedCustomer.ownerName }}</small>
        </div>
        <el-form label-position="top" class="dispatch-form">
          <el-form-item label="拨号设备">
            <el-select v-model="dispatch.deviceId" class="fill" placeholder="请选择已配对手机">
              <el-option
                v-for="device in devices"
                :key="device.id"
                :label="`${device.displayName} · ${device.status === 'online' ? '在线' : '离线'}`"
                :value="device.id"
                :disabled="device.status !== 'online'"
              />
            </el-select>
            <small v-if="devices.length" class="form-hint"
              >最近活动 {{ relativeTime(devices[0]?.lastSeenAt) }} · 配对有效</small
            >
            <small v-else class="form-hint warning"
              >没有在线配对手机，请先到「电脑与配对」完成配对。</small
            >
          </el-form-item>
          <el-form-item label="拨号来源">
            <el-select v-model="dispatch.source" class="fill">
              <el-option label="客户详情 · 手动发起" value="customer_detail" />
              <el-option label="客户列表 · 手动发起" value="customer_list" />
            </el-select>
          </el-form-item>
          <el-form-item label="关联话术">
            <el-select v-model="dispatch.script" class="fill" placeholder="请选择话术" clearable>
              <el-option label="首次回访 · 开场确认" value="first_follow_up" />
              <el-option label="产品咨询 · 需求了解" value="product_inquiry" />
            </el-select>
            <small class="form-hint">可选提示；手机端仍由员工自主拨号和沟通</small>
          </el-form-item>
          <el-form-item label="关联状态">
            <el-select v-model="dispatch.followUp" class="fill">
              <el-option label="首次回访 · 开场确认" value="first_contact" />
              <el-option label="客户咨询 · 等待回电" value="awaiting_callback" />
              <el-option label="常规跟进" value="normal" />
            </el-select>
          </el-form-item>
          <el-form-item label="下次跟进时间">
            <el-date-picker
              v-model="dispatch.nextFollowUpAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm:ss"
              class="fill"
              placeholder="可选；通话结果回填时写入跟进计划"
            />
          </el-form-item>
          <el-form-item label="发给手机的提醒（选填）">
            <el-input
              v-model="dispatch.requestNote"
              type="textarea"
              :rows="3"
              maxlength="200"
              show-word-limit
              placeholder="例如：确认客户关注的产品型号"
            />
          </el-form-item>
        </el-form>
        <div class="dispatch-explainer"
          ><strong>拨号由手机端执行</strong
          ><p
            >发送后等待手机确认，有效期 5 分钟。PC
            不会直接呼叫客户；完整号码仅在设备确认且权限校验通过后返回。</p
          ></div
        >
      </div>
      <template #footer
        ><div class="drawer-footer"
          ><el-button @click="startVisible = false">取消</el-button
          ><el-button
            type="primary"
            :loading="dispatching"
            :disabled="!dispatch.deviceId || !dispatch.customerId"
            @click="sendDispatch"
            >发送到手机</el-button
          ></div
        ></template
      >
    </el-drawer>

    <el-drawer v-model="detailVisible" title="通话详情" size="520px" class="callphone-drawer">
      <div v-if="detail" class="detail-content">
        <div class="detail-title"
          ><strong>{{ detail.customerName }}</strong
          ><el-tag :type="resultType(detail.resultCode)" round>{{
            resultLabel(detail.resultCode, detail.status)
          }}</el-tag></div
        >
        <el-descriptions :column="1" border>
          <el-descriptions-item label="号码">{{ detail.phoneDisplay }}</el-descriptions-item>
          <el-descriptions-item label="方向">{{
            detail.direction === 'outbound' ? '呼出' : '呼入'
          }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ detail.ownerName }}</el-descriptions-item>
          <el-descriptions-item label="拨号设备">{{
            detail.deviceName || '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{
            formatTime(detail.startedAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="通话时长">{{
            duration(detail.durationSeconds)
          }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ detail.note || '暂无备注' }}</el-descriptions-item>
        </el-descriptions>
        <section v-if="detail.recordingState === 'ready'" class="recording-player">
          <div class="recording-player-heading">
            <strong>通话录音</strong>
            <el-button type="primary" plain :loading="recordingLoading" @click="loadRecording">
              {{ recordingUrl ? '重新加载' : '播放录音' }}
            </el-button>
          </div>
          <audio v-if="recordingUrl" :src="recordingUrl" controls preload="none"></audio>
        </section>
        <el-alert
          v-else-if="detail.recordingState === 'pending'"
          title="录音待同步"
          description="手机录音尚未上传到客户侧数据服务。"
          type="info"
          :closable="false"
        />
        <el-divider content-position="left">外呼与同步状态</el-divider>
        <el-timeline>
          <el-timeline-item
            v-for="event in detailEvents"
            :key="event.key"
            :timestamp="event.time"
            :type="event.type"
            >{{ event.title }}<p class="muted">{{ event.description }}</p></el-timeline-item
          >
        </el-timeline>
        <el-alert
          v-if="detail.status === 'requested'"
          title="等待手机端确认"
          description="手机接受后才会调用系统拨号；超时或拒绝不会生成已完成通话。"
          type="info"
          :closable="false"
        />
        <div v-if="!previewMode || detail.customerId || detail.leadId" class="detail-actions">
          <el-button type="primary" @click="openRelatedFollowUp">
            <Icon :icon="detail.leadId ? 'ep:list' : 'ep:calendar'" />
            {{ detail.leadId ? '查看线索跟进' : '基于本次通话创建跟进' }}
          </el-button>
        </div>
      </div>
    </el-drawer>

    <el-drawer
      v-model="dispatchStatusVisible"
      title="外呼派发状态"
      size="420px"
      class="callphone-drawer"
      @closed="stopDispatchPolling"
    >
      <div v-if="activeDispatch" class="dispatch-status-content">
        <el-result
          :icon="dispatchStatusIcon"
          :title="dispatchStatusTitle"
          :sub-title="dispatchStatusDescription"
        />
        <el-descriptions :column="1" border>
          <el-descriptions-item label="目标设备">{{
            activeDispatch.deviceName || '配对手机'
          }}</el-descriptions-item>
          <el-descriptions-item label="有效期至">{{
            formatTime(activeDispatch.expiresAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="派发编号">{{ activeDispatch.id }}</el-descriptions-item>
        </el-descriptions>
        <section v-if="activeDispatch.events?.length" class="dispatch-event-section">
          <h3>状态时间线</h3>
          <el-timeline>
            <el-timeline-item
              v-for="event in activeDispatch.events"
              :key="event.id"
              :timestamp="formatTime(event.occurredAt)"
              :type="dispatchEventType(event.eventType)"
            >
              <strong>{{ dispatchEventLabel(event.eventType) }}</strong>
              <p v-if="event.reasonCode" class="muted"
                >手机原因：{{ dispatchReasonLabel(event.reasonCode) }}</p
              >
            </el-timeline-item>
          </el-timeline>
        </section>
        <el-alert
          v-if="activeDispatch.status === 'queued'"
          class="status-hint"
          title="手机端接受后才会拨号"
          description="当前仅表示请求已发送并等待手机确认，不代表已经拨号或接通。"
          type="info"
          :closable="false"
        />
        <div
          v-if="previewMode && activeDispatch.status === 'queued'"
          class="preview-status-actions"
        >
          <span>原型状态演示</span>
          <el-button size="small" @click="setPreviewDispatchStatus('accepted')">手机接受</el-button>
          <el-button size="small" @click="setPreviewDispatchStatus('declined')">手机拒绝</el-button>
          <el-button size="small" @click="setPreviewDispatchStatus('expired')">模拟过期</el-button>
        </div>
        <div
          v-if="
            previewMode &&
            activeDispatch.status === 'accepted' &&
            activeDispatch.callStage !== 'completed'
          "
          class="preview-phone-flow"
        >
          <el-alert
            :title="activeDispatch.callStage === 'dialing' ? '手机正在通话' : '手机已接受派发'"
            :description="
              activeDispatch.callStage === 'dialing'
                ? '结束后选择通话结果并回填到记录。'
                : '模拟手机用户点击拨号，开始通话。'
            "
            type="success"
            :closable="false"
          />
          <el-button
            v-if="activeDispatch.callStage !== 'dialing'"
            type="primary"
            @click="startPreviewCall"
            >手机开始拨号</el-button
          >
          <template v-else>
            <el-form label-position="top"
              ><el-form-item label="通话结果"
                ><el-select v-model="previewResultCode" class="fill"
                  ><el-option
                    v-for="item in resultOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value" /></el-select></el-form-item
              ><el-form-item label="通话备注"
                ><el-input
                  v-model="previewCallNote"
                  type="textarea"
                  :rows="2"
                  maxlength="200"
                  placeholder="记录沟通结果和下一步" /></el-form-item
            ></el-form>
            <el-button type="primary" @click="completePreviewCall">结束通话并回填</el-button>
          </template>
        </div>
        <el-alert
          v-if="activeDispatch.status === 'accepted' && activeDispatch.callStage === 'completed'"
          class="status-hint"
          title="通话结果已回填"
          description="手机已完成通话并回填结果，记录已加入通话记录列表。"
          type="success"
          :closable="false"
        />
        <div class="status-actions">
          <el-button
            v-if="activeDispatch.status === 'queued'"
            type="danger"
            plain
            @click="cancelDispatch"
            >撤回请求</el-button
          >
          <el-button
            v-if="['expired', 'failed', 'declined'].includes(activeDispatch.status)"
            type="primary"
            @click="retryDispatch"
            >重新发起</el-button
          >
          <el-button @click="dispatchStatusVisible = false">关闭</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import * as OutboundApi from '@/api/callphone/outbound'
import * as DictDataApi from '@/api/system/dict/dict.data'
import * as PreviewStore from '@/api/callphone/preview-store'
import download from '@/utils/download'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'

defineOptions({ name: 'CallPhoneOutboundRecords' })

const route = useRoute()
const router = useRouter()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false)
const dispatching = ref(false)
const exportLoading = ref(false)
const loadError = ref('')
const startVisible = ref(false)
const detailVisible = ref(false)
const total = ref(0)
const outboundCount = ref<number | null>(null)
const rows = ref<OutboundApi.CallRecordVO[]>([])
const devices = ref<OutboundApi.PairedDeviceVO[]>([])
interface CustomerOptionVO {
  customerId: string
  customerName: string
  phoneDisplay: string
  ownerName?: string
}
type OutboundDispatchDraft = {
  customerId: string
  deviceId: string
  source: 'customer_detail' | 'customer_list'
  scriptCode?: string
  followUpStatus: string
  requestNote: string
  nextFollowUpAt?: string
  customer: CustomerOptionVO
}
const customerOptions = ref<CustomerOptionVO[]>([])
const customerLoading = ref(false)
const detail = ref<OutboundApi.CallRecordVO>()
const recordingUrl = ref('')
const recordingLoading = ref(false)
const backendEvents = ref<OutboundApi.CallRecordEventVO[]>([])
const activeDispatch = ref<OutboundApi.DispatchVO>()
const previewResultCode = ref('connected')
const previewCallNote = ref('')
const dispatchStatusVisible = ref(false)
const lastDispatchDraft = ref<OutboundDispatchDraft>()
let dispatchPollTimer: ReturnType<typeof setTimeout> | undefined
let dispatchPollGeneration = 0
const selectedCustomer = ref<CustomerOptionVO>()
const resultOptions = ref<Array<{ value: string; label: string }>>([
  { value: 'connected', label: '已接通' },
  { value: 'no_answer', label: '无人接听' },
  { value: 'busy', label: '忙线' },
  { value: 'rejected', label: '拒接' },
  { value: 'invalid_number', label: '号码无效' },
  { value: 'other', label: '其他' }
])
const owners = [
  { id: '3001', name: '林静' },
  { id: '3002', name: '王小虎' },
  { id: '3003', name: '周宁' }
]
const metrics = ref([
  { label: '外呼接通率', value: '—', hint: '统计读取中', positive: false },
  { label: '今日外呼', value: '—', hint: '统计读取中', positive: false },
  { label: '通话时长', value: '—', hint: '统计读取中', positive: false },
  { label: '待跟进', value: '—', hint: '统计读取中', positive: false }
])
const query = reactive({
  pageNo: 1,
  pageSize: 10,
  dateRange: '7d',
  customDateRange: [] as string[],
  direction: undefined as string | undefined,
  resultCode: undefined as string | undefined,
  ownerUserId: undefined as string | undefined,
  recordingState: undefined as string | undefined,
  query: ''
})
const dispatch = reactive({
  customerId: '',
  deviceId: '',
  source: 'customer_detail' as 'customer_detail' | 'customer_list',
  script: '',
  followUp: 'first_contact',
  requestNote: '',
  nextFollowUpAt: ''
})
let dispatchIdempotencyKeys = new Map<string, string>()

const previewRows: OutboundApi.CallRecordVO[] = [
  {
    id: '9001',
    customerId: 'cp-demo-1001',
    customerName: '张先生',
    phoneDisplay: '138 **** 8000',
    direction: 'outbound',
    ownerUserId: '3001',
    ownerName: '林静',
    deviceName: '林静的 iPhone 15 Pro',
    status: 'ended',
    resultCode: 'connected',
    startedAt: new Date().toISOString(),
    durationSeconds: 198,
    recordingState: 'ready',
    summaryState: 'ready',
    nextStep: '发送产品资料',
    note: '关注旗舰型号，周五回访',
    version: 1
  },
  {
    id: '9002',
    customerId: 'cp-demo-1002',
    customerName: '李女士',
    phoneDisplay: '186 **** 2606',
    direction: 'outbound',
    ownerUserId: '3002',
    ownerName: '王小虎',
    deviceName: '王小虎的 Android',
    status: 'ended',
    resultCode: 'no_answer',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    durationSeconds: 0,
    recordingState: 'none',
    summaryState: 'unavailable',
    nextStep: '稍后再次拨打',
    version: 1
  },
  {
    id: '9003',
    customerId: 'cp-demo-1003',
    customerName: '王老板',
    phoneDisplay: '139 **** 5714',
    direction: 'outbound',
    ownerUserId: '3001',
    ownerName: '林静',
    deviceName: '林静的 iPhone 15 Pro',
    status: 'ended',
    resultCode: 'connected',
    startedAt: new Date(Date.now() - 86400000).toISOString(),
    durationSeconds: 106,
    recordingState: 'ready',
    summaryState: 'ready',
    nextStep: '预约到店演示',
    version: 1
  },
  {
    id: '9004',
    customerId: '1004',
    customerName: '赵师傅',
    phoneDisplay: '135 **** 1130',
    direction: 'inbound',
    ownerUserId: '3002',
    ownerName: '王小虎',
    status: 'ended',
    resultCode: 'connected',
    startedAt: new Date(Date.now() - 90000000).toISOString(),
    durationSeconds: 144,
    recordingState: 'none',
    summaryState: 'unavailable',
    nextStep: '确认服务时间',
    version: 1
  },
  {
    id: '9005',
    customerId: '1005',
    customerName: '陈晓峰',
    phoneDisplay: '137 **** 2218',
    direction: 'outbound',
    ownerUserId: '3003',
    ownerName: '周宁',
    status: 'ended',
    resultCode: 'busy',
    startedAt: new Date(Date.now() - 172800000).toISOString(),
    durationSeconds: 0,
    recordingState: 'none',
    summaryState: 'unavailable',
    nextStep: '明天上午重试',
    version: 1
  },
  {
    id: '9006',
    customerId: '1006',
    customerName: '周女士',
    phoneDisplay: '188 **** 4291',
    direction: 'outbound',
    ownerUserId: '3001',
    ownerName: '林静',
    status: 'ended',
    resultCode: 'connected',
    startedAt: new Date(Date.now() - 259200000).toISOString(),
    durationSeconds: 242,
    recordingState: 'ready',
    summaryState: 'pending',
    nextStep: '补充需求标签',
    version: 1
  },
  {
    id: '9007',
    customerId: '1007',
    customerName: '刘先生',
    phoneDisplay: '187 **** 7610',
    direction: 'outbound',
    ownerUserId: '3002',
    ownerName: '王小虎',
    status: 'ended',
    resultCode: 'invalid_number',
    startedAt: new Date(Date.now() - 345600000).toISOString(),
    durationSeconds: 0,
    recordingState: 'none',
    summaryState: 'unavailable',
    nextStep: '核对联系方式',
    version: 1
  }
]

const detailEvents = computed(() => {
  if (!detail.value) return []
  if (!previewMode) {
    const created = detail.value.createTime
      ? [
          {
            key: `created-${detail.value.id}`,
            title: '通话记录已创建',
            time: formatTime(detail.value.createTime),
            description: `由 ${detail.value.ownerName} 发起外呼派发`,
            type: 'primary' as const
          }
        ]
      : []
    const eventLabels: Record<
      OutboundApi.CallRecordEventVO['eventType'],
      { title: string; type: 'primary' | 'success' | 'warning' }
    > = {
      accepted: { title: '手机已接受派发', type: 'success' },
      declined: { title: '手机拒绝派发', type: 'warning' },
      started: { title: '手机已开始拨号', type: 'primary' },
      completed: { title: '通话结果已同步', type: 'success' }
    }
    return [
      ...created,
      ...backendEvents.value.map((event) => ({
        key: event.id,
        title: eventLabels[event.eventType]?.title || '手机状态已同步',
        time: formatTime(event.occurredAt),
        description: detail.value?.deviceName || '配对设备',
        type: eventLabels[event.eventType]?.type || ('info' as const)
      }))
    ]
  }
  const events: {
    key: string
    title: string
    time: string
    description: string
    type: 'primary' | 'success' | 'warning' | 'info'
  }[] = [
    {
      key: `created-${detail.value.id}`,
      title: '请求已创建',
      time: formatTime(detail.value.startedAt),
      description: `由 ${detail.value.ownerName} 发起`,
      type: 'primary'
    }
  ]
  if (detail.value.deviceName)
    events.push({
      key: `accepted-${detail.value.id}`,
      title: '手机已确认并拨号',
      time: formatTime(detail.value.startedAt),
      description: detail.value.deviceName,
      type: 'success' as const
    })
  if (detail.value.status === 'ended')
    events.push({
      key: `completed-${detail.value.id}`,
      title: '通话结果已同步',
      time: formatTime(detail.value.endedAt || detail.value.startedAt),
      description: `${resultLabel(detail.value.resultCode, detail.value.status)} · ${duration(detail.value.durationSeconds)}`,
      type: 'success' as const
    })
  return events
})

function previewSummary() {
  const saved = PreviewStore.previewCallRecords() as OutboundApi.CallRecordVO[]
  rows.value = [...saved, ...previewRows]
  total.value = 1286 + saved.length
  outboundCount.value = 1042 + saved.filter((row) => row.direction === 'outbound').length
  metrics.value = [
    { label: '外呼接通率', value: '68.4%', hint: '较上期 +4.2%', positive: true },
    { label: '今日外呼', value: '128', hint: '已同步 124 条', positive: true },
    { label: '通话时长', value: '6小时 42分', hint: '平均 3分 08秒', positive: true },
    { label: '待跟进', value: '12', hint: '3 项今天到期', positive: true }
  ]
}

async function loadRecords() {
  if (previewMode) return previewSummary()
  loading.value = true
  loadError.value = ''
  try {
    const params = { pageNo: query.pageNo, pageSize: query.pageSize, ...getCallRecordFilters() }
    const [dataResult, summaryResult] = await Promise.allSettled([
      OutboundApi.getCallRecordPage(params),
      OutboundApi.getCallRecordSummary(params)
    ])
    if (dataResult.status === 'rejected') throw dataResult.reason
    const data = dataResult.value
    rows.value = data.list || []
    total.value = data.total || 0
    if (summaryResult.status === 'rejected') {
      outboundCount.value = null
      metrics.value = [
        { label: '外呼接通率', value: '—', hint: '统计暂不可用', positive: false },
        { label: '今日外呼', value: '—', hint: '统计暂不可用', positive: false },
        { label: '通话时长', value: '—', hint: '统计暂不可用', positive: false },
        { label: '待跟进', value: '—', hint: '统计暂不可用', positive: false }
      ]
      return
    }
    const summary = summaryResult.value
    const ownerScopeHint = query.ownerUserId ? '所选负责人' : '当前权限范围'
    outboundCount.value = summary.outboundCount || 0
    const totalMinutes = Math.floor((summary.durationSeconds || 0) / 60)
    const totalHours = Math.floor(totalMinutes / 60)
    metrics.value = [
      {
        label: '外呼接通率',
        value: `${(summary.outboundConnectRate || 0).toFixed(1)}%`,
        hint: '当前筛选范围',
        positive: true
      },
      {
        label: '今日外呼',
        value: String(summary.todayOutboundCount || 0),
        hint: ownerScopeHint,
        positive: true
      },
      {
        label: '通话时长',
        value: `${totalHours}小时 ${totalMinutes % 60}分`,
        hint: `平均 ${duration(summary.averageDurationSeconds || 0)}`,
        positive: true
      },
      {
        label: '待跟进',
        value: String(summary.pendingFollowUpCount || 0),
        hint: `${summary.dueTodayFollowUpCount || 0} 项今天到期`,
        positive: true
      }
    ]
  } catch (error: any) {
    rows.value = []
    total.value = 0
    outboundCount.value = null
    metrics.value = [
      { label: '外呼接通率', value: '—', hint: '统计暂不可用', positive: false },
      { label: '今日外呼', value: '—', hint: '统计暂不可用', positive: false },
      { label: '通话时长', value: '—', hint: '统计暂不可用', positive: false },
      { label: '待跟进', value: '—', hint: '统计暂不可用', positive: false }
    ]
    loadError.value = error?.message || '通话记录服务暂不可用'
  } finally {
    loading.value = false
  }
}

function getDateBounds(): { from?: string; to?: string } {
  const now = new Date()
  if (query.dateRange === 'custom') {
    if (query.customDateRange.length !== 2) return {}
    const from = new Date(`${query.customDateRange[0]}T00:00:00`)
    const to = new Date(`${query.customDateRange[1]}T00:00:00`)
    to.setDate(to.getDate() + 1)
    return { from: from.toISOString(), to: to.toISOString() }
  }
  const from = new Date(now)
  if (query.dateRange === 'today') from.setHours(0, 0, 0, 0)
  else from.setDate(from.getDate() - (query.dateRange === '30d' ? 30 : 7))
  return { from: from.toISOString(), to: now.toISOString() }
}

function getCallRecordFilters() {
  return {
    ...getDateBounds(),
    direction: query.direction as any,
    resultCode: query.resultCode as any,
    ownerUserId: query.ownerUserId,
    recordingState: query.recordingState as any,
    query: query.query.trim() || undefined
  }
}

function search() {
  if (query.dateRange === 'custom' && query.customDateRange.length !== 2) {
    ElMessage.warning('请选择完整的自定义日期范围')
    return
  }
  query.pageNo = 1
  loadRecords()
}
function handleDateRangeChange(value: string) {
  // Selecting the custom option only reveals the picker; wait for a complete range before querying.
  if (value === 'custom') return
  search()
}
function resetQuery() {
  Object.assign(query, {
    pageNo: 1,
    pageSize: 10,
    dateRange: '7d',
    customDateRange: [],
    direction: undefined,
    resultCode: undefined,
    ownerUserId: undefined,
    recordingState: undefined,
    query: ''
  })
  loadRecords()
}
function formatTime(value?: string) {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(parseCallPhoneDateTime(value))
    : '—'
}
function duration(seconds = 0) {
  return seconds
    ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : '00:00'
}
function resultLabel(code?: string, status?: string) {
  if (status === 'requested') return '等待确认'
  if (status === 'failed') return '拨号失败'
  if (status === 'cancelled') return '已取消'
  return resultOptions.value.find((item) => item.value === code)?.label || '待回填'
}
function resultType(code?: string) {
  return code === 'connected'
    ? 'success'
    : code === 'no_answer' || code === 'busy'
      ? 'warning'
      : code
        ? 'danger'
        : 'info'
}
function relativeTime(value?: string) {
  if (!value) return '刚刚'
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  return minutes < 60 ? `${minutes} 分钟前` : `${Math.floor(minutes / 60)} 小时前`
}
function showNotice(message: string) {
  ElMessage.info(message)
}
const dispatchStatusTitle = computed(() => {
  if (activeDispatch.value?.status === 'accepted') {
    if (activeDispatch.value.callStage === 'completed') return '通话结果已回填'
    if (activeDispatch.value.callStage === 'dialing') return '手机正在通话'
    if (activeDispatch.value.callStage === 'waiting') return '手机已接受，等待拨号'
    return '手机已接受'
  }
  return {
    queued: '等待手机确认',
    accepted: '手机已接受',
    declined: '手机已拒绝',
    expired: '请求已过期',
    cancelled: '请求已撤回',
    failed: '派发失败'
  }[activeDispatch.value?.status || 'queued']
})
const dispatchStatusDescription = computed(() => {
  if (activeDispatch.value?.status === 'accepted') {
    if (activeDispatch.value.callStage === 'completed')
      return '通话记录和结果已同步，可在列表中查看详情。'
    if (activeDispatch.value.callStage === 'dialing') return '手机正在通话；结束后会自动回填结果。'
    if (activeDispatch.value.callStage === 'waiting') return '手机已确认请求，请在手机上继续拨号。'
    return '手机端已确认请求，正在同步拨号状态。'
  }
  return {
    queued: '请求已发送到配对手机',
    accepted: '手机端已确认请求，可继续拨号',
    declined: '手机端没有接受此次请求',
    expired: '有效期为 5 分钟，请重新选择设备发送',
    cancelled: '外呼请求已撤回',
    failed: '检查手机配对状态后可以重试'
  }[activeDispatch.value?.status || 'queued']
})
const dispatchStatusIcon = computed(() =>
  activeDispatch.value?.status === 'accepted'
    ? 'success'
    : ['failed', 'declined', 'expired'].includes(activeDispatch.value?.status || '')
      ? 'warning'
      : activeDispatch.value?.status === 'cancelled'
        ? 'info'
        : 'info'
)

function stopDispatchPolling() {
  if (dispatchPollTimer) clearTimeout(dispatchPollTimer)
  dispatchPollTimer = undefined
  dispatchPollGeneration += 1
}
function dispatchEventLabel(eventType: OutboundApi.DispatchEventVO['eventType']) {
  return {
    created: '请求已创建',
    accepted: '手机已接受',
    declined: '手机已拒绝',
    expired: '请求已过期',
    cancelled: 'PC 已撤回',
    failed: '派发失败'
  }[eventType]
}
function dispatchReasonLabel(reasonCode: string) {
  return (
    {
      not_available: '当前不方便',
      wrong_number: '号码有误',
      wrong_time: '稍后联系',
      other: '其他原因',
      device_revoked: '设备已解除绑定'
    }[reasonCode] || '其他原因'
  )
}
function dispatchEventType(
  eventType: OutboundApi.DispatchEventVO['eventType']
): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  return eventType === 'accepted'
    ? 'success'
    : eventType === 'declined' || eventType === 'expired'
      ? 'warning'
      : eventType === 'cancelled'
        ? 'info'
        : eventType === 'failed'
          ? 'danger'
          : 'primary'
}
function startDispatchPolling() {
  stopDispatchPolling()
  const generation = dispatchPollGeneration
  const poll = async () => {
    const current = activeDispatch.value
    if (generation !== dispatchPollGeneration || !current || !dispatchStatusNeedsPolling(current))
      return stopDispatchPolling()
    try {
      const latest = await OutboundApi.getCallDispatch(current.id)
      if (generation !== dispatchPollGeneration || activeDispatch.value?.id !== current.id) return
      if (latest) activeDispatch.value = latest
      if (!dispatchStatusNeedsPolling(activeDispatch.value)) {
        stopDispatchPolling()
        if (activeDispatch.value?.callStage === 'completed') void loadRecords()
        return
      }
    } catch {
      /* Keep the last confirmed state visible; the next poll can recover. */
    }
    if (generation === dispatchPollGeneration) {
      dispatchPollTimer = setTimeout(poll, 4000)
    }
  }
  void poll()
}
function dispatchStatusNeedsPolling(dispatch?: OutboundApi.DispatchVO) {
  return (
    dispatch?.status === 'queued' ||
    (dispatch?.status === 'accepted' && dispatch.callStage !== 'completed')
  )
}
async function cancelDispatch() {
  if (!activeDispatch.value) return
  if (previewMode) {
    PreviewStore.updatePreviewDispatch(activeDispatch.value.id, { status: 'cancelled' })
    activeDispatch.value = PreviewStore.getPreviewDispatch(activeDispatch.value.id)
    return
  }
  await OutboundApi.cancelCallDispatch(activeDispatch.value.id)
  activeDispatch.value = await OutboundApi.getCallDispatch(activeDispatch.value.id)
  stopDispatchPolling()
}
function setPreviewDispatchStatus(status: Exclude<OutboundApi.DispatchStatus, 'queued'>) {
  if (activeDispatch.value) {
    const updated = PreviewStore.updatePreviewDispatch(activeDispatch.value.id, {
      status,
      ...(status === 'accepted' ? { callStage: 'accepted' as const } : {})
    })
    if (updated) activeDispatch.value = updated
  }
}
function startPreviewCall() {
  if (!activeDispatch.value) return
  activeDispatch.value.callStage = 'dialing'
  PreviewStore.updatePreviewDispatch(activeDispatch.value.id, { callStage: 'dialing' })
}
async function completePreviewCall() {
  if (!activeDispatch.value) return
  PreviewStore.completePreviewDispatch(
    activeDispatch.value.id,
    previewResultCode.value,
    previewCallNote.value
  )
  activeDispatch.value.callStage = 'completed'
  await loadRecords()
}
function retryDispatch() {
  const draft = lastDispatchDraft.value
  const customer = draft?.customer || selectedCustomer.value
  dispatchStatusVisible.value = false
  openStartDrawer(
    customer
      ? {
          id: '',
          customerId: customer.customerId,
          customerName: customer.customerName,
          phoneDisplay: customer.phoneDisplay,
          direction: 'outbound',
          ownerUserId: '',
          ownerName: customer.ownerName || '',
          status: 'failed',
          durationSeconds: 0,
          recordingState: 'none',
          summaryState: 'unavailable',
          version: 1
        }
      : undefined,
    draft
  )
}

async function openStartDrawer(row?: OutboundApi.CallRecordVO, draft?: OutboundDispatchDraft) {
  // A newly opened draft represents a new user intent. Retain keys only while
  // this draft stays open so a retry after a network timeout reuses its key.
  dispatchIdempotencyKeys = new Map()
  const customer =
    draft?.customer ||
    (row?.customerId
      ? {
          customerId: row.customerId,
          customerName: row.customerName,
          phoneDisplay: row.phoneDisplay,
          ownerName: row.ownerName
        }
      : undefined)
  selectedCustomer.value = customer
  dispatch.customerId = customer?.customerId || ''
  customerOptions.value = customer ? [customer] : []
  dispatch.deviceId = draft?.deviceId || ''
  dispatch.source = draft?.source || 'customer_detail'
  dispatch.script = draft?.scriptCode || ''
  dispatch.followUp = draft?.followUpStatus || 'first_contact'
  dispatch.requestNote = draft?.requestNote || ''
  dispatch.nextFollowUpAt = draft?.nextFollowUpAt || ''
  startVisible.value = true
  if (previewMode) {
    devices.value = [
      {
        id: 'device-1',
        displayName: '林静的 iPhone 15 Pro',
        platform: 'ios',
        status: 'online',
        lastSeenAt: new Date().toISOString()
      }
    ]
    if (!customer) await searchCustomers('')
  } else {
    try {
      devices.value = await OutboundApi.getPairedDevices()
    } catch {
      devices.value = []
    }
  }
  dispatch.deviceId =
    devices.value.find((device) => device.id === draft?.deviceId && device.status === 'online')
      ?.id ||
    devices.value.find((device) => device.status === 'online')?.id ||
    ''
}

let customerSearchTimer: ReturnType<typeof setTimeout> | undefined
let customerSearchRequestVersion = 0

function searchCustomers(query: string) {
  const requestVersion = ++customerSearchRequestVersion
  if (customerSearchTimer) clearTimeout(customerSearchTimer)
  if (previewMode) {
    customerOptions.value = PreviewStore.searchPreviewCustomers(query)
    customerLoading.value = false
    return
  }
  if (!query.trim()) {
    customerOptions.value = []
    customerLoading.value = false
    return
  }
  customerLoading.value = true
  customerSearchTimer = setTimeout(async () => {
    try {
      const options = await OutboundApi.getCustomerOptions(query)
      if (requestVersion === customerSearchRequestVersion) customerOptions.value = options
    } catch {
      if (requestVersion === customerSearchRequestVersion) customerOptions.value = []
    } finally {
      if (requestVersion === customerSearchRequestVersion) customerLoading.value = false
    }
  }, 250)
}

function selectCustomer(id: string) {
  selectedCustomer.value = customerOptions.value.find((row) => row.customerId === id)
}

function closeStartDrawer(done: () => void) {
  ElMessageBox.confirm('关闭后不会向手机发送拨号请求，确定关闭？', '确认关闭')
    .then(done)
    .catch(() => undefined)
}
async function sendDispatch() {
  if (!dispatch.deviceId) return
  if (previewMode) {
    const customer = selectedCustomer.value
    if (!customer) return
    const created = PreviewStore.createPreviewDispatch({
      customerId: customer.customerId,
      customerName: customer.customerName,
      phoneDisplay: customer.phoneDisplay,
      deviceName:
        devices.value.find((device) => device.id === dispatch.deviceId)?.displayName || '配对手机'
    })
    activeDispatch.value = created
    startVisible.value = false
    dispatchStatusVisible.value = true
    return
  }
  dispatching.value = true
  try {
    const request = {
      customerId: selectedCustomer.value?.customerId || '',
      deviceId: dispatch.deviceId,
      source: dispatch.source,
      scriptCode: dispatch.script || undefined,
      followUpStatus: dispatch.followUp,
      requestNote: dispatch.requestNote,
      nextFollowUpAt: dispatch.nextFollowUpAt || undefined
    }
    const requestFingerprint = JSON.stringify(request)
    let idempotencyKey = dispatchIdempotencyKeys.get(requestFingerprint)
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID()
      dispatchIdempotencyKeys.set(requestFingerprint, idempotencyKey)
    }
    const result: OutboundApi.DispatchVO = await OutboundApi.createCallDispatch({
      ...request,
      idempotencyKey
    })
    if (selectedCustomer.value) {
      lastDispatchDraft.value = { ...request, customer: { ...selectedCustomer.value } }
    }
    activeDispatch.value = result
    startVisible.value = false
    dispatchStatusVisible.value = true
    startDispatchPolling()
    await loadRecords()
  } catch (error: any) {
    ElMessage.error(error?.message || '外呼派发失败，请检查配对设备和客户拨打权限')
  } finally {
    dispatching.value = false
  }
}
async function openDetail(row: OutboundApi.CallRecordVO) {
  releaseRecordingUrl()
  detail.value = row
  backendEvents.value = []
  detailVisible.value = true
  if (!previewMode) {
    try {
      const [record, events] = await Promise.all([
        OutboundApi.getCallRecord(row.id),
        OutboundApi.getCallRecordEvents(row.id)
      ])
      detail.value = record
      backendEvents.value = events || []
    } catch {
      ElMessage.error('通话详情加载失败')
    }
  }
}
async function loadRecording() {
  if (!detail.value || recordingLoading.value || previewMode) return
  recordingLoading.value = true
  try {
    const blob = await OutboundApi.getCallRecordRecording(detail.value.id)
    releaseRecordingUrl()
    recordingUrl.value = URL.createObjectURL(blob as Blob)
  } catch {
    ElMessage.error('录音不存在或当前账号无权播放')
  } finally {
    recordingLoading.value = false
  }
}
function releaseRecordingUrl() {
  if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value)
  recordingUrl.value = ''
}
watch(detailVisible, (visible) => {
  if (!visible) releaseRecordingUrl()
})
onBeforeUnmount(releaseRecordingUrl)
function openRelatedFollowUp() {
  if (detail.value?.leadId) {
    void router.push({
      path: previewMode ? '/callphone-preview/lead-follow-ups' : '/callphone/lead-follow-ups',
      query: {
        ...(previewMode ? { preview: '1' } : {}),
        leadId: detail.value.leadId,
        sourceCallRecordId: detail.value.id
      }
    })
    return
  }
  if (!detail.value?.customerId) return
  void router.push({
    path: previewMode ? '/callphone-preview/follow-up-tasks' : '/callphone/follow-up-tasks',
    query: {
      ...(previewMode ? { preview: '1' } : {}),
      customerId: detail.value.customerId,
      sourceCallRecordId: detail.value.id
    }
  })
}
async function handleExport() {
  if (previewMode) {
    ElMessage.info('本地预览不导出演示样例')
    return
  }
  if (query.dateRange === 'custom' && query.customDateRange.length !== 2) {
    ElMessage.warning('请选择完整的自定义日期范围')
    return
  }
  try {
    await ElMessageBox.confirm(
      '将导出当前筛选条件下的通话记录，最多 5000 条。文件仅包含脱敏号码和通话元数据，不含客户姓名、完整号码及通话备注。',
      '导出通话记录',
      { type: 'info', confirmButtonText: '导出', cancelButtonText: '取消' }
    )
    exportLoading.value = true
    const file = await OutboundApi.exportCallRecordExcel(getCallRecordFilters())
    download.excel(file, 'Call-Phone-通话记录.xls')
    ElMessage.success('通话记录已导出')
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '导出失败，请缩小日期范围后重试')
    }
  } finally {
    exportLoading.value = false
  }
}

async function loadCallResultOptions() {
  try {
    const rows = previewMode
      ? PreviewStore.previewDictionaryItems('callphone_call_result')
      : await DictDataApi.getDictDataByType('callphone_call_result')
    const active = (rows || [])
      .filter((row: any) => Number(row.status) === 0)
      .map((row: any) => ({ value: String(row.value), label: row.label }))
    if (active.length) resultOptions.value = active
  } catch {
    /* Keep built-in defaults until this optional business dictionary is available. */
  }
}
onMounted(async () => {
  await loadCallResultOptions()
  await loadRecords()
  const customerId = String(route.query.customerId || '')
  if (previewMode && customerId) {
    const customer = PreviewStore.findPreviewCustomer(customerId)
    if (customer)
      await openStartDrawer({
        id: '',
        customerId: customer.id,
        customerName: customer.name,
        phoneDisplay: customer.phoneDisplay,
        direction: 'outbound',
        ownerUserId: customer.ownerUserId || '',
        ownerName: customer.ownerName || '',
        status: 'ended',
        durationSeconds: 0,
        recordingState: 'none',
        summaryState: 'unavailable',
        version: 1
      })
  }
  const callRecordId = String(route.query.callRecordId || '')
  if (callRecordId) {
    try {
      const record = previewMode
        ? PreviewStore.findPreviewCallRecord(callRecordId)
        : await OutboundApi.getCallRecord(callRecordId)
      if (record) await openDetail(record)
      else ElMessage.warning('没有找到关联的通话记录')
    } catch (error: any) {
      ElMessage.error(error?.message || '读取关联通话记录失败')
    }
  }
})
onBeforeUnmount(stopDispatchPolling)
</script>

<style scoped lang="scss">
.call-records-page {
  min-height: calc(100vh - 100px);
  padding: 20px;
  color: #293347;
  background: #f5f7fc;
}

.preview-banner {
  max-width: 1400px;
  padding: 8px 14px;
  margin: 0 auto 12px;
  font-size: 12px;
  color: #315da8;
  background: #eef4ff;
  border: 1px solid #c7d9ff;
  border-radius: 6px;
}

.page-panel {
  max-width: 1400px;
  min-height: 752px;
  padding: 20px 24px 22px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #dee4ec;
  border-radius: 10px;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.page-heading h1 {
  margin: 0 0 7px;
  font-size: 22px;
  font-weight: 700;
  color: #141a26;
}

.page-heading p {
  margin: 0;
  font-size: 12px;
  color: #6b7587;
}

.heading-actions {
  display: flex;
  gap: 8px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 20px;
}

.metric-card {
  min-height: 76px;
  padding: 10px 14px;
  border: 1px solid #dee4ec;
  border-radius: 9px;
}

.metric-card > span {
  font-size: 12px;
  color: #6b7587;
}

.metric-value-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 3px;
}

.metric-value-line strong {
  font-size: 21px;
  color: #141a26;
}

.metric-value-line small {
  font-size: 11px;
  color: #6b7587;
}

.metric-value-line small.positive {
  color: #148c5c;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0 12px;
  margin-bottom: 4px;
}

.filter-bar :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 12px;
}

.filter-bar :deep(.el-form-item__label) {
  display: block;
  float: none;
  height: 20px;
  padding: 0;
  font-size: 11px;
  color: #6b7587;
}

.filter-bar :deep(.el-form-item__content) {
  display: flex;
}

.w-160 {
  width: 160px;
}

.w-124 {
  width: 124px;
}

.w-92 {
  width: 92px;
}

.search-item {
  margin-left: auto;
}

.search-item :deep(.el-input) {
  width: 292px;
}

.record-table {
  width: 100%;
  border: 1px solid #dee4ec;
  border-radius: 6px;
}

.call-records-page :deep(.el-input__wrapper),
.call-records-page :deep(.el-select__wrapper) {
  background-color: #fff;
  box-shadow: 0 0 0 1px #d7dde7 inset;
}

.call-records-page :deep(.el-textarea__inner) {
  color: #293347;
  background-color: #fff;
  box-shadow: 0 0 0 1px #d7dde7 inset;
}

.call-records-page :deep(.el-input__count) {
  color: #8793a7;
  background: transparent;
}

.call-records-page :deep(.el-input__inner),
.call-records-page :deep(.el-select__placeholder),
.call-records-page :deep(.el-select__selected-item) {
  color: #293347;
}

.call-records-page :deep(.el-table) {
  --el-table-bg-color: #fff;
  --el-table-tr-bg-color: #fff;
  --el-table-header-bg-color: #f5f7fc;
  --el-table-text-color: #293347;
  --el-table-border-color: #e3e7ee;
  --el-fill-color-lighter: #f5f7fc;
}

.call-records-page :deep(.el-button:not(.el-button--primary)) {
  --el-button-bg-color: #fff;
  --el-button-text-color: #293347;
  --el-button-border-color: #d7dde7;
}

.call-records-page :deep(.el-tag) {
  --el-tag-bg-color: #ecf5ff;
  --el-tag-border-color: transparent;
  --el-tag-text-color: #409eff;
}

.call-records-page :deep(.el-tag--success) {
  --el-tag-bg-color: #f0f9eb;
  --el-tag-text-color: #67c23a;
}

.call-records-page :deep(.el-tag--warning) {
  --el-tag-bg-color: #fdf6ec;
  --el-tag-text-color: #e6a23c;
}

.call-records-page :deep(.el-tag--danger) {
  --el-tag-bg-color: #fef0f0;
  --el-tag-text-color: #f56c6c;
}

.record-table :deep(.el-table__header th) {
  height: 38px;
  font-size: 11px;
  font-weight: 500;
  color: #6b7587;
  background: #f5f7fc;
}

.record-table :deep(.el-table__row) {
  height: 43px;
  font-size: 11px;
  color: #293347;
  cursor: pointer;
}

.record-table :deep(.el-tag) {
  border: 0;
}

.table-footer {
  display: flex;
  margin: 12px 0 26px;
  font-size: 11px;
  color: #6b7587;
  align-items: center;
  justify-content: space-between;
}

.privacy-note {
  margin: 0 8px;
  font-size: 11px;
  color: #8893a5;
}

.muted {
  font-size: 11px;
  color: #8a94a6;
}

.drawer-title {
  width: 100%;
  padding-right: 20px;
}

.drawer-title strong {
  font-size: 18px;
  color: #141a26;
}

.drawer-title p {
  margin: 6px 0 0;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.6;
  color: #748096;
}

.drawer-content {
  padding: 2px 16px;
}

.customer-summary {
  display: grid;
  padding: 14px;
  background: #f5f8ff;
  border: 1px solid #dce7fb;
  border-radius: 8px;
  grid-template-columns: 1fr auto;
  gap: 6px 10px;
}

.customer-summary strong {
  font-size: 13px;
  color: #253047;
}

.customer-summary span {
  font-size: 11px;
  color: #63728a;
}

.customer-summary small {
  font-size: 10px;
  color: #68768b;
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
}

.dispatch-form {
  margin-top: 18px;
}

.dispatch-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.dispatch-form :deep(.el-form-item__label) {
  padding-bottom: 5px;
  font-size: 11px;
  line-height: 18px;
  color: #617087;
}

.fill {
  width: 100%;
}

.form-hint {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  line-height: 1.45;
  color: #8793a7;
}

.form-hint.warning {
  color: #c57a16;
}

.customer-picker {
  margin-top: 0;
}

.dispatch-explainer {
  padding: 14px;
  margin-top: 2px;
  font-size: 11px;
  color: #245ebf;
  background: #f0f5ff;
  border-radius: 8px;
}

.dispatch-explainer p {
  margin: 6px 0 0;
  line-height: 1.55;
  color: #65758e;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 6px;
}

.drawer-footer :deep(.el-button--primary) {
  min-width: 136px;
}

.detail-content {
  padding: 0 12px;
}

.recording-player {
  padding: 14px;
  margin-top: 16px;
  background: #fbfcfe;
  border: 1px solid #e6ebf3;
  border-radius: 10px;
}

.recording-player-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.recording-player audio {
  display: block;
  width: 100%;
}

.detail-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 18px;
}

.detail-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  font-size: 16px;
}

.detail-content :deep(.el-descriptions__label) {
  width: 110px;
}

.detail-content :deep(.el-timeline-item__content) {
  font-size: 12px;
}

.dispatch-status-content {
  padding: 0 12px;
}

.dispatch-event-section {
  margin-top: 22px;
}

.dispatch-event-section h3 {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.dispatch-event-section :deep(.el-timeline-item__content) {
  color: var(--el-text-color-primary);
}

.dispatch-event-section p {
  margin: 5px 0 0;
  color: var(--el-text-color-secondary);
}

.dispatch-status-content :deep(.el-result) {
  padding: 18px 0 24px;
}

.status-hint {
  margin-top: 18px;
}

.status-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}

.preview-status-actions {
  display: flex;
  padding: 10px;
  margin-top: 16px;
  border: 1px dashed #b7c9e8;
  border-radius: 6px;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.preview-status-actions span {
  width: 100%;
  font-size: 11px;
  color: #6b7587;
}

:global(.el-drawer.callphone-drawer) {
  --el-drawer-bg-color: #fff;
  --el-drawer-text-color: #293347;

  color: #293347;
  background-color: #fff;
}

:global(.el-drawer.callphone-drawer .el-drawer__header) {
  color: #141a26;
}

:global(.el-drawer.callphone-drawer .el-result__title p) {
  color: #141a26;
}

:global(.el-drawer.callphone-drawer .el-result__subtitle p) {
  color: #6b7587;
}

:global(.el-drawer.callphone-drawer .el-descriptions__body),
:global(.el-drawer.callphone-drawer .el-descriptions__table) {
  color: #293347;
  background-color: #fff;
}

:global(.el-drawer.callphone-drawer .el-descriptions__label.el-descriptions__cell) {
  color: #6b7587;
  background-color: #f5f7fc;
}

:global(.el-drawer.callphone-drawer .el-descriptions__content.el-descriptions__cell) {
  color: #293347;
  background-color: #fff;
}

@media (width <= 1100px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .search-item {
    margin-left: 0;
  }
}

@media (width <= 700px) {
  .call-records-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .metrics-grid {
    gap: 8px;
  }

  .page-heading {
    gap: 12px;
    flex-direction: column;
  }

  .filter-bar {
    gap: 0 8px;
  }

  .search-item :deep(.el-input) {
    width: 100%;
  }
}
</style>
