import type { UserVO } from '@/api/system/user'

const KEY = 'callphone-preview-members-v1'
const ROLE_KEY = 'callphone-preview-member-roles-v1'
const seed: UserVO[] = [
  {
    id: 101,
    username: 'linjing',
    nickname: '林静',
    deptId: 1,
    deptName: '销售一组',
    postIds: [],
    email: 'lin.jing@example.test',
    mobile: '13800001001',
    sex: 2,
    avatar: '',
    loginIp: '',
    status: 0,
    remark: '重点客户负责人',
    loginDate: new Date('2026-10-04T08:42:00'),
    createTime: new Date('2026-08-11T10:00:00')
  },
  {
    id: 102,
    username: 'wangxiaohu',
    nickname: '王小虎',
    deptId: 1,
    deptName: '销售一组',
    postIds: [],
    email: 'wang.xiaohu@example.test',
    mobile: '13800001002',
    sex: 1,
    avatar: '',
    loginIp: '',
    status: 0,
    remark: '',
    loginDate: new Date('2026-10-04T08:19:00'),
    createTime: new Date('2026-08-18T10:00:00')
  },
  {
    id: 103,
    username: 'zhouning',
    nickname: '周宁',
    deptId: 2,
    deptName: '销售二组',
    postIds: [],
    email: 'zhou.ning@example.test',
    mobile: '13800001003',
    sex: 2,
    avatar: '',
    loginIp: '',
    status: 0,
    remark: '',
    loginDate: new Date('2026-10-03T17:32:00'),
    createTime: new Date('2026-09-01T10:00:00')
  },
  {
    id: 104,
    username: 'chenyu',
    nickname: '陈宇',
    deptId: 2,
    deptName: '销售二组',
    postIds: [],
    email: 'chen.yu@example.test',
    mobile: '13800001004',
    sex: 1,
    avatar: '',
    loginIp: '',
    status: 1,
    remark: '暂离团队',
    loginDate: new Date('2026-09-28T16:12:00'),
    createTime: new Date('2026-09-15T10:00:00')
  }
]

function read() {
  try {
    const value = localStorage.getItem(KEY)
    return value ? (JSON.parse(value) as UserVO[]) : seed.map((row) => ({ ...row }))
  } catch {
    return seed.map((row) => ({ ...row }))
  }
}
function write(rows: UserVO[]) {
  localStorage.setItem(KEY, JSON.stringify(rows))
}
export function getPreviewMemberPage(params: {
  pageNo: number
  pageSize: number
  username?: string
  mobile?: string
  status?: number
  deptId?: number
}) {
  const username = params.username?.trim().toLowerCase() || ''
  const mobile = params.mobile?.trim() || ''
  const rows = read().filter(
    (row) =>
      (!username ||
        row.username.toLowerCase().includes(username) ||
        row.nickname.toLowerCase().includes(username)) &&
      (!mobile || row.mobile.includes(mobile)) &&
      (params.status === undefined || row.status === params.status) &&
      (!params.deptId || row.deptId === params.deptId)
  )
  return {
    list: rows.slice((params.pageNo - 1) * params.pageSize, params.pageNo * params.pageSize),
    total: rows.length
  }
}
export function savePreviewMember(
  input: Pick<
    UserVO,
    'username' | 'nickname' | 'deptId' | 'deptName' | 'mobile' | 'email' | 'remark'
  > & { id?: number }
) {
  const rows = read(),
    previous = rows.find((row) => row.id === input.id)
  const member: UserVO = {
    ...previous,
    ...input,
    id: input.id || Math.max(100, ...rows.map((row) => row.id)) + 1,
    postIds: previous?.postIds || [],
    sex: previous?.sex || 0,
    avatar: previous?.avatar || '',
    loginIp: previous?.loginIp || '',
    status: previous?.status ?? 0,
    loginDate: previous?.loginDate || new Date(),
    createTime: previous?.createTime || new Date()
  }
  write(previous ? rows.map((row) => (row.id === previous.id ? member : row)) : [member, ...rows])
  return member
}
export function setPreviewMemberStatus(id: number, status: number) {
  write(read().map((row) => (row.id === id ? { ...row, status } : row)))
}
export function getPreviewMember(id: number) {
  return read().find((row) => row.id === id)
}
export function getPreviewMemberRoleIds(id: number) {
  try {
    const assignments = JSON.parse(localStorage.getItem(ROLE_KEY) || '{}') as Record<
      string,
      number[]
    >
    return assignments[String(id)] || (id === 101 ? [1, 2] : [2])
  } catch {
    return id === 101 ? [1, 2] : [2]
  }
}
export function setPreviewMemberRoleIds(id: number, roleIds: number[]) {
  let assignments: Record<string, number[]> = {}
  try {
    assignments = JSON.parse(localStorage.getItem(ROLE_KEY) || '{}') as Record<string, number[]>
  } catch {
    assignments = {}
  }
  assignments[String(id)] = roleIds
  localStorage.setItem(ROLE_KEY, JSON.stringify(assignments))
}
