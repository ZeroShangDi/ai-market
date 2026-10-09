import request from '@/config/axios'

export interface CallPhoneRoleMenuVO {
  id: number
  name: string
  permission?: string
  type: number
  parentId: number
  path?: string
  component?: string
}

export interface CallPhoneRoleMenuOptionsVO {
  menus: CallPhoneRoleMenuVO[]
  assignedMenuIds: number[]
}

export const getRoleMenuOptions = (roleId: number) =>
  request.get<CallPhoneRoleMenuOptionsVO>({
    url: '/callphone/team-role/menu-options',
    params: { roleId }
  })

export const saveRoleMenuPermissions = (data: { roleId: number; menuIds: number[] }) =>
  request.post<boolean>({ url: '/callphone/team-role/menu-permissions', data })
