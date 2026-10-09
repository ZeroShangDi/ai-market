<template>
  <div class="teams-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="团队、角色、数据范围和 Call Phone 页面权限保存在浏览器本地。正式模式复用芋道部门、角色和权限服务。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel"
      ><header class="page-heading"
        ><div
          ><h1>团队与角色</h1
          ><p>维护团队组织和成员角色；页面权限及数据范围由服务端角色权限控制。</p></div
        ></header
      >
      <el-tabs v-model="activeTab" class="team-tabs">
        <el-tab-pane label="团队部门" name="departments"
          ><div class="tab-heading"
            ><div
              ><strong>组织结构</strong
              ><small>部门提供成员归属与团队数据范围的组织基础。</small></div
            ><el-button
              v-if="previewMode || checkPermi(['system:dept:create'])"
              type="primary"
              @click="createDept"
              ><Icon icon="ep:plus" />新建部门</el-button
            ></div
          >
          <el-table v-loading="deptLoading" :data="departments" row-key="id"
            ><el-table-column label="部门名称" min-width="200"
              ><template #default="{ row }"
                ><div class="dept-name"
                  ><span class="dept-icon"><Icon icon="ep:office-building" /></span
                  ><strong>{{ row.name }}</strong></div
                ></template
              ></el-table-column
            ><el-table-column label="上级部门" min-width="150"
              ><template #default="{ row }">{{
                deptLabel(row.parentId)
              }}</template></el-table-column
            ><el-table-column label="负责人" min-width="130"
              ><template #default="{ row }">{{
                leaderLabel(row.leaderUserId)
              }}</template></el-table-column
            ><el-table-column label="排序" prop="sort" width="90" /><el-table-column
              label="状态"
              width="100"
              ><template #default="{ row }"
                ><el-tag :type="row.status === 0 ? 'success' : 'info'" effect="light">{{
                  row.status === 0 ? '启用' : '停用'
                }}</el-tag></template
              ></el-table-column
            ><el-table-column label="操作" width="170" fixed="right"
              ><template #default="{ row }"
                ><el-button
                  v-if="previewMode || checkPermi(['system:dept:update'])"
                  link
                  type="primary"
                  @click="editDept(row)"
                  >编辑</el-button
                ><el-button
                  v-if="previewMode || checkPermi(['system:dept:update'])"
                  link
                  :type="row.status === 0 ? 'danger' : 'success'"
                  @click="toggleDept(row)"
                  >{{ row.status === 0 ? '停用' : '启用' }}</el-button
                ></template
              ></el-table-column
            ><template #empty><el-empty :description="loadError || '暂无团队部门'" /></template
          ></el-table>
        </el-tab-pane>
        <el-tab-pane label="角色与页面权限" name="roles"
          ><div class="tab-heading"
            ><div
              ><strong>角色配置</strong
              ><small>角色权限会应用到成员账号，数据范围由后端执行。</small></div
            ><el-button
              v-if="previewMode || checkPermi(['system:role:create'])"
              type="primary"
              @click="createRole"
              ><Icon icon="ep:plus" />新建角色</el-button
            ></div
          >
          <el-table v-loading="roleLoading" :data="roles" row-key="id"
            ><el-table-column label="角色名称" min-width="180"
              ><template #default="{ row }"
                ><strong>{{ row.name }}</strong
                ><small class="role-code">{{ row.code }}</small></template
              ></el-table-column
            ><el-table-column label="角色编码" prop="code" min-width="155" /><el-table-column
              label="数据范围"
              min-width="145"
              ><template #default="{ row }">{{
                scopeLabel(row.dataScope)
              }}</template></el-table-column
            ><el-table-column label="状态" width="100"
              ><template #default="{ row }"
                ><el-tag :type="row.status === 0 ? 'success' : 'info'" effect="light">{{
                  row.status === 0 ? '启用' : '停用'
                }}</el-tag></template
              ></el-table-column
            ><el-table-column label="操作" width="260" fixed="right"
              ><template #default="{ row }"
                ><el-button
                  v-if="previewMode || checkPermi(['system:role:update'])"
                  link
                  type="primary"
                  @click="editRole(row)"
                  >编辑</el-button
                ><el-button
                  v-if="previewMode || checkPermi(['callphone:team:permissions:manage'])"
                  link
                  type="primary"
                  @click="openPermissions(row)"
                  >页面权限</el-button
                ><el-button
                  v-if="previewMode || checkPermi(['system:permission:assign-role-data-scope'])"
                  link
                  type="primary"
                  @click="openDataScope(row)"
                  >数据范围</el-button
                ><el-button
                  v-if="previewMode || checkPermi(['system:role:update'])"
                  link
                  :type="row.status === 0 ? 'danger' : 'success'"
                  @click="toggleRole(row)"
                  >{{ row.status === 0 ? '停用' : '启用' }}</el-button
                ></template
              ></el-table-column
            ><template #empty><el-empty :description="loadError || '暂无角色配置'" /></template
          ></el-table>
        </el-tab-pane>
      </el-tabs>
      <p class="privacy-note"
        >正式环境复用芋道的部门、角色与数据范围服务。页面权限由 Call Phone
        专用接口限定在本模块内更新，并保留角色已有的其他模块权限。</p
      >
    </section>
    <DeptForm v-if="!previewMode" ref="deptFormComponent" @success="loadDepartments" /><RoleForm
      v-if="!previewMode"
      ref="roleFormComponent"
      @success="loadRoles"
    /><RoleDataPermissionForm v-if="!previewMode" ref="roleScopeRef" @success="loadRoles" />
    <el-dialog
      v-model="deptDialog"
      class="teams-dialog"
      :title="deptForm.id ? '编辑部门' : '新建部门'"
      width="460px"
      ><el-form ref="deptPreviewRef" :model="deptForm" :rules="deptRules" label-position="top"
        ><el-form-item label="部门名称" prop="name"
          ><el-input v-model="deptForm.name" maxlength="40" /></el-form-item
        ><el-form-item label="上级部门"
          ><el-select v-model="deptForm.parentId" class="fill" clearable
            ><el-option label="无（顶级部门）" :value="0" /><el-option
              v-for="dept in departments.filter((item) => item.id !== deptForm.id)"
              :key="dept.id"
              :label="dept.name"
              :value="dept.id" /></el-select></el-form-item
        ><el-form-item label="负责人"
          ><el-select v-model="deptForm.leaderUserId" class="fill" clearable
            ><el-option
              v-for="user in members"
              :key="user.id"
              :label="user.nickname"
              :value="user.id" /></el-select></el-form-item
        ><el-form-item label="排序"
          ><el-input-number v-model="deptForm.sort" :min="1" :max="9999" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="deptDialog = false">取消</el-button
        ><el-button type="primary" @click="saveDept">保存</el-button></template
      ></el-dialog
    >
    <el-dialog
      v-model="roleDialog"
      class="teams-dialog"
      :title="roleForm.id ? '编辑角色' : '新建角色'"
      width="460px"
      ><el-form ref="rolePreviewRef" :model="roleForm" :rules="roleRules" label-position="top"
        ><el-form-item label="角色名称" prop="name"
          ><el-input v-model="roleForm.name" maxlength="40" /></el-form-item
        ><el-form-item label="角色编码" prop="code"
          ><el-input
            v-model="roleForm.code"
            maxlength="100"
            :disabled="Boolean(roleForm.id)" /></el-form-item
        ><el-form-item label="排序"
          ><el-input-number v-model="roleForm.sort" :min="1" :max="9999" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="roleDialog = false">取消</el-button
        ><el-button type="primary" @click="saveRole">保存</el-button></template
      ></el-dialog
    >
    <el-dialog
      v-model="permissionDialog"
      class="teams-dialog"
      title="Call Phone 页面权限"
      width="540px"
      v-loading="permissionLoading"
      ><div v-if="selectedRole" class="dialog-context"
        ><strong>{{ selectedRole.name }}</strong
        ><span>仅配置 Call Phone 菜单与操作权限，其他模块权限保持原样</span></div
      ><el-checkbox-group v-if="previewMode" v-model="permissionCodes" class="permission-grid"
        ><el-checkbox v-for="item in callphonePermissions" :key="item.code" :value="item.code">{{
          item.name
        }}</el-checkbox></el-checkbox-group
      ><div v-else class="permission-tree-scroll">
        <el-tree
          ref="permissionTreeRef"
          :data="permissionMenuTree"
          :props="defaultProps"
          node-key="id"
          show-checkbox
          default-expand-all
          class="callphone-permission-tree"
        />
      </div>
      <template #footer
        ><el-button @click="permissionDialog = false">取消</el-button
        ><el-button
          type="primary"
          :loading="permissionSaving"
          :disabled="!previewMode && permissionMenuTree.length === 0"
          @click="savePermissions"
          >保存权限</el-button
        ></template
      ></el-dialog
    >
    <el-dialog v-model="scopeDialog" class="teams-dialog" title="角色数据范围" width="460px"
      ><div v-if="selectedRole" class="dialog-context"
        ><strong>{{ selectedRole.name }}</strong
        ><span>服务端按此范围过滤客户和线索数据</span></div
      ><el-radio-group v-model="scopeForm.dataScope" class="scope-options"
        ><el-radio :value="5">仅本人</el-radio><el-radio :value="3">本部门</el-radio
        ><el-radio :value="4">本部门及下级</el-radio><el-radio :value="2">自定义部门</el-radio
        ><el-radio :value="1">全部数据</el-radio></el-radio-group
      ><el-select
        v-if="scopeForm.dataScope === 2"
        v-model="scopeForm.dataScopeDeptIds"
        multiple
        class="fill scope-depts"
        placeholder="选择允许访问的部门"
        ><el-option
          v-for="dept in departments"
          :key="dept.id"
          :label="dept.name"
          :value="dept.id" /></el-select
      ><template #footer
        ><el-button @click="scopeDialog = false">取消</el-button
        ><el-button type="primary" @click="saveScope">保存范围</el-button></template
      ></el-dialog
    >
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import { defaultProps, handleTree } from '@/utils/tree'
import { checkPermi } from '@/utils/permission'
import DeptForm from '@/views/system/dept/DeptForm.vue'
import RoleForm from '@/views/system/role/RoleForm.vue'
import RoleDataPermissionForm from '@/views/system/role/RoleDataPermissionForm.vue'
import * as DeptApi from '@/api/system/dept'
import * as TeamRoleApi from '@/api/callphone/team-role'
import * as RoleApi from '@/api/system/role'
import * as UserApi from '@/api/system/user'
import * as Preview from '@/api/callphone/team-preview'
defineOptions({ name: 'CallPhoneTeamsAndRoles' })
const route = useRoute(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const activeTab = ref('departments'),
  deptLoading = ref(false),
  roleLoading = ref(false),
  loadError = ref(''),
  departments = ref<DeptApi.DeptVO[]>([]),
  roles = ref<RoleApi.RoleVO[]>([]),
  members = ref<Array<{ id: number; nickname: string }>>([]),
  deptPreviewRef = ref<FormInstance>(),
  rolePreviewRef = ref<FormInstance>(),
  deptForm = reactive({
    id: undefined as number | undefined,
    name: '',
    parentId: 0,
    sort: 10,
    leaderUserId: 0
  }),
  roleForm = reactive({ id: undefined as number | undefined, name: '', code: '', sort: 10 }),
  deptDialog = ref(false),
  roleDialog = ref(false),
  permissionDialog = ref(false),
  permissionLoading = ref(false),
  permissionSaving = ref(false),
  scopeDialog = ref(false),
  selectedRole = ref<RoleApi.RoleVO>(),
  permissionCodes = ref<string[]>([]),
  permissionMenuTree = ref<TeamRoleApi.CallPhoneRoleMenuVO[]>([]),
  permissionTreeRef = ref(),
  scopeForm = reactive({ dataScope: 1, dataScopeDeptIds: [] as number[] }),
  deptFormComponent = ref(),
  roleFormComponent = ref(),
  roleScopeRef = ref()
const deptRules: FormRules = {
  name: [{ required: true, message: '请填写部门名称', trigger: 'blur' }]
}
const roleRules: FormRules = {
  name: [{ required: true, message: '请填写角色名称', trigger: 'blur' }],
  code: [
    {
      required: true,
      pattern: /^[a-z][a-z0-9_]{1,99}$/,
      message: '编码使用小写字母、数字和下划线',
      trigger: 'blur'
    }
  ]
}
const callphonePermissions = [
  { code: 'callphone:customer:list', name: '客户列表' },
  { code: 'callphone:customer:save', name: '客户资料编辑' },
  { code: 'callphone:call:record:query', name: '通话记录' },
  { code: 'callphone:call:dispatch:create', name: '发起外呼' },
  { code: 'callphone:lead:list', name: '线索池' },
  { code: 'callphone:lead:assign', name: '线索分配' },
  { code: 'callphone:device:pair:manage', name: '电脑与配对' },
  { code: 'callphone:ai:usage:list', name: 'AI 使用记录' }
]
function flatten(rows: DeptApi.DeptVO[]): DeptApi.DeptVO[] {
  return rows.flatMap((row) => [{ ...row, children: undefined }, ...flatten(row.children || [])])
}
async function loadDepartments() {
  deptLoading.value = true
  try {
    if (previewMode) {
      departments.value = Preview.listPreviewDepts()
      members.value = [
        { id: 101, nickname: '林静' },
        { id: 102, nickname: '王小虎' },
        { id: 103, nickname: '周宁' }
      ]
    } else {
      const [tree, users] = await Promise.all([
        DeptApi.getDeptList({}),
        UserApi.getSimpleUserList()
      ])
      departments.value = flatten(tree || [])
      members.value = (users || []).map((user) => ({ id: user.id, nickname: user.nickname }))
    }
  } catch (error: any) {
    loadError.value = error?.message || '团队列表加载失败'
    departments.value = []
  } finally {
    deptLoading.value = false
  }
}
async function loadRoles() {
  roleLoading.value = true
  try {
    roles.value = previewMode
      ? Preview.listPreviewRoles()
      : (await RoleApi.getRolePage({ pageNo: 1, pageSize: 100 })).list || []
  } catch (error: any) {
    loadError.value = error?.message || '角色列表加载失败'
    roles.value = []
  } finally {
    roleLoading.value = false
  }
}
function reload() {
  loadError.value = ''
  void loadDepartments()
  void loadRoles()
}
function createDept() {
  if (!previewMode) {
    deptFormComponent.value?.open('create')
    return
  }
  Object.assign(deptForm, {
    id: undefined,
    name: '',
    parentId: 0,
    sort: departments.value.length + 1,
    leaderUserId: 0
  })
  deptDialog.value = true
}
function editDept(row: DeptApi.DeptVO) {
  if (!previewMode) {
    deptFormComponent.value?.open('update', row.id)
    return
  }
  Object.assign(deptForm, {
    id: row.id,
    name: row.name,
    parentId: row.parentId || 0,
    sort: row.sort,
    leaderUserId: row.leaderUserId || 0
  })
  deptDialog.value = true
}
async function saveDept() {
  await deptPreviewRef.value?.validate()
  const leader = members.value.find((row) => row.id === deptForm.leaderUserId)
  Preview.savePreviewDept({ ...deptForm, leaderUserId: leader?.id || 0 })
  ElMessage.success('演示部门已保存')
  deptDialog.value = false
  await loadDepartments()
}
async function toggleDept(row: DeptApi.DeptVO) {
  const status = row.status === 0 ? 1 : 0
  try {
    await ElMessageBox.confirm(`确认${status ? '停用' : '启用'}部门“${row.name}”吗？`, '部门状态', {
      type: 'warning'
    })
    if (previewMode) Preview.setPreviewDeptStatus(row.id, status)
    else await DeptApi.updateDept({ ...row, status })
    ElMessage.success('部门状态已更新')
    await loadDepartments()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(error?.message || '部门状态更新失败')
  }
}
function createRole() {
  if (!previewMode) {
    roleFormComponent.value?.open('create')
    return
  }
  Object.assign(roleForm, { id: undefined, name: '', code: '', sort: roles.value.length + 1 })
  roleDialog.value = true
}
function editRole(row: RoleApi.RoleVO) {
  if (!previewMode) {
    roleFormComponent.value?.open('update', row.id)
    return
  }
  Object.assign(roleForm, { id: row.id, name: row.name, code: row.code, sort: row.sort })
  roleDialog.value = true
}
async function saveRole() {
  await rolePreviewRef.value?.validate()
  Preview.savePreviewRole({ ...roleForm })
  ElMessage.success('演示角色已保存')
  roleDialog.value = false
  await loadRoles()
}
async function toggleRole(row: RoleApi.RoleVO) {
  const status = row.status === 0 ? 1 : 0
  try {
    await ElMessageBox.confirm(`确认${status ? '停用' : '启用'}角色“${row.name}”吗？`, '角色状态', {
      type: 'warning'
    })
    if (previewMode) Preview.setPreviewRoleStatus(row.id, status)
    else await RoleApi.updateRole({ ...row, status })
    ElMessage.success('角色状态已更新')
    await loadRoles()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(error?.message || '角色状态更新失败')
  }
}
async function openPermissions(row: RoleApi.RoleVO) {
  selectedRole.value = row
  permissionDialog.value = true
  if (previewMode) {
    permissionCodes.value = Preview.getPreviewRolePermissions(row.id)
    return
  }
  permissionLoading.value = true
  try {
    const options = await TeamRoleApi.getRoleMenuOptions(row.id)
    if (!options.menus?.length) {
      permissionMenuTree.value = []
      throw new Error('未找到 Call Phone 菜单权限，未打开授权操作')
    }
    permissionMenuTree.value = handleTree(options.menus)
    await nextTick()
    permissionTreeRef.value?.setCheckedKeys(options.assignedMenuIds || [])
  } catch (error: any) {
    permissionDialog.value = false
    ElMessage.error(error?.message || 'Call Phone 权限读取失败')
  } finally {
    permissionLoading.value = false
  }
}
async function savePermissions() {
  if (!selectedRole.value) return
  if (previewMode) {
    Preview.setPreviewRolePermissions(selectedRole.value.id, permissionCodes.value)
    ElMessage.success('Call Phone 页面权限已保存')
    permissionDialog.value = false
    return
  }
  if (permissionMenuTree.value.length === 0) return
  permissionSaving.value = true
  try {
    const selectedIds = [
      ...(permissionTreeRef.value?.getCheckedKeys(false) || []),
      ...(permissionTreeRef.value?.getHalfCheckedKeys() || [])
    ].map(Number)
    const menuIds = [...new Set(selectedIds)]
    await TeamRoleApi.saveRoleMenuPermissions({ roleId: selectedRole.value.id, menuIds })
    ElMessage.success('Call Phone 权限已更新')
    permissionDialog.value = false
    await loadRoles()
  } catch (error: any) {
    ElMessage.error(error?.message || 'Call Phone 权限保存失败')
  } finally {
    permissionSaving.value = false
  }
}
function openDataScope(row: RoleApi.RoleVO) {
  selectedRole.value = row
  if (!previewMode) {
    roleScopeRef.value?.open(row)
    return
  }
  Object.assign(scopeForm, {
    dataScope: row.dataScope,
    dataScopeDeptIds: [...(row.dataScopeDeptIds || [])]
  })
  scopeDialog.value = true
}
async function saveScope() {
  if (!selectedRole.value) return
  if (scopeForm.dataScope === 2 && scopeForm.dataScopeDeptIds.length === 0) {
    ElMessage.warning('自定义范围至少选择一个部门')
    return
  }
  Preview.savePreviewRole({
    ...selectedRole.value,
    dataScope: scopeForm.dataScope,
    dataScopeDeptIds: scopeForm.dataScopeDeptIds
  })
  ElMessage.success('演示数据范围已保存')
  scopeDialog.value = false
  await loadRoles()
}
function deptLabel(id: number) {
  return departments.value.find((row) => row.id === id)?.name || '—'
}
function leaderLabel(id: number) {
  return members.value.find((row) => row.id === id)?.nickname || '未指定'
}
function scopeLabel(value: number) {
  return (
    (
      { 1: '全部数据', 2: '自定义部门', 3: '本部门', 4: '本部门及下级', 5: '仅本人' } as Record<
        number,
        string
      >
    )[value] || '未设置'
  )
}
onMounted(reload)
</script>

<style scoped>
.teams-page {
  --el-bg-color: #fff;
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;
  --el-fill-color-blank: #fff;
  --el-fill-color-light: #f5f7fa;

  min-height: calc(100vh - 100px);
  padding: 20px;
  color: #293347;
  background: #f5f7fb;
  color-scheme: light;
}

.teams-page :deep(.el-table),
.teams-page :deep(.el-tabs__content),
.teams-page :deep(.el-table tr),
.teams-page :deep(.el-table th.el-table__cell) {
  color: #303133;
  background-color: #fff;
}

.teams-page :deep(.el-table tr:hover > td.el-table__cell) {
  background-color: #f5f7fa;
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
  margin-bottom: 14px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: #253149;
}

.page-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7a8598;
}

.team-tabs {
  margin-top: 4px;
}

.tab-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0 18px;
}

.tab-heading strong,
.tab-heading small {
  display: block;
}

.tab-heading strong {
  font-size: 15px;
  color: #29364c;
}

.tab-heading small {
  margin-top: 5px;
  font-size: 12px;
  color: #8792a5;
}

.dept-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dept-icon {
  display: grid;
  width: 32px;
  height: 32px;
  color: #355bd3;
  background: #eef3ff;
  border-radius: 8px;
  place-items: center;
}

.role-code {
  display: block;
  margin-top: 4px;
  font-family: monospace;
  font-size: 11px;
  color: #929cad;
}

.privacy-note {
  margin: 18px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8490a1;
}

.fill {
  width: 100%;
}

.dialog-context {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 16px;
}

.dialog-context span {
  font-size: 12px;
  color: #8490a1;
}

.permission-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.scope-options {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.scope-depts {
  margin-top: 16px;
}

.permission-tree-scroll {
  max-height: 440px;
  padding: 8px 12px;
  overflow: auto;
  background: #fff;
  border: 1px solid #e5e9f0;
  border-radius: 6px;
}

@media (width <= 720px) {
  .teams-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .tab-heading {
    align-items: flex-start;
    gap: 12px;
  }

  .permission-grid {
    grid-template-columns: 1fr;
  }
}
</style>
<style>
.el-dialog.teams-dialog {
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;

  color: #303133;
  background: #fff;
  color-scheme: light;
}

.el-dialog.teams-dialog .el-dialog__title,
.el-dialog.teams-dialog .el-form-item__label,
.el-dialog.teams-dialog .el-checkbox__label,
.el-dialog.teams-dialog .el-radio__label {
  color: #303133;
}
</style>
