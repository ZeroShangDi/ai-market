import request from '@/config/axios'

export type RiskSeverity = 'low' | 'medium' | 'high'
export type RiskAlertStatus = 'open' | 'resolved'
export type RiskSourceType = 'follow_up_task' | 'customer'

export interface RiskAlertVO {
  id: string
  ruleCode: string
  ruleName: string
  severity: RiskSeverity
  status: RiskAlertStatus
  sourceType: RiskSourceType
  sourceId: string
  customerId: string
  customerName: string
  phoneDisplay: string
  sourceTitle: string
  detail: string
  createdAt: string
  resolvedAt?: string
  resolverName?: string
  resolutionReason?: string
  version: number
}

export interface RiskRuleVO {
  id: string
  ruleCode: string
  name: string
  description: string
  enabled: boolean
  thresholdDays: number
  severity: RiskSeverity
  version: number
}

export interface RiskAlertPageParams {
  pageNo: number
  pageSize: number
  status?: RiskAlertStatus | ''
  severity?: RiskSeverity | ''
}

export const getRiskAlertPage = (params: RiskAlertPageParams) =>
  request.get({ url: '/callphone/risk-alert/page', params }) as Promise<{
    list: RiskAlertVO[]
    total: number
    openCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    resolvedCount: number
  }>

export const getRiskAlert = (id: string) =>
  request.get({ url: '/callphone/risk-alert/get', params: { id } }) as Promise<RiskAlertVO>

export const resolveRiskAlert = (data: { id: string; expectedVersion: number; reason: string }) =>
  request.post({ url: '/callphone/risk-alert/resolve', data })

export const getRiskRules = () =>
  request.get({ url: '/callphone/risk-alert/rule-list' }) as Promise<RiskRuleVO[]>

export const saveRiskRule = (data: RiskRuleVO) =>
  request.post({ url: '/callphone/risk-alert/rule-save', data })

export const scanRiskAlerts = () => request.post({ url: '/callphone/risk-alert/scan' })
