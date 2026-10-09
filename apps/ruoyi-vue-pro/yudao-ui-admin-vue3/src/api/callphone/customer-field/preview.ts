import type { CustomerFieldVO } from './index'

const KEY = 'callphone-preview-customer-fields-v1'
const seed: CustomerFieldVO[] = [
  {
    id: 'cf_1',
    fieldKey: 'industry',
    label: '所属行业',
    valueType: 'select',
    required: false,
    options: ['制造业', '零售', '教育', '互联网', '其他'],
    visibleRoleCodes: [],
    enabled: true,
    listVisible: true,
    sort: 10
  },
  {
    id: 'cf_2',
    fieldKey: 'annual_budget',
    label: '年度预算',
    valueType: 'number',
    required: false,
    options: [],
    visibleRoleCodes: ['sales_lead'],
    enabled: true,
    listVisible: true,
    sort: 20
  },
  {
    id: 'cf_3',
    fieldKey: 'preferred_contact',
    label: '偏好联系时段',
    valueType: 'multi_select',
    required: false,
    options: ['工作日上午', '工作日下午', '工作日晚上'],
    visibleRoleCodes: [],
    enabled: true,
    listVisible: false,
    sort: 30
  },
  {
    id: 'cf_4',
    fieldKey: 'needs_demo',
    label: '需要产品演示',
    valueType: 'boolean',
    required: false,
    options: [],
    visibleRoleCodes: [],
    enabled: false,
    listVisible: false,
    sort: 40
  }
]

function read() {
  try {
    return (
      (JSON.parse(localStorage.getItem(KEY) || 'null') as CustomerFieldVO[] | null) ||
      seed.map((item) => ({ ...item, options: [...item.options] }))
    )
  } catch {
    return seed.map((item) => ({ ...item, options: [...item.options] }))
  }
}
function write(rows: CustomerFieldVO[]) {
  localStorage.setItem(KEY, JSON.stringify(rows))
}
export function listPreviewCustomerFields() {
  return read().sort((a, b) => a.sort - b.sort)
}
export function listPreviewCustomerFieldOptions(roleCodes: string[] = ['sales_agent']) {
  return listPreviewCustomerFields().filter(
    (field) =>
      field.enabled &&
      (!field.visibleRoleCodes?.length ||
        field.visibleRoleCodes.some((code) => roleCodes.includes(code)))
  )
}
export function savePreviewCustomerField(input: CustomerFieldVO) {
  const rows = read()
  const old = rows.find((row) => row.id === input.id)
  const field = { ...input, id: input.id || `cf_${Date.now()}`, options: [...input.options] }
  write(old ? rows.map((row) => (row.id === old.id ? field : row)) : [...rows, field])
  return field
}
export function setPreviewCustomerFieldStatus(id: string, enabled: boolean) {
  write(read().map((row) => (row.id === id ? { ...row, enabled } : row)))
}
