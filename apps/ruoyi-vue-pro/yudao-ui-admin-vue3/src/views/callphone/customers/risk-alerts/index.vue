<template>
  <main class="risk-page">
    <section class="page-head">
      <div>
        <div class="breadcrumb">Call Phone <span>/</span> 客户</div>
        <h1>风险预警</h1>
        <p>从逾期跟进和长期未联系等本地业务信号中发现需要处理的客户。</p>
      </div>
      <div class="head-actions">
        <el-button @click="openRules"><Icon icon="ep:setting" />预警规则</el-button>
        <el-button type="primary" :loading="scanning" @click="scan"
          ><Icon icon="ep:refresh" />重新检测</el-button
        >
      </div>
    </section>

    <el-alert class="privacy-note" type="info" :closable="false" show-icon>
      <template #title
        >检测仅读取当前用户有权访问的客户与跟进事项。处置记录保存在本地部署中，不会联系客户或改变客户阶段。</template
      >
    </el-alert>

    <section class="metric-grid">
      <button
        v-for="card in cards"
        :key="card.key"
        class="metric-card"
        :class="{ active: isCardActive(card.key) }"
        @click="selectCard(card.key)"
      >
        <span>{{ card.label }}</span
        ><strong>{{ card.value }}</strong
        ><small>{{ card.hint }}</small>
      </button>
    </section>

    <el-card class="list-card" shadow="never">
      <div class="toolbar">
        <el-select
          v-model="filters.status"
          clearable
          placeholder="全部处理状态"
          class="filter-select"
        >
          <el-option label="待处理" value="open" /><el-option label="已处理" value="resolved" />
        </el-select>
        <el-select
          v-model="filters.severity"
          clearable
          placeholder="全部风险等级"
          class="filter-select"
        >
          <el-option label="高风险" value="high" /><el-option
            label="中风险"
            value="medium"
          /><el-option label="低风险" value="low" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button
        ><el-button @click="reset">重置</el-button>
        <span class="scope-label"><Icon icon="ep:user" />仅当前负责人</span>
      </div>

      <el-table
        v-loading="loading"
        :data="page.list"
        row-key="id"
        class="risk-table"
        empty-text="暂无符合条件的风险预警"
      >
        <el-table-column label="风险对象" width="130">
          <template #default="{ row }"
            ><strong>{{ row.customerName }}</strong
            ><small class="sub-line">{{ row.phoneDisplay }}</small></template
          >
        </el-table-column>
        <el-table-column label="预警内容" width="210" show-overflow-tooltip>
          <template #default="{ row }"
            ><strong class="alert-title">{{ row.ruleName }}</strong
            ><small class="sub-line">{{ row.detail }}</small></template
          >
        </el-table-column>
        <el-table-column label="关联事项" width="145" show-overflow-tooltip>
          <template #default="{ row }"
            ><span>{{ row.sourceTitle }}</span
            ><small class="sub-line">{{ sourceLabel(row.sourceType) }}</small></template
          >
        </el-table-column>
        <el-table-column label="风险等级" width="90">
          <template #default="{ row }"
            ><el-tag :type="severityType(row.severity)" effect="light">{{
              severityLabel(row.severity)
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }"
            ><el-tag :type="row.status === 'open' ? 'warning' : 'success'" effect="light">{{
              row.status === 'open' ? '待处理' : '已处理'
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="发现时间" width="130">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="105" fixed="right">
          <template #default="{ row }"
            ><el-button link type="primary" @click="openDetail(row.id)">{{
              row.status === 'open' ? '查看并处置' : '查看记录'
            }}</el-button></template
          >
        </el-table-column>
      </el-table>

      <div class="pagination-row"
        ><span>共 {{ page.total }} 条预警</span
        ><el-pagination
          v-model:current-page="filters.pageNo"
          v-model:page-size="filters.pageSize"
          :total="page.total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @change="loadPage"
      /></div>
    </el-card>

    <el-drawer
      v-model="detailVisible"
      class="risk-drawer"
      title="风险预警详情"
      size="540px"
      destroy-on-close
    >
      <template v-if="detail">
        <div class="detail-banner" :class="`severity-${detail.severity}`">
          <el-tag :type="severityType(detail.severity)" effect="light">{{
            severityLabel(detail.severity)
          }}</el-tag>
          <strong>{{ detail.ruleName }}</strong>
          <p>{{ detail.detail }}</p>
        </div>
        <div class="detail-grid">
          <div
            ><span>客户</span><strong>{{ detail.customerName }}</strong
            ><small>{{ detail.phoneDisplay }}</small></div
          >
          <div
            ><span>预警规则</span><strong>{{ detail.ruleCode }}</strong></div
          >
          <div
            ><span>关联对象</span><strong>{{ sourceLabel(detail.sourceType) }}</strong
            ><small>{{ detail.sourceTitle }}</small></div
          >
          <div
            ><span>发现时间</span><strong>{{ formatTime(detail.createdAt) }}</strong></div
          >
          <div
            ><span>处理状态</span
            ><el-tag :type="detail.status === 'open' ? 'warning' : 'success'" effect="light">{{
              detail.status === 'open' ? '待处理' : '已处理'
            }}</el-tag></div
          >
        </div>
        <section v-if="detail.status === 'resolved'" class="resolution-box">
          <div class="section-title">处置记录</div
          ><div><span>处理人：</span>{{ detail.resolverName || '—' }}</div>
          <div><span>处理时间：</span>{{ formatTime(detail.resolvedAt) }}</div
          ><p>{{ detail.resolutionReason || '未填写处理说明' }}</p>
        </section>
        <div v-if="detail.status === 'open'" class="drawer-actions"
          ><el-button type="primary" @click="openResolve">标记已处理</el-button></div
        >
      </template>
    </el-drawer>

    <el-drawer
      v-model="rulesVisible"
      class="risk-drawer rules-drawer"
      title="预警规则"
      size="620px"
      destroy-on-close
    >
      <div class="rules-intro"
        >规则只扫描当前部署中的业务数据。关闭规则不会删除已产生的预警和处理记录。</div
      >
      <el-form label-position="top" class="rules-form">
        <section v-for="rule in rules" :key="rule.ruleCode" class="rule-card">
          <div class="rule-head"
            ><div
              ><strong>{{ rule.name }}</strong
              ><p>{{ rule.description }}</p></div
            ><el-switch v-model="rule.enabled"
          /></div>
          <div class="rule-options">
            <el-form-item label="触发阈值（天）"
              ><el-input-number v-model="rule.thresholdDays" :min="1" :max="90"
            /></el-form-item>
            <el-form-item label="风险等级"
              ><el-select v-model="rule.severity"
                ><el-option label="高风险" value="high" /><el-option
                  label="中风险"
                  value="medium" /><el-option label="低风险" value="low" /></el-select
            ></el-form-item>
            <el-button
              type="primary"
              plain
              :loading="savingRule === rule.ruleCode"
              @click="saveRule(rule)"
              >保存规则</el-button
            >
          </div>
        </section>
      </el-form>
      <div class="rules-footnote">检测仅生成待处理预警；请由负责人判断后记录处置结果。</div>
    </el-drawer>

    <el-dialog
      v-model="resolveVisible"
      class="resolve-dialog"
      title="处理风险预警"
      width="520px"
      destroy-on-close
    >
      <el-form ref="resolveFormRef" :model="resolveForm" :rules="resolveRules" label-position="top">
        <el-form-item label="处理说明" prop="reason"
          ><el-input
            v-model="resolveForm.reason"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="记录已采取的措施或判断结果"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="resolveVisible = false">取消</el-button
        ><el-button type="primary" :loading="resolving" @click="resolve"
          >确认处理</el-button
        ></template
      >
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
import * as RiskApi from '@/api/callphone/risk-alert'
import * as RiskPreview from '@/api/callphone/risk-alert/preview'
import type {
  RiskAlertPageParams,
  RiskAlertVO,
  RiskRuleVO,
  RiskSeverity,
  RiskSourceType
} from '@/api/callphone/risk-alert'

const route = useRoute()
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')
const loading = ref(false)
const scanning = ref(false)
const resolving = ref(false)
const savingRule = ref('')
const detailVisible = ref(false)
const rulesVisible = ref(false)
const resolveVisible = ref(false)
const detail = ref<RiskAlertVO>()
const rules = ref<RiskRuleVO[]>([])
const resolveFormRef = ref<FormInstance>()
const filters = reactive<RiskAlertPageParams>({ pageNo: 1, pageSize: 10, status: '', severity: '' })
const page = reactive({
  list: [] as RiskAlertVO[],
  total: 0,
  openCount: 0,
  highCount: 0,
  mediumCount: 0,
  lowCount: 0,
  resolvedCount: 0
})
const resolveForm = reactive({ reason: '' })
const resolveRules: FormRules = {
  reason: [
    { required: true, whitespace: true, message: '请填写处置说明', trigger: 'blur' },
    { min: 4, message: '处置说明至少 4 个字', trigger: 'blur' }
  ]
}
const cards = computed(() => [
  { key: 'open' as const, label: '待处理预警', value: page.openCount, hint: '需要负责人确认处置' },
  { key: 'high' as const, label: '高风险', value: page.highCount, hint: '当前待处理高风险' },
  { key: 'resolved' as const, label: '已处理', value: page.resolvedCount, hint: '保留处置记录' }
])

function severityLabel(value: RiskSeverity) {
  return { high: '高风险', medium: '中风险', low: '低风险' }[value]
}
function severityType(value: RiskSeverity) {
  return { high: 'danger', medium: 'warning', low: 'info' }[value] as 'danger' | 'warning' | 'info'
}
function sourceLabel(value: RiskSourceType) {
  return value === 'follow_up_task' ? '跟进事项' : '客户记录'
}
function formatTime(value?: string) {
  return value
    ? parseCallPhoneDateTime(value).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    : '—'
}
function isCardActive(key: 'open' | 'high' | 'resolved') {
  return key === 'open'
    ? filters.status === 'open' && !filters.severity
    : key === 'high'
      ? filters.status === 'open' && filters.severity === 'high'
      : filters.status === 'resolved'
}
function selectCard(key: 'open' | 'high' | 'resolved') {
  if (key === 'high') {
    const active = filters.status === 'open' && filters.severity === 'high'
    filters.status = active ? '' : 'open'
    filters.severity = active ? '' : 'high'
  } else {
    filters.status = filters.status === key ? '' : key
    filters.severity = ''
  }
  search()
}
async function loadPage() {
  loading.value = true
  try {
    Object.assign(
      page,
      previewMode.value
        ? RiskPreview.getPreviewRiskPage(filters)
        : await RiskApi.getRiskAlertPage(filters)
    )
  } catch (error: any) {
    ElMessage.error(error?.message || '加载风险预警失败')
  } finally {
    loading.value = false
  }
}
function search() {
  filters.pageNo = 1
  void loadPage()
}
function reset() {
  filters.status = ''
  filters.severity = ''
  search()
}
async function scan() {
  scanning.value = true
  try {
    if (previewMode.value) RiskPreview.scanPreviewRiskAlerts()
    else await RiskApi.scanRiskAlerts()
    ElMessage.success('检测完成，预警列表已更新')
    await loadPage()
  } catch (error: any) {
    ElMessage.error(error?.message || '检测失败')
  } finally {
    scanning.value = false
  }
}
async function openDetail(id: string) {
  try {
    detail.value = previewMode.value
      ? RiskPreview.getPreviewRiskAlert(id)
      : await RiskApi.getRiskAlert(id)
    detailVisible.value = true
  } catch (error: any) {
    ElMessage.error(error?.message || '读取预警详情失败')
  }
}
async function openRules() {
  try {
    rules.value = (
      previewMode.value ? RiskPreview.getPreviewRiskRules() : await RiskApi.getRiskRules()
    ).map((rule) => ({ ...rule }))
    rulesVisible.value = true
  } catch (error: any) {
    ElMessage.error(error?.message || '读取预警规则失败')
  }
}
async function saveRule(rule: RiskRuleVO) {
  savingRule.value = rule.ruleCode
  try {
    const saved = previewMode.value
      ? RiskPreview.savePreviewRiskRule(rule)
      : await RiskApi.saveRiskRule(rule)
    rule.version = saved?.version ?? rule.version + 1
    ElMessage.success('预警规则已保存')
  } catch (error: any) {
    ElMessage.error(error?.message || '保存预警规则失败')
  } finally {
    savingRule.value = ''
  }
}
function openResolve() {
  resolveForm.reason = ''
  resolveVisible.value = true
}
async function resolve() {
  if (!detail.value) return
  try {
    await resolveFormRef.value?.validate()
    resolving.value = true
    const data = {
      id: detail.value.id,
      expectedVersion: detail.value.version,
      reason: resolveForm.reason
    }
    if (previewMode.value) RiskPreview.resolvePreviewRiskAlert(data)
    else await RiskApi.resolveRiskAlert(data)
    ElMessage.success('预警已处理，处置记录已保存')
    resolveVisible.value = false
    detailVisible.value = false
    await loadPage()
  } catch (error: any) {
    if (error?.message) ElMessage.error(error.message)
  } finally {
    resolving.value = false
  }
}
onMounted(loadPage)
</script>

<style scoped>
.risk-page {
  min-height: 100%;
  padding: 26px 30px 32px;
  color: #303b4c;
  background: #f4f7fb;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

.breadcrumb {
  margin-bottom: 8px;
  font-size: 12px;
  color: #8b96a6;
}

.breadcrumb span {
  margin: 0 6px;
  color: #c0c8d2;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  color: #202b3c;
}

.page-head p {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7d8999;
}

.head-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.privacy-note {
  margin-bottom: 16px;
  background: #f7fbff;
  border: 1px solid #dce8f6;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.metric-card {
  display: flex;
  min-height: 112px;
  padding: 16px 18px;
  color: #687587;
  text-align: left;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 9px;
  transition:
    border-color 0.16s,
    box-shadow 0.16s;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.metric-card:hover,
.metric-card.active {
  border-color: #91baff;
  box-shadow: 0 3px 12px #4778c20d;
}

.metric-card strong {
  font-size: 26px;
  line-height: 1;
  color: #243247;
}

.metric-card small,
.sub-line {
  font-size: 12px;
  color: #96a1af;
}

.list-card {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 9px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.filter-select {
  width: 170px;
}

.scope-label {
  display: inline-flex;
  margin-left: auto;
  font-size: 12px;
  color: #929dad;
  align-items: center;
  gap: 5px;
}

.risk-table {
  width: 100%;
}

.sub-line {
  display: block;
  margin-top: 5px;
}

.alert-title {
  font-size: 13px;
  color: #39465a;
}

.pagination-row {
  display: flex;
  margin-top: 18px;
  font-size: 12px;
  color: #8994a3;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-banner {
  padding: 16px;
  background: #f8fafc;
  border: 1px solid #e7edf5;
  border-radius: 8px;
}

.detail-banner strong {
  display: block;
  margin-top: 12px;
  font-size: 15px;
  color: #344155;
}

.detail-banner p {
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: #5e6d81;
}

.detail-banner.severity-high {
  background: #fff9f9;
  border-color: #f3d9da;
}

.detail-banner.severity-medium {
  background: #fffcf6;
  border-color: #f1e4c9;
}

.detail-grid {
  display: grid;
  padding-bottom: 22px;
  margin-top: 22px;
  border-bottom: 1px solid #edf0f4;
  grid-template-columns: 1fr 1fr;
  gap: 18px 16px;
}

.detail-grid > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-grid span,
.detail-grid small {
  font-size: 12px;
  color: #96a0ae;
}

.detail-grid strong {
  font-size: 13px;
  font-weight: 550;
  color: #344155;
}

.resolution-box {
  padding: 14px;
  margin-top: 22px;
  font-size: 13px;
  line-height: 1.8;
  color: #647286;
  background: #fafbfd;
  border: 1px solid #e7edf5;
  border-radius: 7px;
}

.resolution-box div span {
  color: #929eac;
}

.resolution-box p {
  margin: 8px 0 0;
}

.section-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 650;
  color: #39465a;
}

.drawer-actions {
  display: flex;
  padding-top: 18px;
  margin-top: 24px;
  border-top: 1px solid #edf0f4;
  justify-content: flex-end;
}

.rules-intro,
.rules-footnote {
  font-size: 12px;
  line-height: 1.7;
  color: #8995a5;
}

.rules-intro {
  margin-bottom: 14px;
}

.rule-card {
  padding: 16px;
  margin-bottom: 14px;
  background: #fff;
  border: 1px solid #e7edf5;
  border-radius: 8px;
}

.rule-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.rule-head strong {
  font-size: 14px;
  color: #344155;
}

.rule-head p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8b97a6;
}

.rule-options {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-top: 16px;
}

.rule-options .el-form-item {
  width: 160px;
  margin-bottom: 0;
}

.rule-options .el-button {
  margin-bottom: 1px;
}

.rules-footnote {
  padding: 12px 0;
  border-top: 1px solid #edf0f4;
}

:global(.risk-drawer.el-drawer) {
  color: #303b4c;
  background: #fff;
}

:global(.risk-drawer .el-drawer__header) {
  padding: 20px 24px;
  margin-bottom: 0;
  color: #253246;
  border-bottom: 1px solid #edf0f4;
}

:global(.risk-drawer .el-drawer__body) {
  padding: 22px 24px;
  background: #fff;
}

:global(.resolve-dialog.el-dialog) {
  background: #fff;
  border-radius: 10px;
}

:global(.resolve-dialog .el-dialog__header),
:global(.resolve-dialog .el-dialog__body),
:global(.resolve-dialog .el-dialog__footer) {
  background: #fff;
}

:global(.resolve-dialog .el-dialog__title) {
  color: #253246;
}

:global(.resolve-dialog .el-form-item__label) {
  color: #49566a;
}

@media (width <= 900px) {
  .risk-page {
    padding: 18px;
  }

  .metric-grid {
    gap: 8px;
  }

  .page-head {
    gap: 16px;
  }

  .pagination-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .scope-label {
    margin-left: 0;
  }
}
</style>
