import type { RiskAlertPageParams, RiskAlertStatus, RiskAlertVO, RiskRuleVO } from './index'
import * as PreviewStore from '../preview-store'

const ALERTS_KEY = 'callphone.risk-alerts.v1'
const RULES_KEY = 'callphone.risk-alert-rules.v1'
const seedAlerts: RiskAlertVO[] = [
  {
    id: 'RA-8102',
    ruleCode: 'overdue_follow_up',
    ruleName: '跟进事项逾期',
    severity: 'high',
    status: 'open',
    sourceType: 'follow_up_task',
    sourceId: 'task-demo-2002',
    customerId: 'cp-demo-1002',
    customerName: '李女士',
    phoneDisplay: '186 **** 2606',
    sourceTitle: '完成首次电话联系',
    detail: '跟进事项已逾期 2 天，客户仍处于待首次联系阶段。',
    createdAt: '2026-10-05T08:00:00',
    version: 1
  },
  {
    id: 'RA-8094',
    ruleCode: 'stale_customer',
    ruleName: '客户长期未更新',
    severity: 'medium',
    status: 'resolved',
    sourceType: 'customer',
    sourceId: 'cp-demo-1003',
    customerId: 'cp-demo-1003',
    customerName: '王老板',
    phoneDisplay: '139 **** 5714',
    sourceTitle: '已转化客户',
    detail: '客户资料超过 14 天未更新，可结合沟通记录判断是否需要回访。',
    createdAt: '2026-10-04T09:20:00',
    resolvedAt: '2026-10-04T10:15:00',
    resolverName: '林静',
    resolutionReason: '已在其他渠道完成回访，并更新客户阶段。',
    version: 2
  }
]
const seedRules: RiskRuleVO[] = [
  {
    id: 'rule-overdue',
    ruleCode: 'overdue_follow_up',
    name: '跟进事项逾期',
    description: '未完成且超过截止时间的跟进事项。',
    enabled: true,
    thresholdDays: 1,
    severity: 'high',
    version: 1
  },
  {
    id: 'rule-stale',
    ruleCode: 'stale_customer',
    name: '客户长期未更新',
    description: '客户资料超过设定天数未新增或修改，可结合沟通记录判断是否回访。',
    enabled: true,
    thresholdDays: 14,
    severity: 'medium',
    version: 1
  }
]

function read<T>(key: string, seed: T[]): T[] {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T[]) : seed.map((row) => ({ ...row }))
  } catch {
    return seed.map((row) => ({ ...row }))
  }
}
function write<T>(key: string, rows: T[]) {
  localStorage.setItem(key, JSON.stringify(rows))
}

export function getPreviewRiskPage(params: RiskAlertPageParams) {
  const all = read(ALERTS_KEY, seedAlerts)
  const rows = all.filter(
    (row) =>
      (!params.status || row.status === params.status) &&
      (!params.severity || row.severity === params.severity)
  )
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length,
    openCount: all.filter((row) => row.status === 'open').length,
    highCount: all.filter((row) => row.status === 'open' && row.severity === 'high').length,
    mediumCount: all.filter((row) => row.status === 'open' && row.severity === 'medium').length,
    lowCount: all.filter((row) => row.status === 'open' && row.severity === 'low').length,
    resolvedCount: all.filter((row) => row.status === 'resolved').length
  }
}
export function getPreviewRiskAlert(id: string) {
  const row = read(ALERTS_KEY, seedAlerts).find((item) => item.id === id)
  if (!row) throw new Error('预警已不存在')
  return row
}
export function getPreviewRiskRules() {
  return read(RULES_KEY, seedRules)
}
export function savePreviewRiskRule(rule: RiskRuleVO) {
  const rows = getPreviewRiskRules(),
    index = rows.findIndex((row) => row.ruleCode === rule.ruleCode)
  if (index < 0 || rows[index].version !== rule.version)
    throw new Error('预警规则已被更新，请刷新后重试')
  rows[index] = { ...rule, version: rule.version + 1 }
  write(RULES_KEY, rows)
  return rows[index]
}
export function resolvePreviewRiskAlert(data: {
  id: string
  expectedVersion: number
  reason: string
}) {
  const rows = read(ALERTS_KEY, seedAlerts),
    row = rows.find((item) => item.id === data.id)
  if (!row || row.status !== 'open' || row.version !== data.expectedVersion)
    throw new Error('预警已被其他人处置，请刷新后重试')
  row.status = 'resolved'
  row.resolutionReason = data.reason.trim()
  row.resolverName = '林静'
  row.resolvedAt = new Date().toISOString()
  row.version += 1
  write(ALERTS_KEY, rows)
  return row
}
export function scanPreviewRiskAlerts() {
  const rules = getPreviewRiskRules(),
    alerts = read(ALERTS_KEY, seedAlerts)
  const overdueRule = rules.find((rule) => rule.ruleCode === 'overdue_follow_up' && rule.enabled)
  if (overdueRule) {
    const overdue = PreviewStore.previewFollowUpTasks({
      pageNo: 1,
      pageSize: 100,
      status: 'overdue'
    }).list
    for (const task of overdue) {
      const exists = alerts.some(
        (row) =>
          row.status === 'open' && row.ruleCode === overdueRule.ruleCode && row.sourceId === task.id
      )
      if (!exists)
        alerts.unshift({
          id: `RA-${Date.now()}`,
          ruleCode: overdueRule.ruleCode,
          ruleName: overdueRule.name,
          severity: overdueRule.severity,
          status: 'open' as RiskAlertStatus,
          sourceType: 'follow_up_task',
          sourceId: task.id,
          customerId: task.customerId,
          customerName: task.customerName,
          phoneDisplay: task.phoneDisplay,
          sourceTitle: task.title,
          detail: `跟进事项已超过截止时间 ${Math.max(1, Math.floor((Date.now() - new Date(task.dueAt).getTime()) / 86400000))} 天。`,
          createdAt: new Date().toISOString(),
          version: 1
        })
    }
  }
  write(ALERTS_KEY, alerts)
  return getPreviewRiskPage({ pageNo: 1, pageSize: 20 })
}
