import type { AiCallSummaryVO } from '../ai-summary'
import * as SummaryPreview from '../ai-summary/preview'
import * as PreviewStore from '../preview-store'
import type { FollowUpRecommendationVO, RecommendationSourceVO } from './index'

const STORAGE_KEY = 'callphone.ai-follow-up-recommendations.v1'

function read(): FollowUpRecommendationVO[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FollowUpRecommendationVO[]
  } catch {
    return []
  }
}

function write(rows: FollowUpRecommendationVO[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

function allReviewedSummaries(): AiCallSummaryVO[] {
  return SummaryPreview.getPreviewAiCallSummaryPage({
    pageNo: 1,
    pageSize: 100,
    reviewStatus: 'reviewed'
  }).list
}

export function getPreviewRecommendationPage(params: {
  pageNo: number
  pageSize: number
  status?: string
  query?: string
}) {
  const needle = params.query?.trim().toLocaleLowerCase()
  const rows = read().filter(
    (row) =>
      (!params.status || row.status === params.status) &&
      (!needle || `${row.customerName} ${row.callRecordId}`.toLocaleLowerCase().includes(needle))
  )
  const start = (params.pageNo - 1) * params.pageSize
  const all = read()
  return {
    list: rows.slice(start, start + params.pageSize),
    total: rows.length,
    pendingCount: all.filter((row) => row.status === 'pending').length,
    adoptedCount: all.filter((row) => row.status === 'adopted').length,
    dismissedCount: all.filter((row) => row.status === 'dismissed').length
  }
}

export function getPreviewRecommendationSources(): RecommendationSourceVO[] {
  const usedCalls = new Set(read().map((row) => row.callRecordId))
  return allReviewedSummaries()
    .filter(
      (row) =>
        !!row.nextStep?.trim() &&
        !usedCalls.has(row.callRecordId) &&
        PreviewStore.searchPreviewCustomers(row.customerName).some(
          (customer) => customer.customerName === row.customerName
        )
    )
    .map((row) => ({
      callRecordId: row.callRecordId,
      customerName: row.customerName,
      callAt: row.callAt,
      summaryOrigin: row.origin,
      nextStep: row.nextStep,
      summaryVersion: row.version
    }))
}

export function preparePreviewRecommendation(callRecordId: string) {
  const summary = allReviewedSummaries().find((row) => row.callRecordId === callRecordId)
  if (!summary?.nextStep?.trim()) throw new Error('请先复核包含下一步安排的通话总结')
  if (read().some((row) => row.callRecordId === callRecordId)) {
    throw new Error('这条通话总结已进入建议队列')
  }
  const recommendation: FollowUpRecommendationVO = {
    id: `REC-${Date.now()}`,
    customerId: '',
    customerName: summary.customerName,
    callRecordId: summary.callRecordId,
    callAt: summary.callAt,
    sourceSummaryOrigin: summary.origin,
    content: summary.nextStep,
    status: 'pending',
    dueAt: defaultDueAt(),
    version: 1,
    updateTime: new Date().toISOString()
  }
  write([recommendation, ...read()])
  return recommendation
}

export function updatePreviewRecommendation(data: {
  id: string
  expectedVersion: number
  content: string
  dueAt: string
}) {
  const rows = read()
  const row = rows.find((item) => item.id === data.id)
  if (!row || row.status !== 'pending' || row.version !== data.expectedVersion) {
    throw new Error('建议已被其他操作更新，请刷新后重试')
  }
  row.content = data.content.trim()
  row.dueAt = data.dueAt
  row.version += 1
  row.updateTime = new Date().toISOString()
  write(rows)
}

export function adoptPreviewRecommendation(data: {
  id: string
  expectedVersion: number
  title: string
  dueAt: string
}) {
  const rows = read()
  const row = rows.find((item) => item.id === data.id)
  if (!row || row.status !== 'pending' || row.version !== data.expectedVersion) {
    throw new Error('建议已被其他操作更新，请刷新后重试')
  }
  const customer = PreviewStore.searchPreviewCustomers(row.customerName).find(
    (item) => item.customerName === row.customerName
  )
  if (!customer) throw new Error('本地演示客户中找不到对应客户，暂时无法创建跟进事项')
  const task = PreviewStore.savePreviewFollowUpTask(
    {
      customerId: customer.customerId,
      title: data.title.trim(),
      content: row.content,
      dueAt: data.dueAt,
      sourceCallRecordId: row.callRecordId
    },
    customer.customerName,
    customer.phoneDisplay
  )
  row.status = 'adopted'
  row.dueAt = data.dueAt
  row.followUpTaskId = task.id
  row.version += 1
  row.updateTime = new Date().toISOString()
  write(rows)
  return task.id
}

export function dismissPreviewRecommendation(data: {
  id: string
  expectedVersion: number
  reason: string
}) {
  const rows = read()
  const row = rows.find((item) => item.id === data.id)
  if (!row || row.status !== 'pending' || row.version !== data.expectedVersion) {
    throw new Error('建议已被其他操作更新，请刷新后重试')
  }
  row.status = 'dismissed'
  row.reviewReason = data.reason.trim()
  row.version += 1
  row.updateTime = new Date().toISOString()
  write(rows)
}

function defaultDueAt() {
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000)
  due.setHours(10, 0, 0, 0)
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}T10:00:00`
}
