import request from '@/config/axios'

export interface LocalBackupRecord {
  id: string
  status: string
  schemaVersion: number
  artifactSize: number
  tableCount: number
  rowCount: number
  completedAt: string
  createTime: string
}
export interface LocalBackupPreview {
  backupId: string
  schemaVersion: number
  snapshotTenantId: string
  currentTenantId: string
  tableCount: number
  backupRowCount: number
  currentRowCount: number
  createdAt: string
  tokenExpiresAt: string
  previewToken: string
  tables: Array<{ tableName: string; backupRows: number; currentRows: number }>
}
export const getLocalBackupPage = (params: { pageNo: number; pageSize: number }) =>
  request.get({ url: '/callphone/system/local-backup/page', params })
export const createLocalBackup = () =>
  request.post({ url: '/callphone/system/local-backup/create' }) as Promise<{
    backup: LocalBackupRecord
    checksum: string
  }>
export const downloadLocalBackup = (id: string) =>
  request.download({ url: '/callphone/system/local-backup/download', params: { id } })
export const previewLocalBackupRestore = (backupId: string) =>
  request.post({
    url: '/callphone/system/local-backup/restore-preview',
    data: { backupId }
  }) as Promise<LocalBackupPreview>
export const restoreLocalBackup = (data: {
  backupId: string
  previewToken: string
  confirmText: string
}) =>
  request.post({
    url: '/callphone/system/local-backup/restore',
    data
  }) as Promise<LocalBackupRecord>
