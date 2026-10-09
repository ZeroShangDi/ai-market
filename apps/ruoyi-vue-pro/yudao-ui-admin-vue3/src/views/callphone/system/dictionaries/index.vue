<template>
  <div class="dictionary-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="本地新增字典项保存在浏览器；正式模式通过 Call Phone 接口管理 callphone_ 字典。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading"
        ><div
          ><h1>业务字典</h1
          ><p
            >管理通话结果、线索来源和归档原因等业务选项；被业务记录引用后应停用而不是删除。</p
          ></div
        ><el-button v-if="canManage" type="primary" @click="openType"
          ><Icon icon="ep:plus" />新增业务字典</el-button
        ></header
      >
      <div class="dictionary-toolbar"
        ><el-select v-model="selectedType" filterable placeholder="选择业务字典" @change="loadItems"
          ><el-option
            v-for="item in types"
            :key="item.type"
            :label="item.name"
            :value="item.type" /></el-select
        ><el-button
          v-if="canManage"
          type="primary"
          plain
          :disabled="!selectedType"
          @click="openItem"
          ><Icon icon="ep:plus" />新增选项</el-button
        ></div
      >
      <el-table v-loading="loading" :data="items" row-key="id">
        <el-table-column label="显示名称" prop="label" min-width="180" /><el-table-column
          label="字典键值"
          prop="value"
          min-width="180"
        /><el-table-column label="排序" prop="sort" width="90" /><el-table-column
          label="颜色提示"
          width="120"
          ><template #default="{ row }"
            ><el-tag v-if="row.colorType" :type="tagType(row.colorType)" effect="light">{{
              row.colorType
            }}</el-tag
            ><span v-else>—</span></template
          ></el-table-column
        ><el-table-column label="状态" width="100"
          ><template #default="{ row }"
            ><el-tag :type="Number(row.status) === 0 ? 'success' : 'info'">{{
              Number(row.status) === 0 ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        ><el-table-column
          label="说明"
          min-width="180"
          prop="remark"
          show-overflow-tooltip
        /><el-table-column label="操作" width="150" fixed="right"
          ><template #default="{ row }"
            ><el-button v-if="canManage" link type="primary" @click="openItem(row)">编辑</el-button
            ><el-button
              v-if="canManage && Number(row.status) === 0"
              link
              type="warning"
              @click="toggleItem(row, 1)"
              >停用</el-button
            ><el-button v-else-if="canManage" link type="success" @click="toggleItem(row, 0)"
              >启用</el-button
            ></template
          ></el-table-column
        >
        <template #empty
          ><el-empty
            :description="
              loadError || (selectedType ? '该业务字典暂无选项' : '先选择或创建一个业务字典')
            "
        /></template>
      </el-table>
    </section>
    <el-dialog v-model="typeDialog" title="新增业务字典" width="480px"
      ><el-form ref="typeFormRef" :model="typeForm" :rules="typeRules" label-position="top"
        ><el-form-item label="字典名称" prop="name"
          ><el-input
            v-model="typeForm.name"
            maxlength="40"
            placeholder="例如：跟进结果" /></el-form-item
        ><el-form-item label="字典编码" prop="type"
          ><el-input
            v-model="typeForm.type"
            maxlength="100"
            placeholder="callphone_follow_up_result" /></el-form-item
        ><el-form-item label="备注"
          ><el-input v-model="typeForm.remark" maxlength="200" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="typeDialog = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveType"
          >保存字典</el-button
        ></template
      ></el-dialog
    >
    <el-dialog
      v-model="itemDialog"
      :title="itemForm.id ? '编辑字典选项' : '新增字典选项'"
      width="480px"
      ><el-form ref="itemFormRef" :model="itemForm" :rules="itemRules" label-position="top"
        ><el-form-item label="显示名称" prop="label"
          ><el-input v-model="itemForm.label" maxlength="100" /></el-form-item
        ><el-form-item label="字典键值" prop="value"
          ><el-input
            v-model="itemForm.value"
            maxlength="100"
            :disabled="Boolean(itemForm.id)" /></el-form-item
        ><el-form-item label="排序"
          ><el-input-number v-model="itemForm.sort" :min="0" :max="9999" /></el-form-item
        ><el-form-item label="颜色提示"
          ><el-select v-model="itemForm.colorType" clearable
            ><el-option label="成功" value="success" /><el-option
              label="警示"
              value="warning" /><el-option label="危险" value="danger" /><el-option
              label="信息"
              value="info" /></el-select></el-form-item
        ><el-form-item label="备注"
          ><el-input v-model="itemForm.remark" maxlength="200" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="itemDialog = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveItem"
          >保存选项</el-button
        ></template
      ></el-dialog
    >
  </div>
</template>

<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import { hasPermission } from '@/directives/permission/hasPermi'
import * as DictionaryApi from '@/api/callphone/dictionary'
import * as PreviewStore from '@/api/callphone/preview-store'
defineOptions({ name: 'CallPhoneBusinessDictionaries' })
const route = useRoute(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const canManage = computed(() => previewMode || hasPermission(['callphone:dictionary:manage']))
const types = ref<any[]>([]),
  items = ref<any[]>([]),
  selectedType = ref(''),
  loading = ref(false),
  saving = ref(false),
  loadError = ref(''),
  typeDialog = ref(false),
  itemDialog = ref(false),
  typeFormRef = ref<FormInstance>(),
  itemFormRef = ref<FormInstance>()
const typeForm = reactive({ name: '', type: 'callphone_', status: 0, remark: '' }),
  itemForm = reactive({
    id: undefined as number | undefined,
    dictType: '',
    label: '',
    value: '',
    sort: 10,
    status: 0,
    colorType: '',
    cssClass: '',
    remark: ''
  })
const typeRules: FormRules = {
  name: [{ required: true, message: '请填写字典名称', trigger: 'blur' }],
  type: [
    { required: true, message: '请填写字典编码', trigger: 'blur' },
    {
      pattern: /^callphone_[a-z0-9_]+$/,
      message: '编码需以 callphone_ 开头，仅使用小写字母、数字和下划线',
      trigger: 'blur'
    }
  ]
}
const itemRules: FormRules = {
  label: [{ required: true, message: '请填写显示名称', trigger: 'blur' }],
  value: [{ required: true, message: '请填写字典键值', trigger: 'blur' }]
}
async function loadTypes() {
  try {
    const rows = previewMode
      ? PreviewStore.previewDictionaryTypes()
      : await DictionaryApi.getTypes()
    types.value = rows || []
    if (!selectedType.value && types.value.length) selectedType.value = types.value[0].type
    await loadItems()
  } catch (e: any) {
    types.value = []
    loadError.value = e?.message || '业务字典加载失败'
  }
}
async function loadItems() {
  if (!selectedType.value) {
    items.value = []
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    if (previewMode) items.value = PreviewStore.previewDictionaryItems(selectedType.value)
    else {
      const params: any = { pageNo: 1, pageSize: 100, dictType: selectedType.value }
      const page = await DictionaryApi.getDataPage(params)
      items.value = page.list || []
    }
  } catch (e: any) {
    items.value = []
    loadError.value = e?.message || '字典选项加载失败'
  } finally {
    loading.value = false
  }
}
function openType() {
  Object.assign(typeForm, { name: '', type: 'callphone_', status: 0, remark: '' })
  typeDialog.value = true
}
async function saveType() {
  await typeFormRef.value?.validate()
  saving.value = true
  try {
    if (previewMode) PreviewStore.savePreviewDictionaryType({ ...typeForm })
    else await DictionaryApi.createType({ ...typeForm })
    ElMessage.success('业务字典已创建')
    typeDialog.value = false
    await loadTypes()
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败')
  } finally {
    saving.value = false
  }
}
function openItem(row?: any) {
  Object.assign(
    itemForm,
    row
      ? { ...row, dictType: selectedType.value }
      : {
          id: undefined,
          dictType: selectedType.value,
          label: '',
          value: '',
          sort: 10,
          status: 0,
          colorType: '',
          cssClass: '',
          remark: ''
        }
  )
  itemDialog.value = true
}
async function saveItem() {
  await itemFormRef.value?.validate()
  saving.value = true
  try {
    if (previewMode) PreviewStore.savePreviewDictionaryItem({ ...itemForm })
    else if (itemForm.id) await DictionaryApi.updateData({ ...itemForm })
    else await DictionaryApi.createData({ ...itemForm })
    ElMessage.success('字典选项已保存')
    itemDialog.value = false
    await loadItems()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
async function toggleItem(row: any, status: number) {
  try {
    if (previewMode) PreviewStore.savePreviewDictionaryItem({ ...row, status })
    else await DictionaryApi.updateData({ ...row, status })
    ElMessage.success(status === 0 ? '字典选项已启用' : '字典选项已停用')
    await loadItems()
  } catch (e: any) {
    ElMessage.error(e?.message || '状态更新失败')
  }
}
function tagType(v: string): 'success' | 'warning' | 'danger' | 'info' {
  return (['success', 'warning', 'danger', 'info'] as string[]).includes(v)
    ? (v as 'success' | 'warning' | 'danger' | 'info')
    : 'info'
}
onMounted(loadTypes)
</script>

<style scoped>
.dictionary-page {
  padding: 20px;
}

.preview-banner {
  margin-bottom: 14px;
}

.page-panel {
  padding: 24px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
}

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
}

.page-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.dictionary-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}

.dictionary-toolbar .el-select {
  width: 320px;
}
</style>
