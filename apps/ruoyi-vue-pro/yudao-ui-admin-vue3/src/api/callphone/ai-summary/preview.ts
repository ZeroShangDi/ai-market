import type { AiCallSummaryPageParams, AiCallSummarySaveReq, AiCallSummaryVO } from './index'

const STORAGE_KEY = 'callphone.ai-call-summaries.v1'
const seedRows: AiCallSummaryVO[] = [
  {
    id: 'SUM-8042',
    callRecordId: 'CALL-8042',
    customerName: '张先生',
    ownerName: '林静',
    callAt: '2026-10-05 10:24:18',
    durationSeconds: 326,
    result: '已接通',
    summary:
      '客户在比较两种门店方案，关注上线周期和后续培训。已说明标准交付流程，客户希望收到一页简版方案。',
    customerNeeds: '希望 3 周内完成首店上线，并安排店员培训。',
    objections: '担心上线期间影响门店营业。',
    nextStep: '10 月 6 日发送简版方案，并确认首店培训时间。',
    origin: 'manual',
    reviewStatus: 'draft',
    version: 1
  },
  {
    id: 'SUM-8037',
    callRecordId: 'CALL-8037',
    customerName: '陈女士',
    ownerName: '周宁',
    callAt: '2026-10-04 16:08:42',
    durationSeconds: 192,
    result: '已接通',
    summary: '客户已了解基础功能，计划本周与合伙人讨论预算。',
    customerNeeds: '需要合伙人共同确认预算和采购时间。',
    objections: '预算暂未确定。',
    nextStep: '10 月 7 日回访，确认预算讨论结果。',
    origin: 'ai',
    reviewStatus: 'reviewed',
    version: 2
  }
]
const sampleCalls: Record<
  string,
  Pick<AiCallSummaryVO, 'customerName' | 'ownerName' | 'callAt' | 'durationSeconds' | 'result'>
> = {
  'CALL-8051': {
    customerName: '王女士',
    ownerName: '林静',
    callAt: '2026-10-05 09:42:05',
    durationSeconds: 284,
    result: '已接通'
  },
  'CALL-8049': {
    customerName: '李先生',
    ownerName: '林静',
    callAt: '2026-10-05 09:16:31',
    durationSeconds: 91,
    result: '已接通'
  }
}

function read(): AiCallSummaryVO[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as AiCallSummaryVO[]) : seedRows.map((row) => ({ ...row }))
  } catch {
    return seedRows.map((row) => ({ ...row }))
  }
}

function write(rows: AiCallSummaryVO[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function getPreviewAiCallSummaryPage(params: AiCallSummaryPageParams) {
  const query = params.query?.trim().toLocaleLowerCase()
  const rows = read().filter(
    (row) =>
      (!query ||
        `${row.callRecordId} ${row.customerName} ${row.ownerName}`
          .toLocaleLowerCase()
          .includes(query)) &&
      (!params.reviewStatus || row.reviewStatus === params.reviewStatus)
  )
  const start = (params.pageNo - 1) * params.pageSize
  return { list: rows.slice(start, start + params.pageSize), total: rows.length }
}

export function getPreviewAiCallSummary(callRecordId: string) {
  return read().find((row) => row.callRecordId === callRecordId) || null
}

export function getPreviewAiCallSummaryAvailableCalls() {
  const saved = new Set(read().map((row) => row.callRecordId))
  return [
    {
      id: '',
      callRecordId: 'CALL-8051',
      customerName: '王女士',
      ownerName: '林静',
      callAt: '2026-10-05 09:42:05',
      durationSeconds: 284,
      result: '已接通',
      summary: '',
      customerNeeds: '',
      objections: '',
      nextStep: '',
      origin: 'manual' as const,
      reviewStatus: 'draft' as const,
      version: 0
    },
    {
      id: '',
      callRecordId: 'CALL-8049',
      customerName: '李先生',
      ownerName: '林静',
      callAt: '2026-10-05 09:16:31',
      durationSeconds: 91,
      result: '已接通',
      summary: '',
      customerNeeds: '',
      objections: '',
      nextStep: '',
      origin: 'manual' as const,
      reviewStatus: 'draft' as const,
      version: 0
    }
  ].filter((row) => !saved.has(row.callRecordId))
}

export function savePreviewAiCallSummary(data: AiCallSummarySaveReq, source?: AiCallSummaryVO) {
  const rows = read()
  const existing = rows.find((row) => row.callRecordId === data.callRecordId)
  const call = sampleCalls[data.callRecordId] || source
  if (existing) {
    Object.assign(existing, {
      summary: data.summary,
      customerNeeds: data.customerNeeds || '',
      objections: data.objections || '',
      nextStep: data.nextStep || '',
      customerName: call?.customerName || existing.customerName,
      ownerName: call?.ownerName || existing.ownerName,
      callAt: call?.callAt || existing.callAt,
      durationSeconds: call?.durationSeconds ?? existing.durationSeconds,
      result: call?.result || existing.result,
      version: existing.version + 1,
      reviewStatus: 'draft' as const,
      origin: 'manual' as const
    })
  } else {
    rows.unshift({
      id: `SUM-${Date.now()}`,
      callRecordId: data.callRecordId,
      customerName: call?.customerName || '演示客户',
      ownerName: call?.ownerName || '当前成员',
      callAt: call?.callAt || new Date().toLocaleString('sv-SE'),
      durationSeconds: call?.durationSeconds || 0,
      result: call?.result || '已接通',
      summary: data.summary,
      customerNeeds: data.customerNeeds || '',
      objections: data.objections || '',
      nextStep: data.nextStep || '',
      origin: 'manual',
      reviewStatus: 'draft',
      version: 1
    })
  }
  write(rows)
  return true
}

export function reviewPreviewAiCallSummary(callRecordId: string, expectedVersion: number) {
  const rows = read()
  const row = rows.find((item) => item.callRecordId === callRecordId)
  if (!row || row.reviewStatus !== 'draft' || row.version !== expectedVersion) return false
  row.reviewStatus = 'reviewed'
  row.version += 1
  write(rows)
  return true
}
