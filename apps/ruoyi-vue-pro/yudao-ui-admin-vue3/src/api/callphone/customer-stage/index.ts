import request from '@/config/axios'

export interface CustomerStageVO {
  id?: string
  stageCode: string
  name: string
  color: string
  sort: number
  enabled: boolean
  systemDefault: boolean
  customerCount: number
}

export interface CustomerStageHistoryVO {
  id: string
  customerId: string
  customerName: string
  fromStage: string | null
  fromStageName: string
  toStage: string
  toStageName: string
  changedAt: string
  source: 'customer_created' | 'customer_edit'
}

export const getCustomerStages = () =>
  request.get({ url: '/callphone/customer-stage/list' }) as Promise<CustomerStageVO[]>

export const getCustomerStageOptions = () =>
  request.get({ url: '/callphone/customer-stage/options' }) as Promise<CustomerStageVO[]>

export const saveCustomerStage = (
  data: Partial<CustomerStageVO> & { stageCode: string; name: string; color: string }
) => request.post({ url: '/callphone/customer-stage/save', data })

export const getCustomerStageHistory = (params: {
  pageNo: number
  pageSize: number
  stageCode?: string
}) =>
  request.get({ url: '/callphone/customer/stage-history', params }) as Promise<{
    list: CustomerStageHistoryVO[]
    total: number
  }>
