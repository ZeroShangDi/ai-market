import type { AiReviewSuggestionVO, ReviewPageParams } from './index'

const STORAGE_KEY = 'callphone.ai-review-suggestions.v1'
const seed: AiReviewSuggestionVO[] = [
  {
    id: 'AR-24018',
    customerName: '陈女士',
    callRecordId: 'CALL-8037',
    sourceRunId: 'RUN-9136',
    createdAt: '2026-10-05T08:42:00',
    riskLevel: 'high',
    suggestion: '客户提到预算尚未审批，建议先确认预算区间，再提供分阶段实施方案。',
    evidence: '通话总结：客户计划与合伙人讨论预算；暂未确认可投入金额。',
    status: 'pending',
    version: 1
  },
  {
    id: 'AR-24017',
    customerName: '王女士',
    callRecordId: 'CALL-8051',
    sourceRunId: 'RUN-9133',
    createdAt: '2026-10-05T08:18:00',
    riskLevel: 'medium',
    suggestion: '一周内发送门店上线准备清单，并邀请实施顾问参加下一次沟通。',
    evidence: '客户关注上线周期、培训安排和实施保障，预计本月评估方案。',
    status: 'pending',
    version: 1
  },
  {
    id: 'AR-24012',
    customerName: '张先生',
    callRecordId: 'CALL-8042',
    sourceRunId: 'RUN-9122',
    createdAt: '2026-10-04T15:35:00',
    riskLevel: 'low',
    suggestion: '发送一页简版方案，覆盖上线周期和培训计划。',
    evidence: '客户明确希望收到简版方案，并确认首店培训时间。',
    status: 'approved',
    reviewerName: '林静',
    reviewedAt: '2026-10-04T16:05:00',
    reviewReason: '建议内容与客户明确表达一致。',
    version: 2
  }
]

function read(): AiReviewSuggestionVO[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as AiReviewSuggestionVO[]) : seed.map((row) => ({ ...row }))
  } catch {
    return seed.map((row) => ({ ...row }))
  }
}
function write(rows: AiReviewSuggestionVO[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function resetPreviewReviewSuggestions() {
  write(seed.map((row) => ({ ...row })))
}

export function getPreviewReviewSuggestionPage(params: ReviewPageParams) {
  const needle = params.query?.trim()
  const all = read()
  const rows = all.filter(
    (row) =>
      (!params.status ||
        (params.status === 'reviewed' ? row.status !== 'pending' : row.status === params.status)) &&
      (!params.riskLevel || row.riskLevel === params.riskLevel) &&
      (!needle || String(row.callRecordId).includes(needle))
  )
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length,
    pendingCount: all.filter((row) => row.status === 'pending').length,
    highRiskPendingCount: all.filter((row) => row.status === 'pending' && row.riskLevel === 'high')
      .length,
    reviewedCount: all.filter((row) => row.status !== 'pending').length
  }
}

export function getPreviewReviewSuggestion(id: string) {
  const row = read().find((item) => item.id === id)
  if (!row) throw new Error('建议记录不存在或已被移除')
  return row
}

export function reviewPreviewSuggestion(data: {
  id: string
  expectedVersion: number
  decision: 'approved' | 'edited' | 'rejected'
  suggestion?: string
  reason: string
}) {
  const rows = read()
  const row = rows.find((item) => item.id === data.id)
  if (!row || row.status !== 'pending' || row.version !== data.expectedVersion) {
    throw new Error('建议已被其他人处理，请刷新后重试')
  }
  if (data.decision === 'edited' && !data.suggestion?.trim())
    throw new Error('修改后的建议不能为空')
  row.status = data.decision
  if (data.decision === 'edited') row.suggestion = data.suggestion!.trim()
  row.reviewReason = data.reason.trim()
  row.reviewerName = '林静'
  row.reviewedAt = new Date().toISOString()
  row.version += 1
  write(rows)
  return row
}
