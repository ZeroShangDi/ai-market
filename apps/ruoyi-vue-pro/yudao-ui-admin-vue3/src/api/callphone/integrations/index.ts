import request from '@/config/axios'

export type IntegrationProvider = 'wecom' | 'ai_core' | 'object_storage'
export interface IntegrationConnectionVO {
  id?: string
  provider: IntegrationProvider
  displayName: string
  endpointUrl?: string
  scopes: string[]
  syncIntervalMinutes: number
  hasCredentials: boolean
  status: 'not_connected' | 'not_tested' | 'revoked' | 'connected' | 'error'
  lastErrorCode?: string
  lastCheckedAt?: string
  version: number
}
export interface IntegrationConnectionSave {
  id?: string
  provider: IntegrationProvider
  displayName: string
  endpointUrl?: string
  scopes: string[]
  syncIntervalMinutes: number
  credentials?: Record<string, string>
  expectedVersion: number
}
export const getIntegrationList = () =>
  request.get({ url: '/callphone/integration/list' }) as Promise<IntegrationConnectionVO[]>
export const saveIntegration = (data: IntegrationConnectionSave) => {
  const { credentials, ...body } = data
  const headers: Record<string, string> = {}
  if (credentials && Object.keys(credentials).length) {
    const bytes = new TextEncoder().encode(JSON.stringify(credentials))
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
    headers['X-CallPhone-Integration-Credentials'] = btoa(binary)
  }
  return request.post({ url: '/callphone/integration/save', data: body, headers })
}
export const revokeIntegration = (id: string, expectedVersion: number) =>
  request.post({ url: '/callphone/integration/revoke', params: { id, expectedVersion } })
export const testIntegration = (id: string, expectedVersion: number) =>
  request.post({
    url: '/callphone/integration/test',
    params: { id, expectedVersion }
  }) as Promise<IntegrationConnectionVO>
