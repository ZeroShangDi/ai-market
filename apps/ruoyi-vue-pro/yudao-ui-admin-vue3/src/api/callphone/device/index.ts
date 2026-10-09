import request from '@/config/axios'

export interface PairedDeviceVO {
  id: string
  displayName: string
  platform: 'android' | 'ios'
  status: 'online' | 'offline' | 'revoked'
  lastSeenAt?: string
}
export interface PairingCodeVO {
  id: string
  pairingCode?: string
  status: 'pending' | 'claimed' | 'expired' | 'revoked'
  expiresAt: string
  deviceId?: string
}

export const getPairedDevicePage = () =>
  request.get<PairedDeviceVO[]>({ url: '/callphone/device/list' })
export const createPairingCode = () =>
  request.post<PairingCodeVO>({ url: '/callphone/device/pairing-code/create' })
export const getPairingCode = (id: string) =>
  request.get<PairingCodeVO>({ url: '/callphone/device/pairing-code/get', params: { id } })
export const cancelPairingCode = (id: string) =>
  request.post({ url: '/callphone/device/pairing-code/cancel', data: { id } })
export const revokePairedDevice = (id: string) =>
  request.post({ url: '/callphone/device/revoke', data: { id } })
