import type { IntegrationConnectionSave, IntegrationConnectionVO } from './index'

const KEY = 'callphone.integrations.v1'
const catalog: IntegrationConnectionVO[] = [
  {
    provider: 'wecom',
    displayName: '企业微信',
    scopes: ['客户与客户群只读同步'],
    syncIntervalMinutes: 60,
    hasCredentials: false,
    status: 'not_connected',
    version: 0
  },
  {
    provider: 'ai_core',
    displayName: 'Call Phone AI 核心服务',
    scopes: ['授权后发送最少化任务元数据'],
    syncIntervalMinutes: 0,
    hasCredentials: false,
    status: 'not_connected',
    version: 0
  },
  {
    provider: 'object_storage',
    displayName: '私有对象存储',
    scopes: ['知识文档与备份文件'],
    syncIntervalMinutes: 0,
    hasCredentials: false,
    status: 'not_connected',
    version: 0
  }
]
function read(): IntegrationConnectionVO[] {
  try {
    const value = localStorage.getItem(KEY)
    if (!value) return catalog.map((row) => ({ ...row }))
    const stored = JSON.parse(value) as IntegrationConnectionVO[]
    return catalog.map(
      (seed) => stored.find((row) => row.provider === seed.provider) ?? { ...seed }
    )
  } catch {
    return catalog.map((row) => ({ ...row }))
  }
}
function write(rows: IntegrationConnectionVO[]) {
  localStorage.setItem(KEY, JSON.stringify(rows))
}
export function getPreviewIntegrations() {
  return read()
}
export function savePreviewIntegration(data: IntegrationConnectionSave) {
  const rows = read()
  const index = rows.findIndex((row) => row.provider === data.provider)
  const current = rows[index]
  const next: IntegrationConnectionVO = {
    ...current,
    id: current.id ?? `preview-${data.provider}`,
    displayName: data.displayName,
    endpointUrl: data.endpointUrl,
    scopes: data.scopes,
    syncIntervalMinutes: data.syncIntervalMinutes,
    hasCredentials:
      Boolean(data.credentials && Object.values(data.credentials).some(Boolean)) ||
      current.hasCredentials,
    status: 'not_tested',
    lastErrorCode: undefined,
    version: current.version + 1
  }
  rows[index] = next
  write(rows)
  return next
}
export function revokePreviewIntegration(provider: IntegrationConnectionVO['provider']) {
  const rows = read().map((row) =>
    row.provider === provider
      ? {
          ...row,
          id: undefined,
          hasCredentials: false,
          status: 'revoked' as const,
          version: row.version + 1
        }
      : row
  )
  write(rows)
  return rows
}
