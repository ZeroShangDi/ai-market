import request from '@/config/axios'

export interface BusinessDictionaryTypeVO {
  id?: number | string
  name: string
  type: string
}

export interface BusinessDictionaryItemVO {
  id?: number | string
  sort: number
  label: string
  value: string
  dictType: string
  status: number
  colorType?: string
  cssClass?: string
  remark?: string
}

export const getTypes = () =>
  request.get<BusinessDictionaryTypeVO[]>({ url: '/callphone/dictionary/type/list' })

export const createType = (
  data: Omit<BusinessDictionaryTypeVO, 'id'> & { status: number; remark?: string }
) => request.post<number>({ url: '/callphone/dictionary/type/create', data })

export const getDataPage = (params: { pageNo: number; pageSize: number; dictType: string }) =>
  request.get<{ list: BusinessDictionaryItemVO[]; total: number }>({
    url: '/callphone/dictionary/data/page',
    params
  })

export const createData = (data: BusinessDictionaryItemVO) =>
  request.post<number>({ url: '/callphone/dictionary/data/create', data })

export const updateData = (data: BusinessDictionaryItemVO) =>
  request.put<boolean>({ url: '/callphone/dictionary/data/update', data })
