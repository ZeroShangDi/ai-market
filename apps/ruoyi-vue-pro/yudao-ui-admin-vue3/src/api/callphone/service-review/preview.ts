import type { ServiceReviewVO } from './index'

const STORAGE_KEY = 'callphone.service-reviews.v1'
const openCalls: ServiceReviewVO[] = [
  {
    callRecordId: 'CALL-8061',
    customerName: '赵女士',
    phoneDisplay: '138 **** 4128',
    callAt: '2026-10-05 15:26:12',
    durationSeconds: 248,
    result: '已接通',
    recordingState: 'none',
    score: 0,
    reviewStatus: 'pass',
    checklist: {},
    note: '',
    version: 0
  },
  {
    callRecordId: 'CALL-8058',
    customerName: '周先生',
    phoneDisplay: '151 **** 3204',
    callAt: '2026-10-05 14:50:03',
    durationSeconds: 62,
    result: '已接通',
    recordingState: 'none',
    score: 0,
    reviewStatus: 'pass',
    checklist: {},
    note: '',
    version: 0
  },
  {
    callRecordId: 'CALL-8053',
    customerName: '刘女士',
    phoneDisplay: '137 **** 0189',
    callAt: '2026-10-05 13:18:40',
    durationSeconds: 0,
    result: '无人接听',
    recordingState: 'none',
    score: 0,
    reviewStatus: 'pass',
    checklist: {},
    note: '',
    version: 0
  }
]
const seedReviews: ServiceReviewVO[] = [
  {
    id: 'SR-1204',
    callRecordId: 'CALL-8048',
    customerName: '陈女士',
    phoneDisplay: '186 **** 2606',
    callAt: '2026-10-04 16:08:42',
    durationSeconds: 192,
    result: '已接通',
    recordingState: 'none',
    score: 92,
    reviewStatus: 'pass',
    checklist: { identify: true, consent: true, need: true, result: true, nextStep: false },
    note: '后续时间未与客户确认，已提醒补充具体日期。',
    reviewerName: '林静',
    reviewedAt: '2026-10-04 17:02:16',
    version: 1
  },
  {
    id: 'SR-1201',
    callRecordId: 'CALL-8039',
    customerName: '王先生',
    phoneDisplay: '139 **** 5714',
    callAt: '2026-10-04 11:32:09',
    durationSeconds: 306,
    result: '已接通',
    recordingState: 'none',
    score: 76,
    reviewStatus: 'needs_improvement',
    checklist: { identify: true, consent: false, need: true, result: true, nextStep: false },
    note: '开场未确认对方是否方便，跟进安排也缺少时间。',
    reviewerName: '林静',
    reviewedAt: '2026-10-04 12:05:44',
    version: 1
  }
]

function read() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored
      ? (JSON.parse(stored) as ServiceReviewVO[])
      : seedReviews.map((row) => ({ ...row }))
  } catch {
    return seedReviews.map((row) => ({ ...row }))
  }
}

function write(rows: ServiceReviewVO[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function getPreviewServiceReviewAvailableCalls() {
  const reviewed = new Set(read().map((row) => row.callRecordId))
  return openCalls.filter((row) => !reviewed.has(row.callRecordId)).map((row) => ({ ...row }))
}

export function getPreviewServiceReviewPage(params: {
  pageNo: number
  pageSize: number
  reviewStatus?: string
}) {
  const all = read()
  const rows = all.filter((row) => !params.reviewStatus || row.reviewStatus === params.reviewStatus)
  const start = (params.pageNo - 1) * params.pageSize
  return {
    list: rows.slice(start, start + params.pageSize),
    total: rows.length,
    passCount: all.filter((row) => row.reviewStatus === 'pass').length,
    improveCount: all.filter((row) => row.reviewStatus === 'needs_improvement').length,
    averageScore: all.length
      ? Math.round(all.reduce((sum, row) => sum + row.score, 0) / all.length)
      : 0
  }
}

export function savePreviewServiceReview(data: ServiceReviewVO) {
  const rows = read()
  const row = {
    ...data,
    id: data.id || `SR-${Date.now()}`,
    reviewerName: '林静',
    reviewedAt: new Date().toLocaleString('sv-SE'),
    version: data.version + 1
  }
  const index = rows.findIndex((item) => item.callRecordId === data.callRecordId)
  if (index >= 0) rows[index] = row
  else rows.unshift(row)
  write(rows)
}
