<template>
  <div class="archive-page">
    <el-alert
      v-if="previewMode || !status?.enabled"
      class="archive-alert"
      :title="previewMode ? '页面预览 · 未连接会话存档' : '会话存档服务未启用'"
      :description="
        previewMode
          ? '未接入企业微信会话存档 SDK 和成员授权。此页不生成模拟消息，也不会读取虚构的对话内容。'
          : status?.reason
      "
      type="info"
      :closable="false"
      show-icon
    />
    <section class="archive-panel">
      <header class="page-heading">
        <div>
          <div class="eyebrow">客户关系 · 企业微信</div>
          <h1>会话存档</h1>
          <p>在成员授权与存档服务启用后，按权限审阅会话记录和保留期限。</p>
        </div>
        <div class="heading-actions">
          <el-button @click="load"><Icon icon="ep:refresh" />刷新状态</el-button>
          <el-button v-if="previewMode" @click="openRetention">
            <Icon icon="ep:timer" />保留策略
          </el-button>
          <el-button
            v-else
            v-hasPermi="['callphone:wecom:archive:manage-retention']"
            @click="openRetention"
          >
            <Icon icon="ep:timer" />保留策略
          </el-button>
        </div>
      </header>

      <div class="archive-guard">
        <span class="guard-icon"><Icon icon="ep:lock" /></span>
        <div>
          <strong>消息正文受控访问</strong>
          <span
            >列表只展示时间、会话类型和消息类型；读取正文要求单独权限、填写用途并留审计记录。</span
          >
        </div>
        <el-tag :type="status?.enabled ? 'success' : 'info'" effect="light">
          {{ status?.enabled ? '服务已启用' : '服务未启用' }}
        </el-tag>
      </div>

      <el-form :inline="true" :model="query" class="filter-bar" @submit.prevent="load">
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            value-format="YYYY-MM-DDTHH:mm:ss"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            :disabled="previewMode || !status?.enabled"
          />
        </el-form-item>
        <el-form-item label="会话类型">
          <el-select
            v-model="query.conversationType"
            clearable
            placeholder="全部类型"
            :disabled="previewMode || !status?.enabled"
          >
            <el-option label="单聊" value="single" /><el-option label="群聊" value="group" />
          </el-select>
        </el-form-item>
        <el-form-item label="消息类型">
          <el-select
            v-model="query.messageType"
            clearable
            placeholder="全部类型"
            :disabled="previewMode || !status?.enabled"
          >
            <el-option
              v-for="item in messageTypes"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :disabled="previewMode || !status?.enabled" @click="load"
            >查询</el-button
          >
          <el-button :disabled="previewMode || !status?.enabled" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="rows" row-key="id">
        <el-table-column label="会话" min-width="170">
          <template #default="{ row }"
            ><span class="conversation-ref">{{ row.conversationRef }}</span></template
          >
        </el-table-column>
        <el-table-column label="会话类型" width="110">
          <template #default="{ row }">{{
            row.conversationType === 'group' ? '群聊' : '单聊'
          }}</template>
        </el-table-column>
        <el-table-column label="消息类型" width="120">
          <template #default="{ row }">{{ messageTypeLabel(row.messageType) }}</template>
        </el-table-column>
        <el-table-column label="参与成员数" width="120" prop="participantCount" />
        <el-table-column label="消息时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.messageTime) }}</template>
        </el-table-column>
        <el-table-column label="保留至" min-width="180">
          <template #default="{ row }">{{ formatTime(row.expiresAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              v-hasPermi="['callphone:wecom:archive:view-content']"
              link
              type="primary"
              @click="openContent(row)"
            >
              查看内容
            </el-button>
            <span v-if="!hasContentPermission" class="no-content-permission">无正文权限</span>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="
              status?.enabled
                ? '当前筛选范围内没有存档记录'
                : '服务启用且完成授权后，存档记录会显示在这里'
            "
            :image-size="76"
          />
        </template>
      </el-table>
      <div class="table-footer">
        <span>消息正文加密存储，访问会记录审计用途；超出保留期限的消息不会返回。</span>
        <el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="load"
        />
      </div>
    </section>

    <el-drawer v-model="retentionVisible" title="会话存档保留策略" size="480px">
      <el-alert
        title="本地保留期限与分批清理"
        :description="
          previewMode
            ? '当前为页面预览，保存和清理均不会调用服务。已应用 v54 数据库迁移的正式环境会每 15 分钟按租户清理一批（最多 500 条）过期记录，物理删除密文并记录系统审计；管理员也可手动立即清理一批。'
            : 'v54 数据库迁移会注册每 15 分钟执行的租户清理任务，每批最多 500 条，物理删除过期消息并记录系统审计。管理员也可手动立即清理一批；如果批次后仍有剩余，可再次执行。'
        "
        type="warning"
        :closable="false"
        show-icon
      />
      <el-form class="retention-form" label-position="top">
        <el-form-item label="保留期限（天）" required>
          <el-input-number
            v-model="retention.retentionDays"
            :min="30"
            :max="3650"
            :step="30"
            :disabled="previewMode"
          />
          <div class="field-help">支持 30–3650 天；以工作区数据保留制度和适用法规为准。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="drawer-footer">
          <el-button v-if="previewMode" type="danger" plain disabled>清理过期消息</el-button>
          <el-button
            v-else
            v-hasPermi="['callphone:wecom:archive:manage-retention']"
            type="danger"
            plain
            :loading="cleaning"
            @click="cleanupExpired"
          >
            清理过期消息
          </el-button>
          <el-button @click="retentionVisible = false">关闭</el-button>
          <el-button
            type="primary"
            :disabled="previewMode"
            :loading="savingRetention"
            @click="saveRetention"
            >保存策略</el-button
          >
        </div>
      </template>
    </el-drawer>

    <el-drawer v-model="contentVisible" title="会话内容 · 受控查看" size="520px">
      <template v-if="content">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="会话">{{ content.conversationRef }}</el-descriptions-item>
          <el-descriptions-item label="会话类型">{{
            content.conversationType === 'group' ? '群聊' : '单聊'
          }}</el-descriptions-item>
          <el-descriptions-item label="消息类型">{{
            messageTypeLabel(content.messageType)
          }}</el-descriptions-item>
          <el-descriptions-item label="消息时间">{{
            formatTime(content.messageTime)
          }}</el-descriptions-item>
          <el-descriptions-item label="保留至">{{
            formatTime(content.expiresAt)
          }}</el-descriptions-item>
        </el-descriptions>
        <section class="content-box"
          ><div class="eyebrow">消息正文</div><p>{{ content.content }}</p></section
        >
        <el-alert
          title="本次查看已记录审计用途"
          description="正文仅用于获准的业务审阅，请遵守企业告知和信息保留制度。"
          type="info"
          :closable="false"
        />
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import * as ArchiveApi from '@/api/callphone/wecom/archive'

defineOptions({ name: 'CallPhoneWeComArchive' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false)
const savingRetention = ref(false)
const cleaning = ref(false)
const retentionVisible = ref(false)
const contentVisible = ref(false)
const hasContentPermission = ref(false)
const rows = ref<ArchiveApi.WeComArchiveRecord[]>([])
const total = ref(0)
const status = ref<{
  enabled: boolean
  status: string
  reason: string
  errorCode?: string
  lastSyncAt?: string
}>()
const content = ref<ArchiveApi.WeComArchiveContent>()
const dateRange = ref<string[]>([])
const query = reactive({ pageNo: 1, pageSize: 10, conversationType: '', messageType: '' })
const retention = reactive({ retentionDays: 180, version: 0 })
const messageTypes = [
  { label: '文字', value: 'text' },
  { label: '图片', value: 'image' },
  { label: '语音', value: 'voice' },
  { label: '视频', value: 'video' },
  { label: '文件', value: 'file' },
  { label: '混合消息', value: 'mixed' },
  { label: '其他', value: 'other' }
]

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
function messageTypeLabel(type: string) {
  return messageTypes.find((item) => item.value === type)?.label || '其他'
}
async function load() {
  if (previewMode) {
    status.value = { enabled: false, status: 'disabled', reason: '未连接存档 SDK 或成员授权。' }
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    status.value = await ArchiveApi.getWeComArchiveStatus()
    const page = (await ArchiveApi.getWeComArchivePage({
      ...query,
      fromTime: dateRange.value[0],
      toTime: dateRange.value[1],
      conversationType: query.conversationType || undefined,
      messageType: query.messageType || undefined
    })) as { list?: ArchiveApi.WeComArchiveRecord[]; total?: number }
    rows.value = page.list || []
    total.value = page.total || 0
  } catch {
    ElMessage.error('会话存档读取失败，请检查授权和服务状态')
  } finally {
    loading.value = false
  }
}
function reset() {
  dateRange.value = []
  query.conversationType = ''
  query.messageType = ''
  query.pageNo = 1
  void load()
}
async function openContent(row: ArchiveApi.WeComArchiveRecord) {
  try {
    const { value } = await ElMessageBox.prompt(
      '填写查看此条会话内容的业务用途，说明至少 8 个字符。',
      '受控查看',
      {
        inputPlaceholder: '例如：处理客户投诉复核',
        inputValidator: (value) => value.trim().length >= 8 || '请填写至少 8 个字符的业务用途'
      }
    )
    content.value = await ArchiveApi.getWeComArchiveContent({ id: row.id, purpose: value })
    contentVisible.value = true
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('读取会话内容失败')
  }
}
async function openRetention() {
  if (previewMode) {
    retention.retentionDays = 180
    retention.version = 0
  } else {
    try {
      Object.assign(retention, await ArchiveApi.getWeComArchiveRetention())
    } catch {
      ElMessage.error('读取保留策略失败')
      return
    }
  }
  retentionVisible.value = true
}
async function saveRetention() {
  if (previewMode) return
  savingRetention.value = true
  try {
    Object.assign(
      retention,
      await ArchiveApi.saveWeComArchiveRetention({
        retentionDays: retention.retentionDays,
        expectedVersion: retention.version
      })
    )
    ElMessage.success('保留策略已保存')
    retentionVisible.value = false
  } catch {
    ElMessage.error('保存失败，策略可能已被其他管理员修改')
  } finally {
    savingRetention.value = false
  }
}
async function cleanupExpired() {
  try {
    await ElMessageBox.confirm(
      `将按当前 ${retention.retentionDays} 天保留期限，物理删除最多 500 条过期会话记录及正文，并记录清理审计。结果会显示剩余待清理数量；如仍有剩余，可再次执行。此操作不能撤销。`,
      '清理过期会话存档',
      { confirmButtonText: '确认清理', cancelButtonText: '取消', type: 'warning' }
    )
    cleaning.value = true
    const result = await ArchiveApi.cleanupExpiredWeComArchive()
    ElMessage.success(`本批删除 ${result.deletedCount} 条，剩余 ${result.remainingCount} 条待清理`)
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('清理失败，请稍后重试')
  } finally {
    cleaning.value = false
  }
}
onMounted(() => {
  hasContentPermission.value = !previewMode
  void load()
})
</script>

<style scoped>
.archive-page {
  padding: 20px 22px 28px;
  color: #20293b;
}

.archive-alert {
  margin-bottom: 16px;
}

.archive-panel {
  padding: 22px 24px 18px;
  background: #fff;
  border: 1px solid #edf0f5;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgb(31 48 80 / 3%);
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 8px 0 7px;
  font-size: 22px;
  font-weight: 650;
  color: #20293b;
}

.page-heading p {
  margin: 0;
  font-size: 13px;
  color: #8993a4;
}

.eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #65748b;
}

.heading-actions {
  display: flex;
  gap: 10px;
}

.archive-guard {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  margin-bottom: 18px;
  background: #f6f8fc;
  border: 1px solid #edf0f5;
  border-radius: 10px;
}

.guard-icon {
  display: grid;
  width: 36px;
  height: 36px;
  color: #546fc8;
  background: #eaf0ff;
  border-radius: 10px;
  place-items: center;
}

.archive-guard > div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
}

.archive-guard strong {
  font-size: 13px;
  color: #354158;
}

.archive-guard span {
  font-size: 12px;
  color: #8993a4;
}

.filter-bar {
  padding: 15px 16px 0;
  margin-bottom: 12px;
  background: #f7f8fb;
  border-radius: 9px;
}

.conversation-ref {
  font-weight: 600;
  color: #526fd1;
}

.no-content-permission {
  font-size: 12px;
  color: #9aa3b3;
}

.table-footer {
  display: flex;
  padding-top: 16px;
  font-size: 11px;
  color: #8c96a6;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.retention-form {
  padding-top: 24px;
}

.field-help {
  margin-top: 8px;
  font-size: 12px;
  color: #8993a4;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.content-box {
  padding: 18px;
  margin: 22px 0;
  background: #f7f8fb;
  border: 1px solid #edf0f5;
  border-radius: 10px;
}

.content-box p {
  margin: 12px 0 0;
  line-height: 1.8;
  color: #364258;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (width <= 920px) {
  .page-heading,
  .table-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-bar :deep(.el-date-editor) {
    width: 100%;
  }
}
</style>
