<template>
  <div class="permissions-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="这里的调整保存在当前浏览器。正式保存会调用芋道角色数据范围接口；各业务查询仍须由服务端应用范围过滤。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading">
        <div
          ><h1>数据权限</h1
          ><p>按角色设置客户、线索和通话数据的可见范围；范围控制由服务端执行。</p></div
        >
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </header>
      <div class="scope-summary">
        <article
          ><span>角色总数</span><strong>{{ roles.length }}</strong
          ><small>使用 Yudao 系统角色</small></article
        >
        <article
          ><span>自定义部门范围</span><strong>{{ customScopeCount }}</strong
          ><small>仅可访问选定部门</small></article
        >
        <article class="risk-card"
          ><span>全量数据角色</span><strong>{{ allScopeCount }}</strong
          ><small>建议定期复核授权</small></article
        >
      </div>
      <div class="filter-row">
        <el-input
          v-model="keyword"
          clearable
          class="search"
          placeholder="搜索角色名称或编码"
          :prefix-icon="Search"
        />
        <el-select v-model="scopeFilter" clearable placeholder="全部数据范围" class="scope-filter">
          <el-option
            v-for="option in scopeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>
      <el-table v-loading="loading" :data="filteredRoles" row-key="id" class="permission-table">
        <el-table-column label="角色" min-width="210"
          ><template #default="{ row }"
            ><div class="role-cell"
              ><span class="role-avatar"><Icon icon="ep:avatar" /></span
              ><div
                ><strong>{{ row.name }}</strong
                ><small>{{ row.code }}</small></div
              ></div
            ></template
          ></el-table-column
        >
        <el-table-column label="受范围控制的数据" min-width="220"
          ><template #default
            ><div class="data-tags"
              ><el-tag effect="light">客户</el-tag><el-tag effect="light">线索</el-tag
              ><el-tag effect="light">通话记录</el-tag></div
            ></template
          ></el-table-column
        >
        <el-table-column label="数据范围" min-width="160"
          ><template #default="{ row }"
            ><el-tag :type="scopeTagType(row.dataScope)" effect="light">{{
              scopeLabel(row.dataScope)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="授权部门" min-width="220"
          ><template #default="{ row }"
            ><span v-if="row.dataScope === 2">{{
              selectedDepartments(row).join('、') || '未选择部门'
            }}</span
            ><span v-else class="muted">{{ scopeDescription(row.dataScope) }}</span></template
          ></el-table-column
        >
        <el-table-column label="角色状态" width="110"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 0 ? 'success' : 'info'" effect="light">{{
              row.status === 0 ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="操作" width="135" fixed="right"
          ><template #default="{ row }"
            ><el-button
              v-if="previewMode || canAssignScope"
              link
              type="primary"
              @click="editScope(row)"
              >设置范围</el-button
            ></template
          ></el-table-column
        >
        <template #empty><el-empty :description="loadError || '暂无角色数据'" /></template>
      </el-table>
      <footer class="page-note"
        ><Icon icon="ep:lock" /><span
          >授权遵循服务端角色权限。停用的角色无法登录使用；本页不展示或保存个人客户敏感字段权限。</span
        ></footer
      >
    </section>
    <RoleDataPermissionForm
      v-if="!previewMode"
      ref="scopeFormComponent"
      class="callphone-scope-form"
      @success="load"
    />
    <el-dialog
      v-model="dialogVisible"
      class="data-scope-dialog"
      title="设置角色数据范围"
      width="500px"
    >
      <div v-if="selectedRole" class="dialog-role"
        ><span class="role-avatar"><Icon icon="ep:avatar" /></span
        ><div
          ><strong>{{ selectedRole.name }}</strong
          ><small>{{ selectedRole.code }}</small></div
        ></div
      >
      <el-alert
        class="scope-warning"
        title="修改后，该角色在客户、线索和通话记录中的数据可见范围都会变化。"
        type="info"
        :closable="false"
      />
      <el-form label-position="top" class="scope-form">
        <el-form-item label="数据范围"
          ><el-select v-model="scopeForm.dataScope" class="fill"
            ><el-option
              v-for="option in scopeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value" /></el-select
        ></el-form-item>
        <el-form-item v-if="scopeForm.dataScope === 2" label="允许访问的部门"
          ><el-select
            v-model="scopeForm.dataScopeDeptIds"
            class="fill"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择部门"
            ><el-option
              v-for="dept in departments"
              :key="dept.id"
              :label="dept.name"
              :value="dept.id" /></el-select
        ></el-form-item>
        <div v-else class="scope-description"
          ><Icon icon="ep:info-filled" />{{ scopeDescription(scopeForm.dataScope) }}</div
        >
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button
          type="primary"
          :disabled="scopeForm.dataScope === 2 && scopeForm.dataScopeDeptIds.length === 0"
          @click="saveScope"
          >保存设置</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import { checkPermi } from '@/utils/permission'
import * as RoleApi from '@/api/system/role'
import * as DeptApi from '@/api/system/dept'
import * as Preview from '@/api/callphone/team-preview'
import RoleDataPermissionForm from '@/views/system/role/RoleDataPermissionForm.vue'

defineOptions({ name: 'CallPhoneDataPermissions' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false)
const loadError = ref('')
const roles = ref<RoleApi.RoleVO[]>([])
const departments = ref<DeptApi.DeptVO[]>([])
const keyword = ref('')
const scopeFilter = ref<number>()
const scopeFormComponent = ref<{ open: (role: RoleApi.RoleVO) => void }>()
const dialogVisible = ref(false)
const selectedRole = ref<RoleApi.RoleVO>()
const scopeForm = reactive({ dataScope: 1, dataScopeDeptIds: [] as number[] })
const scopeOptions = [
  { value: 5, label: '仅本人' },
  { value: 3, label: '本部门' },
  { value: 4, label: '本部门及下级' },
  { value: 2, label: '自定义部门' },
  { value: 1, label: '全部数据' }
]
const canAssignScope = checkPermi(['system:permission:assign-role-data-scope'])
const filteredRoles = computed(() =>
  roles.value.filter(
    (role) =>
      (!keyword.value ||
        `${role.name} ${role.code}`.toLowerCase().includes(keyword.value.toLowerCase())) &&
      (scopeFilter.value === undefined || role.dataScope === scopeFilter.value)
  )
)
const customScopeCount = computed(() => roles.value.filter((role) => role.dataScope === 2).length)
const allScopeCount = computed(() => roles.value.filter((role) => role.dataScope === 1).length)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    if (previewMode) {
      roles.value = Preview.listPreviewRoles()
      departments.value = Preview.listPreviewDepts()
    } else {
      const [rolePage, deptTree] = await Promise.all([
        RoleApi.getRolePage({ pageNo: 1, pageSize: 100 }),
        DeptApi.getSimpleDeptList()
      ])
      roles.value = rolePage.list || []
      departments.value = deptTree || []
    }
  } catch (error: any) {
    loadError.value = error?.message || '数据权限加载失败，请检查账号权限后重试'
    roles.value = []
    departments.value = []
  } finally {
    loading.value = false
  }
}
function editScope(role: RoleApi.RoleVO) {
  selectedRole.value = role
  if (!previewMode) {
    scopeFormComponent.value?.open(role)
    return
  }
  Object.assign(scopeForm, {
    dataScope: role.dataScope,
    dataScopeDeptIds: [...(role.dataScopeDeptIds || [])]
  })
  dialogVisible.value = true
}
async function saveScope() {
  if (!selectedRole.value) return
  Preview.savePreviewRole({
    ...selectedRole.value,
    dataScope: scopeForm.dataScope,
    dataScopeDeptIds: scopeForm.dataScope === 2 ? scopeForm.dataScopeDeptIds : []
  })
  ElMessage.success('本地预览数据范围已保存')
  dialogVisible.value = false
  await load()
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
function scopeTagType(value: number) {
  return value === 1 ? 'danger' : value === 2 ? 'warning' : 'primary'
}
function scopeDescription(value: number) {
  return (
    (
      {
        1: '成员可查看工作区内全部数据，请谨慎授权。',
        3: '成员可查看本部门的数据。',
        4: '成员可查看本部门及下级部门的数据。',
        5: '成员只可查看自己负责的数据。'
      } as Record<number, string>
    )[value] || '选择一个或多个部门限制数据访问范围。'
  )
}
function selectedDepartments(role: RoleApi.RoleVO) {
  return departments.value
    .filter((dept) => role.dataScopeDeptIds?.includes(dept.id))
    .map((dept) => dept.name)
}
onMounted(load)
</script>

<style scoped>
.permissions-page {
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
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
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

.scope-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.scope-summary article {
  padding: 15px 18px;
  background: #fff;
  border: 1px solid #e8ecf3;
  border-radius: 9px;
}

.scope-summary article span,
.scope-summary article small {
  display: block;
  font-size: 12px;
  color: #8490a1;
}

.scope-summary article strong {
  display: block;
  margin: 7px 0 3px;
  font-size: 24px;
  color: #253149;
}

.scope-summary .risk-card strong {
  color: #d97706;
}

.filter-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.search {
  width: 280px;
}

.scope-filter {
  width: 190px;
}

.role-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.role-cell strong,
.role-cell small,
.dialog-role strong,
.dialog-role small {
  display: block;
}

.role-cell small,
.dialog-role small {
  margin-top: 4px;
  font-size: 11px;
  color: #929cad;
}

.role-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  color: #355bd3;
  background: #eef3ff;
  border-radius: 9px;
  place-items: center;
}

.data-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.page-panel :deep(.el-table),
.page-panel :deep(.el-table tr),
.page-panel :deep(.el-table th.el-table__cell) {
  color: #303133;
  background: #fff;
}

.page-panel :deep(.el-table tr:hover > td.el-table__cell) {
  background: #f5f7fa;
}

.muted {
  color: #929cad;
}

.page-note {
  display: flex;
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.6;
  color: #8490a1;
  align-items: flex-start;
  gap: 7px;
}

.page-note :deep(svg) {
  flex: none;
  margin-top: 2px;
  color: #6b84cb;
}

.dialog-role {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}

.scope-warning {
  margin-bottom: 18px;
}

.scope-form {
  margin-top: 3px;
}

.fill {
  width: 100%;
}

.scope-description {
  display: flex;
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #68758a;
  background: #f5f7fb;
  border-radius: 7px;
  align-items: flex-start;
  gap: 8px;
}

.scope-description :deep(svg) {
  flex: none;
  margin-top: 2px;
  color: #5071c8;
}

@media (width <= 760px) {
  .permissions-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .scope-summary {
    grid-template-columns: 1fr;
  }

  .filter-row {
    flex-direction: column;
  }

  .search,
  .scope-filter {
    width: 100%;
  }

  .page-heading {
    align-items: flex-start;
    gap: 10px;
  }
}
</style>
<style>
.el-dialog.data-scope-dialog,
.el-dialog.callphone-scope-form {
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;

  color: #303133;
  background: #fff;
  color-scheme: light;
}

.el-dialog.data-scope-dialog .el-dialog__title,
.el-dialog.callphone-scope-form .el-dialog__title,
.el-dialog.callphone-scope-form .el-form-item__label {
  color: #303133;
}
</style>
