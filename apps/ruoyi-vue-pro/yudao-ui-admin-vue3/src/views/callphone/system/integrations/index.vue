<template>
  <div class="integration-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      type="warning"
      :closable="false"
      title="本地预览模式"
      description="演示配置只保存在当前浏览器。凭据使用虚构值，不会连接外部服务。"
    />
    <section class="page-intro">
      <div><h1>扩展服务配置</h1><p>管理企业微信、AI 核心服务和私有文件存储的连接凭据。</p></div>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新状态</el-button>
    </section>
    <el-alert class="security-note" type="info" :closable="false" show-icon>
      凭据只在保存请求中提交，服务端加密后保存，读取时不会回显。连接检测只验证企业微信只读权限、AI
      授权状态或对象存储 Bucket，不同步客户数据。
    </el-alert>
    <div class="integration-grid">
      <el-card v-for="item in rows" :key="item.provider" class="integration-card" shadow="never">
        <div class="card-heading">
          <div class="provider-icon" :class="`icon-${item.provider}`"
            ><Icon :icon="providerMeta[item.provider].icon"
          /></div>
          <div class="provider-copy"
            ><div class="provider-title">{{ providerMeta[item.provider].title }}</div
            ><div class="provider-subtitle">{{ providerMeta[item.provider].subtitle }}</div></div
          >
          <el-tag :type="statusType(item.status)" effect="light" round>{{
            statusLabel(item)
          }}</el-tag>
        </div>
        <div class="card-body">
          <div class="detail-row"
            ><span>授权范围</span><strong>{{ item.scopes.join('、') }}</strong></div
          >
          <div v-if="item.endpointUrl" class="detail-row"
            ><span>服务地址</span><strong class="endpoint">{{ item.endpointUrl }}</strong></div
          >
          <div v-if="item.provider === 'wecom'" class="detail-row"
            ><span>同步周期</span><strong>{{ item.syncIntervalMinutes }} 分钟</strong></div
          >
          <div class="detail-row"
            ><span>凭据状态</span
            ><strong>{{ item.hasCredentials ? '已加密保存 · 不可回显' : '尚未配置' }}</strong></div
          >
          <div class="detail-row"
            ><span>最近检测</span><strong>{{ item.lastCheckedAt || '尚未检测' }}</strong></div
          >
          <div v-if="item.lastErrorCode" class="detail-row error-detail"
            ><span>检测结果</span><strong>请检查凭据、授权范围或服务状态</strong></div
          >
        </div>
        <div class="card-footer">
          <el-button
            v-if="canManage && item.hasCredentials"
            :loading="testingProvider === item.provider"
            :disabled="previewMode"
            @click="handleTest(item)"
            >检测连接</el-button
          >
          <el-button v-if="canManage" type="primary" plain @click="openEditor(item)">{{
            item.hasCredentials ? '更新配置' : '配置连接'
          }}</el-button>
          <el-button
            v-if="canManage && item.hasCredentials"
            type="danger"
            plain
            @click="handleRevoke(item)"
            >撤销并删除凭据</el-button
          >
        </div>
      </el-card>
    </div>
    <div class="adapter-note"
      ><Icon icon="ep:warning-filled" /><div
        ><strong>检测范围</strong
        ><span
          >企业微信检测官方 API 凭据和只读跟进成员权限；AI
          服务检测受主机白名单保护的授权状态；对象存储使用签名 HeadBucket 请求检查
          Bucket，不列举对象、不读写文件。对象存储账号需要对应 Bucket 的 ListBucket
          权限。所有检测均不读取或同步客户资料。</span
        ></div
      ></div
    >

    <el-drawer
      v-model="editorVisible"
      :title="`配置${providerMeta[form.provider].title}`"
      size="520px"
      class="integration-drawer"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="配置名称" prop="displayName"
          ><el-input v-model="form.displayName" maxlength="80"
        /></el-form-item>
        <el-form-item v-if="form.provider !== 'wecom'" label="服务地址" prop="endpointUrl"
          ><el-input v-model="form.endpointUrl" placeholder="https://service.example.com"
        /></el-form-item>
        <el-form-item label="授权范围"
          ><el-input :model-value="providerMeta[form.provider].scope" disabled
        /></el-form-item>
        <el-form-item v-if="form.provider === 'wecom'" label="同步周期"
          ><el-select v-model="form.syncIntervalMinutes"
            ><el-option
              v-for="minutes in [15, 30, 60, 180, 360, 720, 1440]"
              :key="minutes"
              :label="`${minutes} 分钟`"
              :value="minutes" /></el-select
        ></el-form-item>
        <el-divider content-position="left">{{
          form.hasCredentials ? '更新凭据（留空保持原值）' : '服务凭据'
        }}</el-divider>
        <el-alert
          v-if="form.provider === 'wecom'"
          class="wecom-credential-hint"
          type="info"
          :closable="false"
          show-icon
        >
          只读权限检测需使用“客户联系 Secret”，或已加入企业微信“可调用应用”列表的自建应用
          Secret。Agent ID 当前仅用于配置记录，检测时不会使用。
        </el-alert>
        <el-form-item
          v-for="field in credentialFields"
          :key="field.key"
          :label="field.label"
          :prop="`credentials.${field.key}`"
        >
          <el-input
            v-model="form.credentials[field.key]"
            :type="field.secret === false ? 'text' : 'password'"
            :show-password="field.secret !== false"
            autocomplete="new-password"
            :placeholder="form.hasCredentials ? '已安全保存；留空则保持不变' : field.placeholder"
          />
        </el-form-item>
        <el-alert
          type="warning"
          :closable="false"
          title="请勿粘贴包含个人客户资料的内容。凭据会写入部署端的加密配置表。"
        />
      </el-form>
      <template #footer
        ><div class="drawer-footer"
          ><el-button @click="editorVisible = false">取消</el-button
          ><el-button type="primary" :loading="saving" @click="submit">保存加密配置</el-button></div
        ></template
      >
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { Icon } from '@iconify/vue'
import { checkPermi } from '@/utils/permission'
import type {
  IntegrationConnectionSave,
  IntegrationConnectionVO
} from '@/api/callphone/integrations'
import {
  getIntegrationList,
  revokeIntegration,
  saveIntegration,
  testIntegration,
  type IntegrationProvider
} from '@/api/callphone/integrations'
import {
  getPreviewIntegrations,
  revokePreviewIntegration,
  savePreviewIntegration
} from '@/api/callphone/integrations/preview'

defineOptions({ name: 'CallPhoneIntegrations' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const canManage = computed(() => previewMode || checkPermi(['callphone:integration:manage']))
const providerMeta = {
  wecom: {
    title: '企业微信',
    subtitle: '客户、客户群与运营能力',
    icon: 'ep:chat-line-round',
    scope: '客户与客户群只读同步'
  },
  ai_core: {
    title: 'Call Phone AI 核心服务',
    subtitle: '受保护的 AI 能力服务',
    icon: 'ep:magic-stick',
    scope: '授权后发送最少化任务元数据'
  },
  object_storage: {
    title: '私有对象存储',
    subtitle: '知识文档与备份文件',
    icon: 'ep:files',
    scope: '知识文档与备份文件'
  }
} as const
const rows = ref<IntegrationConnectionVO[]>([])
const loading = ref(false),
  saving = ref(false),
  editorVisible = ref(false)
const testingProvider = ref<IntegrationProvider | null>(null)
const formRef = ref<FormInstance>()
const form = reactive({
  id: undefined as string | undefined,
  provider: 'wecom' as IntegrationConnectionVO['provider'],
  displayName: '',
  endpointUrl: '',
  scopes: [] as string[],
  syncIntervalMinutes: 60,
  credentials: {} as Record<string, string>,
  hasCredentials: false,
  version: 0
})
const rules: FormRules = {
  displayName: [{ required: true, message: '请填写配置名称', trigger: 'blur' }],
  endpointUrl: [
    {
      validator: (_rule, value, done) => {
        if (!value || /^https:\/\//i.test(value)) done()
        else done(new Error('服务地址必须使用 HTTPS'))
      },
      trigger: 'blur'
    }
  ]
}
const credentialFields = computed(
  () =>
    ({
      wecom: [
        { key: 'corpId', label: '企业 ID', placeholder: '企业微信 Corp ID', secret: true },
        { key: 'agentId', label: '应用 Agent ID', placeholder: '应用 Agent ID', secret: true },
        {
          key: 'secret',
          label: '客户联系 / 应用 Secret',
          placeholder: '客户联系 Secret 或已授权的自建应用 Secret',
          secret: true
        }
      ],
      ai_core: [
        { key: 'apiKey', label: '服务密钥', placeholder: '由 Call Phone 服务端签发', secret: true }
      ],
      object_storage: [
        { key: 'accessKey', label: 'Access Key', placeholder: '对象存储访问密钥', secret: true },
        { key: 'secretKey', label: 'Secret Key', placeholder: '对象存储 Secret', secret: true },
        { key: 'bucket', label: 'Bucket', placeholder: '私有存储桶名称', secret: true },
        {
          key: 'region',
          label: '区域（可选）',
          placeholder: '例如 us-east-1；留空默认 us-east-1',
          secret: false
        }
      ]
    })[form.provider]
)
function statusLabel(row: IntegrationConnectionVO) {
  return row.status === 'connected'
    ? '已验证'
    : row.status === 'error'
      ? '检测失败'
      : row.status === 'revoked'
        ? '已撤销'
        : row.status === 'not_tested'
          ? '待检测'
          : '未连接'
}
function statusType(status: IntegrationConnectionVO['status']) {
  return status === 'connected'
    ? 'success'
    : status === 'error'
      ? 'danger'
      : status === 'revoked'
        ? 'info'
        : 'warning'
}
function canTest(provider: IntegrationProvider) {
  return provider === 'wecom' || provider === 'ai_core' || provider === 'object_storage'
}
async function load() {
  loading.value = true
  try {
    rows.value = previewMode ? getPreviewIntegrations() : await getIntegrationList()
  } catch {
    ElMessage.error('扩展服务状态读取失败')
  } finally {
    loading.value = false
  }
}
function openEditor(row: IntegrationConnectionVO) {
  Object.assign(form, {
    id: row.id,
    provider: row.provider,
    displayName: row.displayName,
    endpointUrl: row.endpointUrl || '',
    scopes: [...row.scopes],
    syncIntervalMinutes: row.syncIntervalMinutes,
    credentials: {},
    hasCredentials: row.hasCredentials,
    version: row.version
  })
  editorVisible.value = true
}
async function submit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const payload: IntegrationConnectionSave = {
      id: form.id,
      provider: form.provider,
      displayName: form.displayName.trim(),
      endpointUrl: form.endpointUrl.trim() || undefined,
      scopes: form.scopes,
      syncIntervalMinutes: form.syncIntervalMinutes,
      credentials: Object.fromEntries(
        Object.entries(form.credentials).filter(([, value]) => value.trim())
      ),
      expectedVersion: form.version
    }
    if (previewMode) savePreviewIntegration(payload)
    else await saveIntegration(payload)
    ElMessage.success('配置已安全保存，请执行连接检测确认凭据与权限')
    editorVisible.value = false
    await load()
  } catch {
    ElMessage.error('配置保存失败，请刷新后重试')
  } finally {
    saving.value = false
  }
}
async function handleTest(row: IntegrationConnectionVO) {
  if (!row.id || !canTest(row.provider) || previewMode) return
  testingProvider.value = row.provider
  try {
    const result = await testIntegration(row.id, row.version)
    if (result.status === 'connected') ElMessage.success('检测通过：凭据与授权有效')
    else ElMessage.warning('检测失败：请检查凭据、权限和服务状态')
    await load()
  } catch {
    ElMessage.error('连接检测请求失败，请刷新后重试')
  } finally {
    testingProvider.value = null
  }
}
async function handleRevoke(row: IntegrationConnectionVO) {
  try {
    await ElMessageBox.confirm(
      '撤销后服务凭据密文将从当前工作区删除。之后需要重新填写凭据。',
      '确认撤销连接',
      { type: 'warning', confirmButtonText: '撤销并删除凭据' }
    )
    if (previewMode) revokePreviewIntegration(row.provider)
    else if (row.id) await revokeIntegration(row.id, row.version)
    ElMessage.success('连接已撤销，凭据密文已删除')
    await load()
  } catch {
    /* user closed confirmation */
  }
}
onMounted(load)
</script>

<style scoped>
.integration-page {
  min-height: calc(100vh - 84px);
  padding: 20px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color-page);
}

.preview-banner {
  margin-bottom: 14px;
}

.page-intro {
  display: flex;
  padding: 20px 24px;
  margin-bottom: 14px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  align-items: center;
  justify-content: space-between;
}

.page-intro h1 {
  margin: 0;
  font-size: 20px;
}

.page-intro p {
  margin: 7px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.security-note {
  margin-bottom: 16px;
}

.integration-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(260px, 1fr));
  gap: 16px;
}

.integration-card {
  background: var(--el-bg-color);
  border-color: var(--el-border-color-light);
  border-radius: 10px;
}

.card-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.provider-icon {
  display: grid;
  width: 42px;
  height: 42px;
  font-size: 20px;
  color: #3978d4;
  background: #eaf2ff;
  border-radius: 10px;
  place-items: center;
}

.icon-wecom {
  color: #19a15f;
  background: #e8f7ef;
}

.icon-object_storage {
  color: #d68a25;
  background: #fff4e5;
}

.provider-copy {
  min-width: 0;
  flex: 1;
}

.provider-title {
  font-size: 15px;
  font-weight: 600;
}

.provider-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.card-body {
  padding: 20px 0 12px;
}

.detail-row {
  display: flex;
  padding: 10px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  justify-content: space-between;
  gap: 12px;
}

.detail-row span {
  color: var(--el-text-color-secondary);
  flex: none;
}

.detail-row strong {
  font-weight: 500;
  text-align: right;
  overflow-wrap: anywhere;
}

.endpoint {
  max-width: 190px;
}

.card-footer {
  display: flex;
  gap: 8px;
}

.adapter-note {
  display: flex;
  padding: 16px 18px;
  margin-top: 18px;
  color: #765b1d;
  background: #fffaf0;
  border: 1px solid #f0dca8;
  border-radius: 9px;
  gap: 12px;
  align-items: flex-start;
}

.adapter-note > :deep(svg) {
  margin-top: 2px;
  flex: none;
}

.adapter-note div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
}

.adapter-note span {
  line-height: 1.6;
  color: #88784f;
}

.integration-drawer :deep(.el-drawer) {
  color: #303133;
  background: #fff;
}

.integration-drawer :deep(.el-input__wrapper),
.integration-drawer :deep(.el-select__wrapper) {
  background: #fff;
  box-shadow: 0 0 0 1px #dcdfe6 inset;
}

.integration-drawer :deep(.el-form-item__label) {
  color: #606266;
}

.integration-drawer :deep(.el-alert) {
  background: #fff8e8;
}

.integration-drawer .wecom-credential-hint :deep(.el-alert__title) {
  line-height: 1.6;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (width <= 1000px) {
  .integration-grid {
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
}

@media (width <= 680px) {
  .integration-grid {
    grid-template-columns: 1fr;
  }

  .page-intro {
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
