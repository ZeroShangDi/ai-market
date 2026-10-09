<template>
  <div class="fields-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="字段定义和样例客户字段值保存在此浏览器；正式模式使用 Call Phone 接口并在服务端加密保存字段值。"
      type="warning"
      :closable="false"
    />
    <el-alert
      v-if="rolesError"
      class="preview-banner"
      title="角色范围未加载"
      :description="rolesError"
      type="error"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading"
        ><div><h1>客户字段</h1><p>配置客户资料中的扩展字段、选项、必填和列表展示方式。</p></div
        ><el-button type="primary" @click="createField"
          ><Icon icon="ep:plus" />新建字段</el-button
        ></header
      >
      <div class="field-summary"
        ><div
          ><span>字段总数</span><strong>{{ fields.length }}</strong></div
        ><div
          ><span>已启用</span><strong>{{ enabledCount }}</strong></div
        ><div
          ><span>列表展示</span><strong>{{ listVisibleCount }}</strong></div
        ><el-input
          v-model="keyword"
          clearable
          class="field-search"
          placeholder="搜索字段名称或标识"
          :prefix-icon="Search"
      /></div>
      <el-table v-loading="loading" :data="filteredFields" row-key="fieldKey" class="fields-table">
        <el-table-column label="字段名称" min-width="200"
          ><template #default="{ row }"
            ><div class="field-name"
              ><span class="field-icon"><Icon :icon="typeIcon(row.valueType)" /></span
              ><div
                ><strong>{{ row.label }}</strong
                ><small>{{ row.fieldKey }}</small></div
              ></div
            ></template
          ></el-table-column
        >
        <el-table-column label="字段类型" width="140"
          ><template #default="{ row }">{{ typeLabel(row.valueType) }}</template></el-table-column
        >
        <el-table-column label="选项" min-width="210"
          ><template #default="{ row }"
            ><div v-if="row.options.length" class="option-list"
              ><el-tag
                v-for="option in row.options.slice(0, 3)"
                :key="option"
                effect="plain"
                size="small"
                >{{ option }}</el-tag
              ><span v-if="row.options.length > 3" class="muted"
                >+{{ row.options.length - 3 }}</span
              ></div
            ><span v-else class="muted">—</span></template
          ></el-table-column
        >
        <el-table-column label="必填" width="90"
          ><template #default="{ row }"
            ><el-tag :type="row.required ? 'warning' : 'info'" effect="light">{{
              row.required ? '是' : '否'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="列表展示" width="110"
          ><template #default="{ row }"
            ><el-tag :type="row.listVisible ? 'success' : 'info'" effect="light">{{
              row.listVisible ? '展示' : '隐藏'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="状态" width="100"
          ><template #default="{ row }"
            ><el-tag :type="row.enabled ? 'success' : 'info'" effect="light">{{
              row.enabled ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="排序" prop="sort" width="90" />
        <el-table-column label="操作" width="150" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="editField(row)">编辑</el-button
            ><el-button link :type="row.enabled ? 'danger' : 'success'" @click="toggleField(row)">{{
              row.enabled ? '停用' : '启用'
            }}</el-button></template
          ></el-table-column
        >
        <template #empty><el-empty :description="loadError || '还没有自定义字段'" /></template>
      </el-table>
      <div class="field-guidance"
        ><Icon icon="ep:info-filled" /><div
          ><strong>先定义字段，再接入客户表单</strong
          ><p
            >当前页面维护字段元数据。字段值保存到独立 Call Phone
            客户数据中，并对敏感值加密；列表只返回被授权且配置为展示的字段。</p
          ></div
        ></div
      >
    </section>
    <el-dialog
      v-model="dialogVisible"
      class="customer-field-dialog"
      :title="form.id ? '编辑客户字段' : '新建客户字段'"
      width="560px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="field-form">
        <el-form-item label="字段名称" prop="label"
          ><el-input v-model="form.label" maxlength="64" placeholder="例如：所属行业"
        /></el-form-item>
        <el-form-item label="字段标识" prop="fieldKey"
          ><el-input
            v-model="form.fieldKey"
            maxlength="64"
            :disabled="Boolean(form.id)"
            placeholder="例如：industry"
          /><small class="form-hint"
            >仅使用小写字母、数字和下划线，保存后不可修改。</small
          ></el-form-item
        >
        <div class="form-grid"
          ><el-form-item label="字段类型" prop="valueType"
            ><el-select v-model="form.valueType" class="fill" :disabled="Boolean(form.id)"
              ><el-option
                v-for="type in fieldTypes"
                :key="type.value"
                :label="type.label"
                :value="type.value" /></el-select></el-form-item
          ><el-form-item label="排序"
            ><el-input-number v-model="form.sort" :min="1" :max="9999" /></el-form-item
        ></div>
        <small v-if="form.id" class="form-hint"
          >字段类型创建后不可修改，避免已保存的客户数据与字段定义不一致；已有枚举选项也不可删除。</small
        >
        <el-form-item v-if="isOptionType" label="选项值" prop="options"
          ><el-select
            v-model="form.options"
            class="fill"
            multiple
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="输入选项后按回车"
            ><el-option
              v-for="item in form.options"
              :key="item"
              :label="item"
              :value="item" /></el-select
          ><small class="form-hint"
            >选项会按当前顺序展示；已有选项不可删除，如需停止使用请停用整个字段以保留历史值。</small
          ></el-form-item
        >
        <el-form-item label="可见角色"
          ><el-select
            v-model="form.visibleRoleCodes"
            class="fill"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="不选则继承客户权限"
            ><el-option
              v-for="role in roles"
              :key="role.code"
              :label="role.name"
              :value="role.code" /></el-select
          ><small class="form-hint"
            >指定角色可读取和修改该字段；不选时，所有拥有客户资料权限的成员可用。</small
          ></el-form-item
        >
        <div class="switch-row"
          ><el-form-item label="必填"><el-switch v-model="form.required" /></el-form-item
          ><el-form-item label="在客户列表展示"
            ><el-switch v-model="form.listVisible" /></el-form-item
          ><el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item
        ></div>
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveField"
          >保存字段</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Icon } from '@iconify/vue'
import { Search } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import * as Api from '@/api/callphone/customer-field'
import * as Preview from '@/api/callphone/customer-field/preview'
import * as TeamPreview from '@/api/callphone/team-preview'
import * as RoleApi from '@/api/system/role'

defineOptions({ name: 'CallPhoneCustomerFields' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const fieldTypes: Array<{ value: Api.CustomerFieldType; label: string }> = [
  { value: 'text', label: '单行文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '单选' },
  { value: 'multi_select', label: '多选' },
  { value: 'boolean', label: '是/否' }
]
const fields = ref<Api.CustomerFieldVO[]>([])
const roles = ref<Array<{ id: number; name: string; code: string }>>([])
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const rolesError = ref('')
const keyword = ref('')
const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const form = reactive<Api.CustomerFieldVO>({
  fieldKey: '',
  label: '',
  valueType: 'text',
  required: false,
  options: [],
  visibleRoleCodes: [],
  enabled: true,
  listVisible: false,
  sort: 100
})
const isOptionType = computed(
  () => form.valueType === 'select' || form.valueType === 'multi_select'
)
const enabledCount = computed(() => fields.value.filter((field) => field.enabled).length)
const listVisibleCount = computed(
  () => fields.value.filter((field) => field.enabled && field.listVisible).length
)
const filteredFields = computed(() =>
  fields.value.filter(
    (field) =>
      !keyword.value ||
      `${field.label} ${field.fieldKey}`.toLowerCase().includes(keyword.value.toLowerCase())
  )
)
const rules: FormRules = {
  label: [{ required: true, message: '请填写字段名称', trigger: 'blur' }],
  fieldKey: [
    {
      required: true,
      pattern: /^[a-z][a-z0-9_]{1,63}$/,
      message: '使用小写字母开头的英文标识',
      trigger: 'blur'
    }
  ],
  valueType: [{ required: true, message: '请选择字段类型', trigger: 'change' }]
}

async function load() {
  loading.value = true
  loadError.value = ''
  rolesError.value = ''
  try {
    if (previewMode) {
      fields.value = Preview.listPreviewCustomerFields().map((field) => ({
        ...field,
        visibleRoleCodes: field.visibleRoleCodes || []
      }))
      roles.value = TeamPreview.listPreviewRoles().map((role) => ({
        id: role.id,
        name: role.name,
        code: role.code
      }))
    } else {
      const rows = await Api.getCustomerFields()
      fields.value = rows.map((row) => ({
        ...row,
        options: parseOptions(row.optionsJson),
        visibleRoleCodes: row.visibleRoleCodes || []
      }))
      try {
        roles.value = await RoleApi.getSimpleRoleList()
        rolesError.value = ''
      } catch (roleError: any) {
        roles.value = []
        rolesError.value =
          roleError?.message || '没有读取角色列表权限，暂时不能安全配置字段可见范围'
      }
    }
  } catch (error: any) {
    fields.value = []
    loadError.value = error?.message || '字段配置读取失败'
  } finally {
    loading.value = false
  }
}
function createField() {
  resetForm()
  Object.assign(form, { sort: (Math.max(0, ...fields.value.map((field) => field.sort)) || 0) + 10 })
  dialogVisible.value = true
}
function editField(row: Api.CustomerFieldVO) {
  Object.assign(form, { ...row, options: [...row.options] })
  dialogVisible.value = true
}
async function saveField() {
  if (!previewMode && rolesError.value) {
    ElMessage.error('角色列表尚未加载，不能保存字段权限配置')
    return
  }
  await formRef.value?.validate()
  if (isOptionType.value && !form.options.length) {
    ElMessage.warning('至少添加一个可选项')
    return
  }
  if (!isOptionType.value) form.options = []
  saving.value = true
  try {
    if (previewMode) Preview.savePreviewCustomerField({ ...form, options: [...form.options] })
    else {
      const id = await Api.saveCustomerField({
        id: form.id,
        fieldKey: form.fieldKey.trim(),
        label: form.label.trim(),
        valueType: form.valueType,
        required: form.required,
        optionsJson: isOptionType.value ? JSON.stringify(form.options) : undefined,
        visibleRoleCodes: form.visibleRoleCodes,
        enabled: form.enabled,
        listVisible: form.listVisible,
        sort: form.sort
      })
      if (!id) throw new Error('字段未保存，请刷新后重试')
    }
    ElMessage.success(previewMode ? '预览字段已保存' : '字段配置已保存')
    dialogVisible.value = false
    await load()
  } catch (error: any) {
    ElMessage.error(error?.message || '字段保存失败')
  } finally {
    saving.value = false
  }
}
async function toggleField(row: Api.CustomerFieldVO) {
  const enabled = !row.enabled
  try {
    await ElMessageBox.confirm(
      `确认${enabled ? '启用' : '停用'}“${row.label}”字段吗？停用不会删除历史值。`,
      '字段状态',
      { type: 'warning' }
    )
    if (previewMode) Preview.setPreviewCustomerFieldStatus(row.id!, enabled)
    else if (!(await Api.updateCustomerFieldStatus(row.id!, enabled)))
      throw new Error('字段状态未更新，请刷新后重试')
    ElMessage.success('字段状态已更新')
    await load()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(error?.message || '字段状态更新失败')
  }
}
function resetForm() {
  Object.assign(form, {
    id: undefined,
    fieldKey: '',
    label: '',
    valueType: 'text',
    required: false,
    options: [],
    visibleRoleCodes: [],
    enabled: true,
    listVisible: false,
    sort: 100
  })
  formRef.value?.clearValidate()
}
function parseOptions(value?: string) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}
function typeLabel(value: Api.CustomerFieldType) {
  return fieldTypes.find((item) => item.value === value)?.label || '文本'
}
function typeIcon(value: Api.CustomerFieldType) {
  return (
    {
      text: 'ep:edit',
      number: 'ep:coin',
      date: 'ep:calendar',
      select: 'ep:arrow-down',
      multi_select: 'ep:finished',
      boolean: 'ep:circle-check'
    } as Record<Api.CustomerFieldType, string>
  )[value]
}
onMounted(load)
</script>

<style scoped>
.fields-page {
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
  margin-bottom: 18px;
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

.field-summary {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 10px 0 18px;
}

.field-summary > div span,
.field-summary > div strong {
  display: block;
}

.field-summary > div span {
  font-size: 12px;
  color: #8792a5;
}

.field-summary > div strong {
  margin-top: 4px;
  font-size: 20px;
  color: #253149;
}

.field-search {
  width: 260px;
  margin-left: auto;
}

.field-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.field-name strong,
.field-name small {
  display: block;
}

.field-name small {
  margin-top: 4px;
  font-family: monospace;
  font-size: 11px;
  color: #929cad;
}

.field-icon {
  display: grid;
  width: 34px;
  height: 34px;
  color: #355bd3;
  background: #eef3ff;
  border-radius: 8px;
  place-items: center;
}

.option-list {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.muted {
  color: #929cad;
}

.field-guidance {
  display: flex;
  padding: 14px;
  margin-top: 18px;
  color: #66748a;
  background: #f3f6fc;
  border-radius: 8px;
  gap: 10px;
}

.field-guidance > :deep(svg) {
  flex: none;
  margin-top: 2px;
  color: #5271c3;
}

.field-guidance strong {
  font-size: 13px;
  color: #35435a;
}

.field-guidance p {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.field-form {
  padding: 4px 4px 0;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.fill {
  width: 100%;
}

.form-hint {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.5;
  color: #8490a1;
}

.switch-row {
  display: flex;
  gap: 34px;
  align-items: flex-start;
}

.switch-row :deep(.el-form-item) {
  margin-bottom: 8px;
}

.fields-page :deep(.el-table),
.fields-page :deep(.el-table tr),
.fields-page :deep(.el-table th.el-table__cell) {
  color: #303133;
  background: #fff;
}

.fields-page :deep(.el-table tr:hover > td.el-table__cell) {
  background: #f5f7fa;
}

@media (width <= 760px) {
  .fields-page {
    padding: 8px;
  }

  .page-panel {
    padding: 16px 12px;
  }

  .page-heading {
    gap: 12px;
  }

  .field-summary {
    flex-wrap: wrap;
    gap: 16px;
  }

  .field-search {
    width: 100%;
    margin-left: 0;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .switch-row {
    gap: 18px;
    flex-wrap: wrap;
  }
}
</style>
<style>
.el-dialog.customer-field-dialog {
  --el-bg-color-overlay: #fff;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-border-color: #dcdfe6;

  color: #303133;
  background: #fff;
  color-scheme: light;
}

.el-dialog.customer-field-dialog .el-dialog__title,
.el-dialog.customer-field-dialog .el-form-item__label {
  color: #303133;
}
</style>
