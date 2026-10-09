<template>
  <div class="members-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="成员、状态与角色变更保存在当前浏览器。正式模式复用芋道用户、部门和角色服务，不创建 Call Phone 用户表。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading"
        ><div
          ><h1>成员管理</h1
          ><p>管理可使用 Call Phone 的团队成员；账号、部门和角色由工作区统一维护。</p></div
        ><el-button
          v-if="previewMode || checkPermi(['system:user:create'])"
          type="primary"
          @click="createMember"
          ><Icon icon="ep:plus" />新增成员</el-button
        ></header
      >
      <div class="member-metrics"
        ><article
          ><span>筛选结果</span><strong>{{ total }}</strong></article
        ><article
          ><span>本页启用成员</span><strong>{{ enabledCount }}</strong></article
        ><article
          ><span>本页已停用</span><strong>{{ disabledCount }}</strong></article
        ><div class="metric-hint"><Icon icon="ep:lock" />成员状态由组织管理员权限控制</div></div
      >
      <el-form :inline="true" :model="query" class="filter-bar" @submit.prevent="load"
        ><el-form-item label="成员"
          ><el-input
            v-model="query.username"
            clearable
            placeholder="姓名或账号"
            @keyup.enter="search" /></el-form-item
        ><el-form-item label="手机"
          ><el-input
            v-model="query.mobile"
            clearable
            maxlength="11"
            placeholder="搜索手机号"
            @keyup.enter="search" /></el-form-item
        ><el-form-item label="部门"
          ><el-select v-model="query.deptId" clearable placeholder="全部部门"
            ><el-option
              v-for="dept in departments"
              :key="dept.id"
              :label="dept.name"
              :value="dept.id" /></el-select></el-form-item
        ><el-form-item label="状态"
          ><el-select v-model="query.status" clearable placeholder="全部状态"
            ><el-option label="启用" :value="0" /><el-option
              label="停用"
              :value="1" /></el-select></el-form-item
        ><el-form-item
          ><el-button type="primary" @click="search"><Icon icon="ep:search" />筛选</el-button
          ><el-button @click="reset"><Icon icon="ep:refresh" />重置</el-button></el-form-item
        ></el-form
      >
      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="成员" min-width="210"
          ><template #default="{ row }"
            ><div class="member-cell"
              ><el-avatar :size="36" :src="row.avatar">{{ initials(row.nickname) }}</el-avatar
              ><div
                ><strong>{{ row.nickname }}</strong
                ><small>@{{ row.username }}</small></div
              ></div
            ></template
          ></el-table-column
        >
        <el-table-column label="部门" prop="deptName" min-width="140" /><el-table-column
          label="联系电话"
          min-width="140"
          ><template #default="{ row }">{{ maskMobile(row.mobile) }}</template></el-table-column
        >
        <el-table-column
          v-if="previewMode || checkPermi(['system:permission:assign-user-role'])"
          label="角色"
          min-width="210"
          ><template #default="{ row }"
            ><template v-if="previewMode"
              ><el-tag v-for="role in roleNames(row)" :key="role" class="role-tag" effect="plain">{{
                role
              }}</el-tag
              ><span v-if="!roleNames(row).length" class="muted">未分配</span></template
            ><template v-else
              ><el-tag
                v-for="role in roleNamesByUserId[row.id] || []"
                :key="`${row.id}-${role}`"
                class="role-tag"
                effect="plain"
                >{{ role }}</el-tag
              ><span v-if="roleLoadStatusByUserId[row.id] === 'loading'" class="muted">读取中</span
              ><span v-else-if="roleLoadStatusByUserId[row.id] === 'failed'" class="muted"
                >暂无读取权限</span
              ><span
                v-else-if="
                  roleLoadStatusByUserId[row.id] === 'loaded' &&
                  (unavailableRoleCountByUserId[row.id] || 0) > 0
                "
                class="muted"
                >{{
                  roleNamesByUserId[row.id]?.length
                    ? `另有 ${unavailableRoleCountByUserId[row.id]} 个不可用角色`
                    : `有 ${unavailableRoleCountByUserId[row.id]} 个已停用或不可用角色`
                }}</span
              ><span
                v-else-if="
                  roleLoadStatusByUserId[row.id] === 'loaded' && !roleNamesByUserId[row.id]?.length
                "
                class="muted"
                >未分配</span
              ><span v-else-if="!roleLoadStatusByUserId[row.id]" class="muted">—</span></template
            ></template
          ></el-table-column
        >
        <el-table-column label="最近登录" min-width="160"
          ><template #default="{ row }">{{ formatTime(row.loginDate) }}</template></el-table-column
        >
        <el-table-column label="状态" width="90"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 0 ? 'success' : 'info'" effect="light">{{
              row.status === 0 ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          v-if="
            previewMode || checkPermi(['system:user:update', 'system:permission:assign-user-role'])
          "
          label="操作"
          width="220"
          fixed="right"
          ><template #default="{ row }"
            ><el-button
              v-if="previewMode || checkPermi(['system:user:update'])"
              link
              type="primary"
              @click="editMember(row)"
              >编辑</el-button
            ><el-button
              v-if="previewMode || checkPermi(['system:permission:assign-user-role'])"
              link
              type="primary"
              @click="openRoles(row)"
              >分配角色</el-button
            ><el-button
              v-if="previewMode || checkPermi(['system:user:update'])"
              link
              :type="row.status === 0 ? 'danger' : 'success'"
              @click="toggleStatus(row)"
              >{{ row.status === 0 ? '停用' : '启用' }}</el-button
            ></template
          ></el-table-column
        >
        <template #empty><el-empty :description="error || '没有符合条件的成员'" /></template>
      </el-table>
      <footer class="table-footer"
        ><span>共 {{ total.toLocaleString() }} 位成员</span
        ><el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="load"
      /></footer>
      <p class="privacy-note"
        >列表中的手机号默认脱敏。账号、组织和角色来源于当前租户的芋道系统管理服务。</p
      >
    </section>
    <UserForm v-if="!previewMode" ref="userFormRef" @success="load" /><UserAssignRoleForm
      v-if="!previewMode"
      ref="roleFormRef"
      @success="load"
    />
    <el-dialog
      v-model="memberVisible"
      :title="memberForm.id ? '编辑成员' : '新增成员'"
      width="520px"
      ><el-form ref="memberFormRef" :model="memberForm" :rules="memberRules" label-position="top"
        ><el-form-item label="姓名" prop="nickname"
          ><el-input v-model="memberForm.nickname" maxlength="50" /></el-form-item
        ><el-form-item label="登录账号" prop="username"
          ><el-input
            v-model="memberForm.username"
            maxlength="50"
            :disabled="Boolean(memberForm.id)" /></el-form-item
        ><el-form-item label="部门" prop="deptId"
          ><el-select v-model="memberForm.deptId" class="fill"
            ><el-option
              v-for="dept in departments"
              :key="dept.id"
              :label="dept.name"
              :value="dept.id" /></el-select></el-form-item
        ><el-form-item label="手机号" prop="mobile"
          ><el-input v-model="memberForm.mobile" maxlength="20" /></el-form-item
        ><el-form-item label="邮箱"
          ><el-input v-model="memberForm.email" maxlength="100" /></el-form-item
        ><el-form-item label="备注"
          ><el-input
            v-model="memberForm.remark"
            type="textarea"
            maxlength="200" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="memberVisible = false">取消</el-button
        ><el-button type="primary" @click="savePreviewMember">保存成员</el-button></template
      ></el-dialog
    >
    <el-dialog v-model="rolesVisible" title="分配 Call Phone 角色" width="440px"
      ><div v-if="selectedMember" class="role-user"
        ><strong>{{ selectedMember.nickname }}</strong
        ><small>@{{ selectedMember.username }} · {{ selectedMember.deptName }}</small></div
      ><p class="role-intro">角色决定成员可使用的页面和业务操作，服务端会继续校验其数据范围。</p
      ><el-checkbox-group v-model="selectedRoleIds" class="role-options"
        ><el-checkbox v-for="role in demoRoles" :key="role.id" :value="role.id">{{
          role.name
        }}</el-checkbox></el-checkbox-group
      ><template #footer
        ><el-button @click="rolesVisible = false">取消</el-button
        ><el-button type="primary" @click="savePreviewRoles">保存角色</el-button></template
      ></el-dialog
    >
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import { checkPermi } from '@/utils/permission'
import UserForm from '@/views/system/user/UserForm.vue'
import UserAssignRoleForm from '@/views/system/user/UserAssignRoleForm.vue'
import * as UserApi from '@/api/system/user'
import * as PermissionApi from '@/api/system/permission'
import * as RoleApi from '@/api/system/role'
import * as DeptApi from '@/api/system/dept'
import * as PreviewMembers from '@/api/callphone/member-preview'
defineOptions({ name: 'CallPhoneMembers' })
const route = useRoute(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false),
  error = ref(''),
  rows = ref<UserApi.UserVO[]>([]),
  total = ref(0),
  departments = ref<Array<{ id: number; name: string }>>([]),
  roleNamesByUserId = ref<Record<number, string[]>>({}),
  unavailableRoleCountByUserId = ref<Record<number, number>>({}),
  roleLoadStatusByUserId = ref<Record<number, 'loading' | 'loaded' | 'failed'>>({}),
  userFormRef = ref(),
  roleFormRef = ref(),
  memberVisible = ref(false),
  rolesVisible = ref(false),
  memberFormRef = ref<FormInstance>(),
  selectedMember = ref<UserApi.UserVO>(),
  selectedRoleIds = ref<number[]>([])
let roleLoadSequence = 0
const query = reactive({
  pageNo: 1,
  pageSize: 10,
  username: '',
  mobile: '',
  deptId: undefined as number | undefined,
  status: undefined as number | undefined
})
const memberForm = reactive({
  id: undefined as number | undefined,
  username: '',
  nickname: '',
  deptId: 1,
  deptName: '销售一组',
  mobile: '',
  email: '',
  remark: ''
})
const demoRoles = [
  { id: 1, name: '销售主管' },
  { id: 2, name: '销售顾问' },
  { id: 3, name: 'Call Phone 管理员' }
]
const memberRules: FormRules = {
  nickname: [{ required: true, message: '请填写成员姓名', trigger: 'blur' }],
  username: [
    {
      required: true,
      pattern: /^[a-zA-Z][a-zA-Z0-9._-]{2,49}$/,
      message: '账号以字母开头，长度 3-50 位',
      trigger: 'blur'
    }
  ],
  deptId: [{ required: true, message: '请选择部门', trigger: 'change' }],
  mobile: [
    {
      required: true,
      pattern: /^\+?[0-9][0-9 -]{5,19}$/,
      message: '请输入有效手机号',
      trigger: 'blur'
    }
  ]
}
const enabledCount = computed(() => rows.value.filter((row) => row.status === 0).length),
  disabledCount = computed(() => rows.value.filter((row) => row.status !== 0).length)
async function load() {
  loading.value = true
  error.value = ''
  try {
    if (previewMode) {
      const data = PreviewMembers.getPreviewMemberPage(query)
      rows.value = data.list
      total.value = data.total
      departments.value = [
        { id: 1, name: '销售一组' },
        { id: 2, name: '销售二组' }
      ]
    } else {
      const [page, depts] = await Promise.all([
        UserApi.getUserPage({
          ...query,
          username: query.username || undefined,
          mobile: query.mobile || undefined,
          deptId: query.deptId || undefined,
          status: query.status
        } as PageParam),
        DeptApi.getSimpleDeptList()
      ])
      rows.value = page.list || []
      total.value = page.total || 0
      departments.value = (depts || []).filter((item) => item.status === 0)
      await loadMemberRoles(rows.value)
    }
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.message || '成员列表加载失败'
  } finally {
    loading.value = false
  }
}
async function loadMemberRoles(users: UserApi.UserVO[]) {
  const sequence = ++roleLoadSequence
  roleNamesByUserId.value = {}
  unavailableRoleCountByUserId.value = {}
  roleLoadStatusByUserId.value = Object.fromEntries(users.map((user) => [user.id, 'loading']))
  if (!users.length) return
  if (!checkPermi(['system:permission:assign-user-role'])) {
    roleLoadStatusByUserId.value = {}
    return
  }

  let roleNameById: Map<number, string>
  try {
    const roleOptions = await RoleApi.getSimpleRoleList()
    roleNameById = new Map(roleOptions.map((role) => [role.id, role.name]))
  } catch {
    if (sequence !== roleLoadSequence) return
    roleLoadStatusByUserId.value = Object.fromEntries(users.map((user) => [user.id, 'failed']))
    return
  }

  const roleResults = await Promise.allSettled(
    users.map(async (user) => ({
      userId: user.id,
      roleIds: await PermissionApi.getUserRoleList(user.id)
    }))
  )
  if (sequence !== roleLoadSequence) return

  const roleNames: Record<number, string[]> = {}
  const unavailableRoleCounts: Record<number, number> = {}
  const roleStatuses: Record<number, 'loaded' | 'failed'> = {}
  roleResults.forEach((result, index) => {
    const userId = users[index].id
    if (result.status === 'rejected') {
      roleStatuses[userId] = 'failed'
      return
    }
    roleStatuses[userId] = 'loaded'
    const assignedRoleIds = Array.isArray(result.value.roleIds) ? result.value.roleIds : []
    roleNames[userId] = assignedRoleIds
      .map((roleId) => roleNameById.get(roleId))
      .filter((name): name is string => Boolean(name))
    unavailableRoleCounts[userId] = assignedRoleIds.filter(
      (roleId) => !roleNameById.has(roleId)
    ).length
  })
  roleNamesByUserId.value = roleNames
  unavailableRoleCountByUserId.value = unavailableRoleCounts
  roleLoadStatusByUserId.value = roleStatuses
}
function search() {
  query.pageNo = 1
  void load()
}
function reset() {
  Object.assign(query, {
    pageNo: 1,
    pageSize: 10,
    username: '',
    mobile: '',
    deptId: undefined,
    status: undefined
  })
  void load()
}
function createMember() {
  if (!previewMode) {
    userFormRef.value?.open('create')
    return
  }
  Object.assign(memberForm, {
    id: undefined,
    username: '',
    nickname: '',
    deptId: departments.value[0]?.id || 1,
    deptName: departments.value[0]?.name || '',
    mobile: '',
    email: '',
    remark: ''
  })
  memberVisible.value = true
}
function editMember(row: UserApi.UserVO) {
  if (!previewMode) {
    userFormRef.value?.open('update', row.id)
    return
  }
  Object.assign(memberForm, {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    deptId: row.deptId,
    deptName: row.deptName || '',
    mobile: row.mobile,
    email: row.email,
    remark: row.remark || ''
  })
  memberVisible.value = true
}
async function savePreviewMember() {
  await memberFormRef.value?.validate()
  const dept = departments.value.find((item) => item.id === memberForm.deptId)
  PreviewMembers.savePreviewMember({ ...memberForm, deptName: dept?.name || '' })
  ElMessage.success('演示成员已保存')
  memberVisible.value = false
  await load()
}
async function toggleStatus(row: UserApi.UserVO) {
  const status = row.status === 0 ? 1 : 0
  try {
    await ElMessageBox.confirm(
      `确认${status === 0 ? '启用' : '停用'}成员“${row.nickname}”吗？`,
      `${status === 0 ? '启用' : '停用'}成员`,
      { type: 'warning' }
    )
    if (previewMode) PreviewMembers.setPreviewMemberStatus(row.id, status)
    else await UserApi.updateUserStatus(row.id, status)
    ElMessage.success(status === 0 ? '成员已启用' : '成员已停用')
    await load()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '成员状态更新失败')
  }
}
function openRoles(row: UserApi.UserVO) {
  selectedMember.value = row
  if (!previewMode) {
    roleFormRef.value?.open(row)
    return
  }
  selectedRoleIds.value = PreviewMembers.getPreviewMemberRoleIds(row.id)
  rolesVisible.value = true
}
function savePreviewRoles() {
  if (selectedMember.value)
    PreviewMembers.setPreviewMemberRoleIds(selectedMember.value.id, selectedRoleIds.value)
  ElMessage.success('角色配置已保存')
  rolesVisible.value = false
  void load()
}
function roleNames(row: UserApi.UserVO) {
  if (!previewMode) return []
  const ids = PreviewMembers.getPreviewMemberRoleIds(row.id)
  return demoRoles.filter((role) => ids.includes(role.id)).map((role) => role.name)
}
function initials(value?: string) {
  return (value || '成员').slice(-2)
}
function maskMobile(value?: string) {
  if (!value) return '—'
  return value.length > 7 ? `${value.slice(0, 3)} **** ${value.slice(-4)}` : '****'
}
function formatTime(value?: string | Date) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
onMounted(load)
</script>

<style scoped>
.members-page {
  min-height: calc(100vh - 100px);
  padding: 20px;
  color: #293347;
  background: #f5f7fb;
}

.preview-banner {
  margin-bottom: 14px;
}

.page-panel {
  padding: 22px;
  background: #fff;
  border: 1px solid #e5e9f0;
  border-radius: 10px;
}

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: #253149;
}

.page-heading p,
.privacy-note {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7a8598;
}

.member-metrics {
  display: flex;
  padding: 14px 16px;
  margin-bottom: 18px;
  border: 1px solid #e8ecf3;
  border-radius: 9px;
  align-items: center;
  gap: 24px;
}

.member-metrics article {
  min-width: 100px;
}

.member-metrics article span,
.member-metrics article strong {
  display: block;
}

.member-metrics article span {
  font-size: 12px;
  color: #8490a1;
}

.member-metrics article strong {
  margin-top: 4px;
  font-size: 21px;
  color: #26354c;
}

.metric-hint {
  display: flex;
  margin-left: auto;
  font-size: 12px;
  color: #8b96a7;
  align-items: center;
  gap: 7px;
}

.filter-bar {
  margin-bottom: 6px;
}

.member-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.member-cell strong,
.member-cell small {
  display: block;
}

.member-cell strong {
  color: #26354c;
}

.member-cell small {
  margin-top: 4px;
  font-size: 12px;
  color: #929cad;
}

.role-tag {
  margin-right: 4px;
  margin-bottom: 3px;
}

.muted {
  color: #929cad;
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  color: #7a8598;
}

.privacy-note {
  margin-top: 16px;
}

.fill {
  width: 100%;
}

.role-user strong,
.role-user small {
  display: block;
}

.role-user small {
  margin-top: 5px;
  font-size: 12px;
  color: #8792a5;
}

.role-intro {
  margin: 18px 0;
  font-size: 13px;
  line-height: 1.6;
  color: #65738a;
}

.role-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (width <= 720px) {
  .members-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .page-heading {
    align-items: flex-start;
    gap: 12px;
  }

  .member-metrics {
    flex-wrap: wrap;
    gap: 12px;
  }

  .metric-hint {
    width: 100%;
    margin-left: 0;
  }

  .table-footer {
    align-items: flex-start;
    gap: 12px;
    flex-direction: column;
  }
}
</style>
