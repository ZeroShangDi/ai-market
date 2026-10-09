export interface AcquisitionChannel {
  id: string
  name: string
  platform: 'wechat' | 'douyin' | 'website' | 'offline'
  code: string
  ownerName: string
  attributionWindowDays: number
  status: 'active' | 'disabled'
  createdAt: string
}

export interface TrackingCode {
  id: string
  name: string
  type: 'channel' | 'employee' | 'store' | 'visitor_identification'
  channelId: string
  employeeId?: string
  employeeName?: string
  storeName?: string
  matchRule?: string
  welcomeText: string
  landingUrl?: string
  publicCode?: string
  status: 'active' | 'disabled'
  scans: number
  leads: number
  createdAt: string
}

const CHANNEL_KEY = 'callphone-preview-acquisition-channels-v1'
const CODE_KEY = 'callphone-preview-tracking-codes-v1'
const LINK_KEY = 'callphone-preview-marketing-links-v1'
const POSTER_KEY = 'callphone-preview-posters-v1'
const channelsSeed: AcquisitionChannel[] = [
  {
    id: 'channel-demo-1',
    name: '微信朋友圈',
    platform: 'wechat',
    code: 'wechat-feed',
    ownerName: '林静',
    attributionWindowDays: 30,
    status: 'active',
    createdAt: '2026-10-01T09:30:00'
  },
  {
    id: 'channel-demo-2',
    name: '门店展架',
    platform: 'offline',
    code: 'store-display',
    ownerName: '王小虎',
    attributionWindowDays: 14,
    status: 'active',
    createdAt: '2026-10-02T14:10:00'
  }
]
const codesSeed: TrackingCode[] = [
  {
    id: 'tracking-demo-1',
    name: '十月新品朋友圈',
    type: 'channel',
    channelId: 'channel-demo-1',
    welcomeText: '您好，欢迎了解本月新品。',
    status: 'active',
    scans: 126,
    leads: 18,
    createdAt: '2026-10-02T10:00:00'
  },
  {
    id: 'tracking-demo-2',
    name: '林静个人名片',
    type: 'employee',
    channelId: 'channel-demo-1',
    employeeId: 'staff-1',
    employeeName: '林静',
    welcomeText: '您好，我是林静，很高兴为您服务。',
    status: 'active',
    scans: 48,
    leads: 9,
    createdAt: '2026-10-03T11:20:00'
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
export function listAcquisitionChannels() {
  return read(CHANNEL_KEY, channelsSeed).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export function saveAcquisitionChannel(
  input: Omit<AcquisitionChannel, 'id' | 'createdAt' | 'status'> & { id?: string }
) {
  const rows = read(CHANNEL_KEY, channelsSeed)
  if (rows.some((row) => row.code === input.code && row.id !== input.id))
    throw new Error('渠道编码已存在')
  const old = rows.find((row) => row.id === input.id)
  const row: AcquisitionChannel = {
    ...old,
    ...input,
    id: input.id || `channel-demo-${Date.now()}`,
    status: old?.status || 'active',
    createdAt: old?.createdAt || new Date().toISOString()
  }
  write(CHANNEL_KEY, old ? rows.map((item) => (item.id === old.id ? row : item)) : [row, ...rows])
  return row
}
export function setAcquisitionChannelStatus(id: string, status: AcquisitionChannel['status']) {
  write(
    CHANNEL_KEY,
    read(CHANNEL_KEY, channelsSeed).map((row) => (row.id === id ? { ...row, status } : row))
  )
}
export function listTrackingCodes(type: TrackingCode['type']) {
  return read(CODE_KEY, codesSeed)
    .filter((row) => row.type === type)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export function saveTrackingCode(
  input: Omit<TrackingCode, 'id' | 'scans' | 'leads' | 'createdAt' | 'status'> & { id?: string }
) {
  const rows = read(CODE_KEY, codesSeed),
    old = rows.find((row) => row.id === input.id)
  const row: TrackingCode = {
    ...old,
    ...input,
    id: input.id || `tracking-demo-${Date.now()}`,
    status: old?.status || 'active',
    scans: old?.scans || 0,
    leads: old?.leads || 0,
    createdAt: old?.createdAt || new Date().toISOString()
  }
  write(CODE_KEY, old ? rows.map((item) => (item.id === old.id ? row : item)) : [row, ...rows])
  return row
}
export function updateTrackingCode(id: string, patch: Partial<TrackingCode>) {
  write(
    CODE_KEY,
    read(CODE_KEY, codesSeed).map((row) => (row.id === id ? { ...row, ...patch } : row))
  )
}
export function simulateTrackingScan(id: string) {
  const rows = read(CODE_KEY, codesSeed)
  const code = rows.find((row) => row.id === id)
  if (!code || code.status !== 'active') return false
  write(
    CODE_KEY,
    rows.map((row) =>
      row.id === id
        ? { ...row, scans: row.scans + 1, leads: row.leads + (Math.random() > 0.65 ? 1 : 0) }
        : row
    )
  )
  return true
}
export function getAcquisitionChannel(id: string) {
  return listAcquisitionChannels().find((row) => row.id === id)
}

export interface MarketingLink {
  id: string
  name: string
  destinationUrl: string
  channelId: string
  utmSource: string
  status: 'active' | 'disabled'
  visits: number
  leads: number
  createdAt: string
}
export interface PosterComposition {
  id: string
  name: string
  title: string
  template: string
  trackingCodeId: string
  status: 'draft' | 'ready'
  downloads: number
  createdAt: string
}
export function listMarketingLinks() {
  return read<MarketingLink>(LINK_KEY, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export function saveMarketingLink(
  input: Omit<MarketingLink, 'id' | 'visits' | 'leads' | 'createdAt' | 'status'> & { id?: string }
) {
  const rows = read<MarketingLink>(LINK_KEY, []),
    old = rows.find((row) => row.id === input.id)
  const row: MarketingLink = {
    ...old,
    ...input,
    id: input.id || `link-demo-${Date.now()}`,
    status: old?.status || 'active',
    visits: old?.visits || 0,
    leads: old?.leads || 0,
    createdAt: old?.createdAt || new Date().toISOString()
  }
  write(LINK_KEY, old ? rows.map((item) => (item.id === old.id ? row : item)) : [row, ...rows])
  return row
}
export function updateMarketingLink(id: string, patch: Partial<MarketingLink>) {
  write(
    LINK_KEY,
    listMarketingLinks().map((row) => (row.id === id ? { ...row, ...patch } : row))
  )
}
export function simulateLinkVisit(id: string) {
  write(
    LINK_KEY,
    listMarketingLinks().map((row) =>
      row.id === id && row.status === 'active'
        ? { ...row, visits: row.visits + 1, leads: row.leads + (Math.random() > 0.7 ? 1 : 0) }
        : row
    )
  )
}
export function listPosterCompositions() {
  return read<PosterComposition>(POSTER_KEY, []).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}
export function savePosterComposition(
  input: Omit<PosterComposition, 'id' | 'status' | 'downloads' | 'createdAt'> & { id?: string }
) {
  const rows = read<PosterComposition>(POSTER_KEY, []),
    old = rows.find((item) => item.id === input.id),
    row: PosterComposition = {
      ...old,
      ...input,
      id: input.id || `poster-demo-${Date.now()}`,
      status: old?.status || 'draft',
      downloads: old?.downloads || 0,
      createdAt: old?.createdAt || new Date().toISOString()
    }
  write(POSTER_KEY, old ? rows.map((item) => (item.id === old.id ? row : item)) : [row, ...rows])
  return row
}
export function renderPoster(id: string) {
  write(
    POSTER_KEY,
    listPosterCompositions().map((row) => (row.id === id ? { ...row, status: 'ready' } : row))
  )
}
export function downloadPoster(id: string) {
  write(
    POSTER_KEY,
    listPosterCompositions().map((row) =>
      row.id === id && row.status === 'ready' ? { ...row, downloads: row.downloads + 1 } : row
    )
  )
}
