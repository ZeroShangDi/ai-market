import type { DeptVO } from '@/api/system/dept'
import type { RoleVO } from '@/api/system/role'

const DEPT_KEY = 'callphone-preview-teams-v1',
  ROLE_KEY = 'callphone-preview-roles-v2',
  LEGACY_ROLE_KEY = 'callphone-preview-roles-v1',
  PERM_KEY = 'callphone-preview-role-permissions-v1'
const seedDepts: DeptVO[] = [
  {
    id: 1,
    name: '销售一组',
    parentId: 0,
    status: 0,
    sort: 1,
    leaderUserId: 101,
    phone: '',
    email: '',
    createTime: new Date('2026-08-01')
  },
  {
    id: 2,
    name: '销售二组',
    parentId: 0,
    status: 0,
    sort: 2,
    leaderUserId: 103,
    phone: '',
    email: '',
    createTime: new Date('2026-08-02')
  },
  {
    id: 3,
    name: '渠道拓展组',
    parentId: 0,
    status: 0,
    sort: 3,
    leaderUserId: 102,
    phone: '',
    email: '',
    createTime: new Date('2026-08-03')
  }
]
const seedRoles: RoleVO[] = [
  {
    id: 1,
    name: '销售主管',
    code: 'sales_lead',
    sort: 1,
    status: 0,
    type: 1,
    dataScope: 2,
    dataScopeDeptIds: [1],
    createTime: new Date('2026-08-01')
  },
  {
    id: 2,
    name: '销售顾问',
    code: 'sales_agent',
    sort: 2,
    status: 0,
    type: 1,
    dataScope: 5,
    dataScopeDeptIds: [],
    createTime: new Date('2026-08-02')
  },
  {
    id: 3,
    name: 'Call Phone 管理员',
    code: 'callphone_admin',
    sort: 3,
    status: 0,
    type: 1,
    dataScope: 1,
    dataScopeDeptIds: [],
    createTime: new Date('2026-08-03')
  }
]
function read<T>(key: string, seed: T[]): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : seed.map((row) => ({ ...row }))
  } catch {
    return seed.map((row) => ({ ...row }))
  }
}
function write<T>(key: string, rows: T[]) {
  localStorage.setItem(key, JSON.stringify(rows))
}
export function listPreviewDepts() {
  return read(DEPT_KEY, seedDepts).sort((a, b) => a.sort - b.sort)
}
export function savePreviewDept(
  input: Partial<DeptVO> & Pick<DeptVO, 'name' | 'parentId' | 'sort'>
) {
  const rows = read(DEPT_KEY, seedDepts),
    old = rows.find((row) => row.id === input.id)
  const row: DeptVO = {
    ...old,
    ...input,
    id: input.id || Math.max(0, ...rows.map((item) => item.id)) + 1,
    status: old?.status ?? 0,
    leaderUserId: input.leaderUserId || old?.leaderUserId || 0,
    phone: input.phone || old?.phone || '',
    email: input.email || old?.email || '',
    createTime: old?.createTime || new Date()
  }
  write(DEPT_KEY, old ? rows.map((item) => (item.id === old.id ? row : item)) : [...rows, row])
  return row
}
export function setPreviewDeptStatus(id: number, status: number) {
  write(
    DEPT_KEY,
    read(DEPT_KEY, seedDepts).map((row) => (row.id === id ? { ...row, status } : row))
  )
}
export function listPreviewRoles() {
  let roles: RoleVO[]
  const current = localStorage.getItem(ROLE_KEY)
  if (current) {
    roles = read(ROLE_KEY, seedRoles)
  } else {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_ROLE_KEY) || 'null') as RoleVO[] | null
      if (legacy) {
        roles = legacy.map((role) => ({
          ...role,
          dataScope:
            role.dataScope === 1
              ? 5
              : role.dataScope === 2
                ? role.dataScopeDeptIds?.length
                  ? 2
                  : 3
                : role.dataScope === 3
                  ? 4
                  : role.dataScope === 4
                    ? 2
                    : role.dataScope === 5
                      ? 1
                      : role.dataScope
        }))
        write(ROLE_KEY, roles)
      } else roles = read(ROLE_KEY, seedRoles)
    } catch {
      roles = read(ROLE_KEY, seedRoles)
    }
  }
  return roles.sort((a, b) => a.sort - b.sort)
}
export function savePreviewRole(input: Partial<RoleVO> & Pick<RoleVO, 'name' | 'code' | 'sort'>) {
  const rows = read(ROLE_KEY, seedRoles),
    old = rows.find((row) => row.id === input.id)
  const row: RoleVO = {
    ...old,
    ...input,
    id: input.id || Math.max(0, ...rows.map((item) => item.id)) + 1,
    status: old?.status ?? 0,
    type: input.type || old?.type || 1,
    dataScope: input.dataScope ?? old?.dataScope ?? 1,
    dataScopeDeptIds: input.dataScopeDeptIds || old?.dataScopeDeptIds || [],
    createTime: old?.createTime || new Date()
  }
  write(ROLE_KEY, old ? rows.map((item) => (item.id === old.id ? row : item)) : [...rows, row])
  return row
}
export function setPreviewRoleStatus(id: number, status: number) {
  write(
    ROLE_KEY,
    read(ROLE_KEY, seedRoles).map((row) => (row.id === id ? { ...row, status } : row))
  )
}
export function getPreviewRolePermissions(id: number) {
  try {
    const values = JSON.parse(localStorage.getItem(PERM_KEY) || '{}') as Record<string, string[]>
    return values[String(id)] || ['callphone:customer:list', 'callphone:call:record:query']
  } catch {
    return ['callphone:customer:list', 'callphone:call:record:query']
  }
}
export function setPreviewRolePermissions(id: number, permissions: string[]) {
  let values: Record<string, string[]> = {}
  try {
    values = JSON.parse(localStorage.getItem(PERM_KEY) || '{}') as Record<string, string[]>
  } catch {
    values = {}
  }
  values[String(id)] = permissions
  localStorage.setItem(PERM_KEY, JSON.stringify(values))
}
