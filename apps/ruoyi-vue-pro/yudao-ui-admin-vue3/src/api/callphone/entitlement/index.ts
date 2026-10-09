import request from '@/config/axios'

export interface EntitlementFeatureVO {
  code: string
  name: string
  enabled: boolean
  used?: number
  limit?: number
}

export interface EntitlementSnapshotVO {
  state: 'not_configured' | 'unavailable' | 'available'
  planCode?: string
  planName?: string
  status?: 'active' | 'expired' | 'suspended' | 'trial'
  expiresAt?: string
  checkedAt?: string
  billingUrl?: string
  message: string
  pairedDeviceCount?: number
  pairedDeviceLimit?: number
  features: EntitlementFeatureVO[]
}

export const getEntitlement = () =>
  request.get({ url: '/callphone/entitlement/current' }) as Promise<EntitlementSnapshotVO>

export const refreshEntitlement = () =>
  request.post({ url: '/callphone/entitlement/refresh' }) as Promise<EntitlementSnapshotVO>
