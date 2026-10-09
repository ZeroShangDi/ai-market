import request from '@/config/axios'

export type CustomerFieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'boolean'

export interface CustomerFieldVO {
  id?: string
  fieldKey: string
  label: string
  valueType: CustomerFieldType
  required: boolean
  options: string[]
  visibleRoleCodes: string[]
  enabled: boolean
  listVisible: boolean
  sort: number
  createTime?: string
  updateTime?: string
}

export interface CustomerFieldSaveReq {
  id?: string
  fieldKey: string
  label: string
  valueType: CustomerFieldType
  required: boolean
  optionsJson?: string
  visibleRoleCodes?: string[]
  enabled: boolean
  listVisible: boolean
  sort: number
}

export const getCustomerFields = () =>
  request.get({ url: '/callphone/customer-field/list' }) as Promise<
    Array<Omit<CustomerFieldVO, 'options'> & { optionsJson?: string }>
  >

export const getCustomerFieldOptions = () =>
  request.get({ url: '/callphone/customer-field/options' }) as Promise<
    Array<Omit<CustomerFieldVO, 'options'> & { optionsJson?: string }>
  >

export const saveCustomerField = (data: CustomerFieldSaveReq) =>
  request.post({ url: '/callphone/customer-field/save', data }) as Promise<string | null>

export const updateCustomerFieldStatus = (id: string, enabled: boolean) =>
  request.post({
    url: '/callphone/customer-field/status',
    data: { id, enabled }
  }) as Promise<boolean>
