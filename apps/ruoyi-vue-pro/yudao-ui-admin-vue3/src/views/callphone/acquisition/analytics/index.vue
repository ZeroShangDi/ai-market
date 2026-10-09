<template>
  <div class="acquisition-page">
    <el-alert
      :title="previewMode ? '本地演示数据' : '统计口径说明'"
      :description="
        previewMode
          ? '访问与新增线索使用当前浏览器的样例计数；有效线索、转化与转化率没有样例事实，因此显示为未接入。'
          : `${summary?.scope || '仅统计本人范围'}。${summary?.leadMetricBasis || ''}。${summary?.visitMetricState || '访问事件尚未接入。'}`
      "
      type="warning"
      :closable="false"
      class="page-note"
    />

    <section class="page-panel">
      <header class="page-heading">
        <div>
          <h1>渠道数据</h1>
          <p>按渠道查看匿名扫码次数，以及本人负责的线索和转化。</p>
        </div>
        <div class="filters">
          <el-date-picker
            v-if="!previewMode"
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :clearable="false"
            @change="load"
          />
          <el-select
            v-model="selectedChannel"
            clearable
            placeholder="全部渠道"
            class="channel-filter"
          >
            <el-option v-for="item in rows" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </div>
      </header>

      <div v-loading="loading" class="analytics-content">
        <div class="metrics">
          <article>
            <span>访问量</span>
            <strong>{{ formatMetric(totals.visits) }}</strong>
            <small>{{
              previewMode ? '浏览器样例扫码与链接访问' : '匿名扫码日汇总；非独立访客数'
            }}</small>
          </article>
          <article>
            <span>新增线索</span>
            <strong>{{ totals.leads.toLocaleString() }}</strong>
            <small>{{ previewMode ? '本地样例计数' : '按线索创建日期统计本人记录' }}</small>
          </article>
          <article>
            <span>有效线索</span>
            <strong>{{ formatMetric(totals.validLeads) }}</strong>
            <small>{{ previewMode ? '样例事实未提供' : '本人未归档线索' }}</small>
          </article>
          <article>
            <span>转化客户</span>
            <strong>{{ formatMetric(totals.conversions) }}</strong>
            <small>{{ previewMode ? '样例事实未提供' : '本人完成的线索转化' }}</small>
          </article>
        </div>

        <div class="chart-panel">
          <div class="chart-title">
            <div>
              <strong>渠道新增线索</strong>
              <small>仅显示当前筛选范围内的计数</small>
            </div>
            <span>{{ periodLabel }}</span>
          </div>
          <div v-if="filteredRows.length" class="bar-chart">
            <div v-for="row in filteredRows" :key="row.id" class="bar-row">
              <span class="bar-label">{{ row.name }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${barWidth(row.leads)}%` }"></div>
              </div>
              <strong>{{ row.leads }}</strong>
            </div>
          </div>
          <el-empty v-else :description="loadError || '暂无可汇总的渠道数据'" :image-size="76" />
        </div>

        <el-table v-loading="loading" :data="filteredRows" row-key="id" class="channel-table">
          <el-table-column label="渠道" min-width="170">
            <template #default="{ row }">
              <strong>{{ row.name }}</strong>
              <small class="sub">{{ row.platformLabel }}</small>
            </template>
          </el-table-column>
          <el-table-column label="归因窗口" width="110">
            <template #default="{ row }">{{ row.window }} 天</template>
          </el-table-column>
          <el-table-column label="访问 / 扫码" width="130">
            <template #default="{ row }">{{ formatMetric(row.visits) }}</template>
          </el-table-column>
          <el-table-column label="新增线索" width="110" prop="leads" />
          <el-table-column label="有效线索" width="110">
            <template #default="{ row }">{{ formatMetric(row.validLeads) }}</template>
          </el-table-column>
          <el-table-column label="转化" width="90">
            <template #default="{ row }">{{ formatMetric(row.conversions) }}</template>
          </el-table-column>
          <el-table-column label="转化率" width="100">
            <template #default="{ row }">
              <span
                :title="
                  !previewMode && row.conversionRate == null
                    ? '当前日期范围没有有效线索，暂不可计算'
                    : undefined
                "
              >
                {{
                  row.conversionRate == null
                    ? previewMode
                      ? '未接入'
                      : '—'
                    : `${row.conversionRate}%`
                }}
              </span>
            </template>
          </el-table-column>
          <template #empty><el-empty :description="loadError || '没有可汇总的渠道'" /></template>
        </el-table>
        <footer>
          数据更新：{{ updatedAt || '—' }} · 转化率按“本人转化客户 ÷
          本人有效线索”计算；访问量需要公开扫码服务。
        </footer>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import * as Acquisition from '@/api/callphone/acquisition-preview'
import * as AnalyticsApi from '@/api/callphone/acquisition/analytics'

defineOptions({ name: 'CallPhoneAcquisitionAnalytics' })

const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
type AnalyticsRow = {
  id: string
  name: string
  platformLabel: string
  window: number
  visits: number | null
  leads: number
  validLeads: number | null
  conversions: number | null
  conversionRate: number | null
}
const rows = ref<AnalyticsRow[]>([])
const selectedChannel = ref('')
const loading = ref(false)
const loadError = ref('')
const updatedAt = ref('')
const summary = ref<AnalyticsApi.AcquisitionAnalyticsSummaryVO>()
let loadSequence = 0
const dateRange = ref<[string, string]>(defaultDateRange())
const filteredRows = computed(() =>
  rows.value.filter((row) => !selectedChannel.value || row.id === selectedChannel.value)
)
const totals = computed(() =>
  filteredRows.value.reduce(
    (sum, row) => ({
      visits: sum.visits == null || row.visits == null ? null : sum.visits + row.visits,
      leads: sum.leads + row.leads,
      validLeads:
        sum.validLeads == null || row.validLeads == null ? null : sum.validLeads + row.validLeads,
      conversions:
        sum.conversions == null || row.conversions == null
          ? null
          : sum.conversions + row.conversions
    }),
    {
      visits: 0 as number | null,
      leads: 0,
      validLeads: 0 as number | null,
      conversions: 0 as number | null
    }
  )
)
const periodLabel = computed(() =>
  previewMode.value ? '本地样例数据' : `${dateRange.value[0]} 至 ${dateRange.value[1]}`
)

function defaultDateRange(): [string, string] {
  const today = new Date()
  const from = new Date(today)
  from.setDate(today.getDate() - 29)
  return [formatDate(from), formatDate(today)]
}
function formatDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
function formatMetric(value: number | null) {
  return value == null ? '未接入' : value.toLocaleString()
}
function platformName(platform: string) {
  return (
    (
      { wechat: '微信', douyin: '抖音', website: '官网', offline: '线下物料' } as Record<
        string,
        string
      >
    )[platform] || platform
  )
}
function barWidth(value: number) {
  const max = Math.max(...filteredRows.value.map((row) => row.leads), 1)
  return Math.max(value ? 8 : 0, (value / max) * 100)
}
async function load() {
  const sequence = ++loadSequence
  loading.value = true
  loadError.value = ''
  try {
    if (previewMode.value) {
      const channels = Acquisition.listAcquisitionChannels()
      const codes = (
        [
          'channel',
          'employee',
          'store',
          'visitor_identification'
        ] as Acquisition.TrackingCode['type'][]
      ).flatMap((type) => Acquisition.listTrackingCodes(type))
      const links = Acquisition.listMarketingLinks()
      rows.value = channels.map((channel) => {
        const channelCodes = codes.filter((code) => code.channelId === channel.id)
        const channelLinks = links.filter((link) => link.channelId === channel.id)
        return {
          id: channel.id,
          name: channel.name,
          platformLabel: platformName(channel.platform),
          window: channel.attributionWindowDays,
          visits:
            channelCodes.reduce((sum, code) => sum + code.scans, 0) +
            channelLinks.reduce((sum, link) => sum + link.visits, 0),
          leads:
            channelCodes.reduce((sum, code) => sum + code.leads, 0) +
            channelLinks.reduce((sum, link) => sum + link.leads, 0),
          validLeads: null,
          conversions: null,
          conversionRate: null
        }
      })
      summary.value = undefined
    } else {
      const data = await AnalyticsApi.getAcquisitionAnalyticsSummary({
        fromDate: dateRange.value[0],
        toDate: dateRange.value[1]
      })
      if (sequence !== loadSequence) return
      summary.value = data
      rows.value = data.channels.map((channel) => ({
        id: channel.channelId,
        name: channel.channelName,
        platformLabel: platformName(channel.platform),
        window: channel.attributionWindowDays,
        visits: channel.visitCount,
        leads: channel.leadCount,
        validLeads: channel.validLeadCount,
        conversions: channel.conversionCount,
        conversionRate: channel.conversionRate
      }))
      updatedAt.value = data.updatedAt
        ? new Date(data.updatedAt).toLocaleString('zh-CN', { hour12: false })
        : '—'
    }
    if (sequence !== loadSequence) return
    if (!previewMode.value)
      updatedAt.value = summary.value?.updatedAt
        ? new Date(summary.value.updatedAt).toLocaleString('zh-CN', { hour12: false })
        : '—'
    else updatedAt.value = `本地 ${new Date().toLocaleString('zh-CN', { hour12: false })}`
  } catch (error: any) {
    if (sequence !== loadSequence) return
    loadError.value = error?.message || '渠道数据加载失败'
    rows.value = []
    summary.value = undefined
    updatedAt.value = ''
    ElMessage.error(loadError.value)
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

onMounted(load)
watch(previewMode, load)
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
  gap: 16px;
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

.filters {
  display: flex;
  align-items: center;
  gap: 10px;
}

.channel-filter {
  width: 220px;
}

.analytics-content {
  position: relative;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.metrics article {
  padding: 16px;
  border: 1px solid #e8ecf3;
  border-radius: 9px;
}

.metrics span,
.metrics small {
  display: block;
  font-size: 12px;
  color: #8490a1;
}

.metrics strong {
  display: block;
  margin: 8px 0 5px;
  font-size: 25px;
  color: #253149;
}

.chart-panel {
  padding: 18px;
  margin-bottom: 18px;
  border: 1px solid #e8ecf3;
  border-radius: 9px;
}

.chart-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

.chart-title strong,
.chart-title small {
  display: block;
}

.chart-title small,
.chart-title > span,
.sub,
footer {
  margin-top: 5px;
  font-size: 12px;
  color: #8a95a7;
}

.bar-chart {
  display: grid;
  gap: 14px;
}

.bar-row {
  display: grid;
  grid-template-columns: 160px 1fr 40px;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-track {
  height: 10px;
  overflow: hidden;
  background: #f0f2f7;
  border-radius: 6px;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b63db, #7192f3);
  border-radius: 6px;
}

.bar-row strong {
  text-align: right;
}

.channel-table {
  margin-bottom: 14px;
}

footer {
  padding-top: 14px;
}

:global(.el-popper),
:global(.el-select-dropdown),
:global(.el-picker-panel) {
  --el-bg-color: #fff;
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color-light: #e4e7ed;
}

@media (width <= 800px) {
  .acquisition-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .filters {
    width: 100%;
    flex-wrap: wrap;
  }

  .channel-filter {
    width: 180px;
  }

  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bar-row {
    grid-template-columns: 95px 1fr 30px;
    gap: 7px;
  }
}
</style>
