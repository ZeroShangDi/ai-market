import type { AiUsageFeedback, AiUsagePageParams, AiUsageVO } from './index'

const STORAGE_KEY = 'callphone.ai-usage.v1'
const seeds: AiUsageVO[] = [
  {
    id: 'AI-26091',
    actorUserId: '1001',
    actorName: '陈晓',
    feature: 'call_summary',
    sourceType: 'call_record',
    sourceId: 'CALL-5038',
    modelKey: 'callphone-summary-v2',
    promptVersion: 'summary-4',
    status: 'succeeded',
    latencyMs: 1480,
    inputTokens: 612,
    outputTokens: 184,
    estimatedCost: 0.0048,
    createdAt: '2026-10-05 09:42:16',
    feedbackRating: 5,
    feedbackReason: 'accurate'
  },
  {
    id: 'AI-26090',
    actorUserId: '1002',
    actorName: '林雨',
    feature: 'follow_up_suggestion',
    sourceType: 'customer',
    sourceId: 'CUS-2048',
    modelKey: 'callphone-assistant-v2',
    promptVersion: 'follow-up-3',
    status: 'succeeded',
    latencyMs: 1920,
    inputTokens: 448,
    outputTokens: 226,
    estimatedCost: 0.0051,
    createdAt: '2026-10-05 09:18:03'
  },
  {
    id: 'AI-26089',
    actorUserId: '1001',
    actorName: '陈晓',
    feature: 'call_summary',
    sourceType: 'call_record',
    sourceId: 'CALL-5035',
    modelKey: 'callphone-summary-v2',
    promptVersion: 'summary-4',
    status: 'failed',
    latencyMs: 5010,
    errorCode: 'PROVIDER_TIMEOUT',
    createdAt: '2026-10-05 08:54:45'
  },
  {
    id: 'AI-26088',
    actorUserId: '1003',
    actorName: '周明',
    feature: 'script_assistant',
    sourceType: 'customer',
    sourceId: 'CUS-1932',
    modelKey: 'callphone-assistant-v2',
    promptVersion: 'script-2',
    status: 'succeeded',
    latencyMs: 1104,
    inputTokens: 290,
    outputTokens: 126,
    estimatedCost: 0.0032,
    createdAt: '2026-10-05 08:31:29',
    feedbackRating: 4,
    feedbackReason: 'useful'
  },
  {
    id: 'AI-26087',
    actorUserId: '1002',
    actorName: '林雨',
    feature: 'call_summary',
    sourceType: 'call_record',
    sourceId: 'CALL-5029',
    modelKey: 'callphone-summary-v2',
    promptVersion: 'summary-4',
    status: 'running',
    createdAt: '2026-10-05 08:27:10'
  },
  {
    id: 'AI-26086',
    actorUserId: '1004',
    actorName: '赵宁',
    feature: 'follow_up_suggestion',
    sourceType: 'customer',
    sourceId: 'CUS-1876',
    modelKey: 'callphone-assistant-v2',
    promptVersion: 'follow-up-3',
    status: 'cancelled',
    latencyMs: 320,
    createdAt: '2026-10-04 17:46:31'
  }
]

function read(): AiUsageVO[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value ? (JSON.parse(value) as AiUsageVO[]) : seeds.map((item) => ({ ...item }))
  } catch {
    return seeds.map((item) => ({ ...item }))
  }
}

function write(rows: AiUsageVO[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function getPreviewAiUsagePage(params: AiUsagePageParams) {
  const rows = read().filter(
    (row) =>
      (!params.feature || row.feature === params.feature) &&
      (!params.status || row.status === params.status) &&
      (!params.query ||
        `${row.id} ${row.actorName} ${row.sourceId}`
          .toLowerCase()
          .includes(params.query.toLowerCase())) &&
      (!params.from || row.createdAt >= params.from) &&
      (!params.to || row.createdAt <= params.to)
  )
  const start = (params.pageNo - 1) * params.pageSize
  return { list: rows.slice(start, start + params.pageSize), total: rows.length }
}

export function getPreviewAiUsageDetail(id: string) {
  return read().find((row) => row.id === id) || null
}

export function savePreviewAiUsageFeedback(id: string, feedback: AiUsageFeedback) {
  const rows = read()
  const row = rows.find((item) => item.id === id)
  if (!row) return false
  row.feedbackRating = feedback.rating
  row.feedbackReason = feedback.reasonCode
  write(rows)
  return true
}
