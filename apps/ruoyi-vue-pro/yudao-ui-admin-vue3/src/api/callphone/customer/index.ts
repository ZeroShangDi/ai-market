import request from '@/config/axios'

export interface CustomerVO {
  id: string
  name: string
  phoneDisplay: string
  stage: string
  source?: string
  tags?: string
  customFields?: Record<string, unknown>
  ownerUserId: string
  ownerName?: string
  createTime?: string
}

export interface CustomerPageParams {
  pageNo: number
  pageSize: number
  query?: string
  stage?: string
}

export interface CustomerImportRow {
  rowNo: number
  name: string
  phone: string
  stage?: string
  source?: string
  tags?: string
  customFields?: Record<string, unknown>
  idempotencyKey: string
}

export interface CustomerImportRowResult {
  rowNo: number
  status: 'imported' | 'duplicate' | 'failed'
  message: string
  customerId?: string
}

export interface CustomerImportResult {
  rows: CustomerImportRowResult[]
  importedCount: number
  duplicateCount: number
  failedCount: number
}

export const getCustomerPage = (params: CustomerPageParams) =>
  request.get({ url: '/callphone/customer/page', params })

export const getCustomer = (id: string) =>
  request.get({ url: '/callphone/customer/get', params: { id } }) as Promise<CustomerVO | null>

export const saveCustomer = (
  data: Partial<CustomerVO> & {
    name: string
    phone: string
    customFields?: Record<string, unknown>
  }
) => request.post({ url: '/callphone/customer/save', data })

export const importCustomers = (rows: CustomerImportRow[]) =>
  request.post({
    url: '/callphone/customer/import',
    data: { rows }
  }) as Promise<CustomerImportResult>

export const assignCustomers = (customerIds: string[], ownerUserId: string) =>
  request.post({
    url: '/callphone/customer/assign-batch',
    data: { customerIds, ownerUserId }
  }) as Promise<number>

export type CustomerTagBatchMode = 'append' | 'replace' | 'clear'
export const updateCustomerTags = (
  customerIds: string[],
  mode: CustomerTagBatchMode,
  tags: string[]
) =>
  request.post({
    url: '/callphone/customer/tags-batch',
    data: { customerIds, mode, tags }
  }) as Promise<number>

export const archiveCustomer = (id: string) =>
  request.post({ url: '/callphone/customer/archive', params: { id } })
