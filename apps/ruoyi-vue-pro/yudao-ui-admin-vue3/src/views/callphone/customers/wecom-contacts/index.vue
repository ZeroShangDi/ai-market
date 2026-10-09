<template>
  <div class="wecom-page">
    <el-alert
      v-if="previewMode"
      class="preview-alert"
      title="页面预览 · 未连接企微"
      description="当前只展示页面结构，不载入虚构联系人。连接企业微信后，真实同步数据会加密保存在部署方数据库中。"
      type="info"
      :closable="false"
      show-icon
    />
    <section class="page-panel">
      <header class="page-heading">
        <div>
          <div class="eyebrow">客户关系 · 企业微信</div>
          <h1>企微客户</h1>
          <p>查看员工跟进的外部联系人，并将授权范围内的资料同步到本地。</p>
        </div>
        <div class="heading-actions">
          <el-button v-if="!previewMode" :loading="refreshingUsers" @click="loadUsers">
            <Icon icon="ep:refresh" />刷新成员
          </el-button>
          <el-button
            type="primary"
            :disabled="previewMode || !syncAllowed || !query.followUserKey"
            :loading="startingSync"
            @click="startSync"
          >
            <Icon icon="ep:refresh-right" />同步所选成员
          </el-button>
        </div>
      </header>

      <div class="privacy-strip">
        <span class="privacy-icon"><Icon icon="ep:lock" /></span>
        <div
          ><strong>客户资料留在本地</strong
          ><span>姓名、备注与标签加密保存；敏感字段需单独授权后才会请求和显示。</span></div
        >
        <el-switch
          v-model="includePii"
          :disabled="previewMode || !piiAllowed"
          active-text="显示敏感字段"
          @change="load"
        />
      </div>

      <div v-if="activeJob" class="sync-progress">
        <div class="sync-copy">
          <span class="sync-dot" :class="{ running: activeJob.status === 'running' }"></span>
          <strong>{{ syncStatus(activeJob.status) }}</strong>
          <span>已处理 {{ activeJob.processed }} / {{ activeJob.total }}</span>
          <span v-if="activeJob.failed">失败 {{ activeJob.failed }} 条</span>
        </div>
        <el-progress :percentage="progress" :stroke-width="7" :show-text="false" />
      </div>

      <el-form :inline="true" :model="query" class="filter-bar" @submit.prevent="load">
        <el-form-item label="跟进成员">
          <el-select
            v-model="query.followUserKey"
            filterable
            clearable
            placeholder="全部成员"
            @change="load"
          >
            <el-option
              v-for="user in followUsers"
              :key="user.userId"
              :label="user.name"
              :value="user.userId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="客户姓名">
          <el-input
            v-model="query.query"
            clearable
            maxlength="80"
            placeholder="输入完整姓名精确查找"
            @keyup.enter="load"
          />
        </el-form-item>
        <el-form-item label="客户类型">
          <el-select v-model="query.externalType" clearable placeholder="全部类型" @change="load">
            <el-option label="外部联系人" value="external" />
            <el-option label="企业成员" value="internal" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="load">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        class="contact-table"
        @row-click="openDetail"
      >
        <el-table-column label="企微客户" min-width="220">
          <template #default="{ row }">
            <div class="contact-cell"
              ><span class="avatar"><Icon icon="ep:user-filled" /></span
              ><div
                ><strong>{{ row.name }}</strong
                ><small>{{
                  row.externalType === 'internal' ? '企业成员' : '外部联系人'
                }}</small></div
              ></div
            >
          </template>
        </el-table-column>
        <el-table-column label="跟进成员" prop="followUserName" min-width="150"
          ><template #default="{ row }">{{ row.followUserName || '—' }}</template></el-table-column
        >
        <el-table-column label="添加时间" min-width="170"
          ><template #default="{ row }">{{
            formatTime(row.firstAddedAt)
          }}</template></el-table-column
        >
        <el-table-column label="最近互动" min-width="170"
          ><template #default="{ row }"
            ><el-tooltip content="需开通企业微信会话存档后提供互动时间"
              ><span>{{ formatTime(row.lastInteractionAt) }}</span></el-tooltip
            ></template
          ></el-table-column
        >
        <el-table-column label="本地同步" min-width="170"
          ><template #default="{ row }">{{
            formatTime(row.lastSyncedAt)
          }}</template></el-table-column
        >
        <el-table-column label="标签" min-width="210">
          <template #default="{ row }"
            ><div v-if="row.tags?.length" class="tag-list"
              ><el-tag v-for="tag in row.tags.slice(0, 3)" :key="tag" effect="plain" round>{{
                tag
              }}</el-tag></div
            ><span v-else class="muted">{{
              row.piiVisible ? '暂无标签' : '需授权查看'
            }}</span></template
          >
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click.stop="openDetail(row)">查看</el-button></template
          ></el-table-column
        >
        <template #empty><el-empty :description="emptyDescription" /></template>
      </el-table>
      <footer class="table-footer"
        ><span>本地已同步 {{ total.toLocaleString() }} 位客户</span
        ><el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="load"
      /></footer>
    </section>

    <el-drawer v-model="detailVisible" title="企微客户详情" size="500px" destroy-on-close>
      <div v-if="detail" class="detail-content">
        <div class="detail-hero"
          ><span class="avatar large"><Icon icon="ep:user-filled" /></span
          ><div
            ><h2>{{ detail.name }}</h2
            ><el-tag effect="light">{{
              detail.externalType === 'internal' ? '企业成员' : '外部联系人'
            }}</el-tag></div
          ></div
        >
        <el-descriptions :column="1" border class="detail-descriptions">
          <el-descriptions-item label="跟进成员">{{
            detail.followUserName || '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="添加时间">{{
            formatTime(detail.firstAddedAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="最近互动">{{
            formatTime(detail.lastInteractionAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="客户备注">{{
            detail.piiVisible ? detail.remark || '暂无备注' : '已隐藏，需敏感字段权限'
          }}</el-descriptions-item>
          <el-descriptions-item label="客户描述">{{
            detail.piiVisible ? detail.description || '暂无描述' : '已隐藏，需敏感字段权限'
          }}</el-descriptions-item>
          <el-descriptions-item label="客户标签"
            ><div v-if="detail.piiVisible && detail.tags?.length" class="tag-list"
              ><el-tag v-for="tag in detail.tags" :key="tag" effect="plain" round>{{
                tag
              }}</el-tag></div
            ><span v-else>{{
              detail.piiVisible ? '暂无标签' : '已隐藏，需敏感字段权限'
            }}</span></el-descriptions-item
          >
          <el-descriptions-item label="最近同步">{{
            formatTime(detail.lastSyncedAt)
          }}</el-descriptions-item>
        </el-descriptions>
        <div class="detail-note"
          ><Icon icon="ep:lock" />企微数据保存在本地部署环境中；页面不会把客户资料发送到 Call Phone
          核心服务。</div
        >
      </div>
      <el-empty v-else description="读取客户详情失败，请重试" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import * as WeComApi from '@/api/callphone/wecom/contact'

defineOptions({ name: 'CallPhoneWeComContacts' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false)
const refreshingUsers = ref(false)
const startingSync = ref(false)
const includePii = ref(false)
const piiAllowed = ref(false)
const syncAllowed = ref(false)
const detailVisible = ref(false)
const rows = ref<WeComApi.WeComContactVO[]>([])
const followUsers = ref<WeComApi.WeComFollowUserVO[]>([])
const total = ref(0)
const detail = ref<WeComApi.WeComContactVO>()
const activeJob = ref<WeComApi.WeComSyncJobVO>()
const query = reactive({ pageNo: 1, pageSize: 10, query: '', followUserKey: '', externalType: '' })
let pollTimer: ReturnType<typeof setInterval> | undefined
const progress = computed(() =>
  activeJob.value?.total
    ? Math.min(100, Math.round((activeJob.value.processed / activeJob.value.total) * 100))
    : 0
)
const emptyDescription = computed(() =>
  previewMode
    ? '连接企业微信后，已授权同步的客户会显示在这里'
    : '暂无本地客户，请选择跟进成员并开始同步'
)

async function load() {
  if (previewMode) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const result = (await WeComApi.getWeComContactPage({
      ...query,
      query: query.query.trim() || undefined,
      followUserKey: query.followUserKey || undefined,
      externalType: query.externalType || undefined,
      includePii: includePii.value
    })) as { list?: WeComApi.WeComContactVO[]; total?: number }
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error: any) {
    rows.value = []
    total.value = 0
    ElMessage.error(error?.message || '企微客户读取失败')
  } finally {
    loading.value = false
  }
}
async function loadUsers() {
  if (previewMode) return
  refreshingUsers.value = true
  try {
    followUsers.value = await WeComApi.getWeComFollowUsers()
  } catch (error: any) {
    followUsers.value = []
    if (/WECOM_NOT_CONFIGURED|未配置|授权/.test(error?.message || '')) {
      ElMessage.warning('请先到“扩展服务配置”连接并授权企业微信')
      return
    }
    ElMessage.error(error?.message || '企微跟进成员读取失败')
  } finally {
    refreshingUsers.value = false
  }
}
async function startSync() {
  if (!query.followUserKey) {
    ElMessage.warning('请先选择一位跟进成员')
    return
  }
  startingSync.value = true
  try {
    const job = await WeComApi.startWeComContactSync({
      followUserKey: query.followUserKey,
      idempotencyKey: makeIdempotencyKey()
    })
    activeJob.value = job
    pollTimer && clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      void pollJob(job.id)
    }, 1200)
    ElMessage.success('同步任务已提交，页面会自动更新进度')
  } catch (error: any) {
    ElMessage.error(error?.message || '同步任务提交失败')
  } finally {
    startingSync.value = false
  }
}
async function pollJob(id: string) {
  try {
    const job = await WeComApi.getWeComSyncJob(id)
    if (!job) return
    activeJob.value = job
    if (['completed', 'partial', 'failed'].includes(job.status)) {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = undefined
      await load()
      if (job.status === 'completed')
        ElMessage.success(`同步完成，新增或更新 ${job.succeeded} 位客户`)
      else if (job.status === 'partial')
        ElMessage.warning(`同步完成：成功 ${job.succeeded} 条，失败 ${job.failed} 条`)
      else ElMessage.error('企微同步失败，请检查连接配置后重试')
    }
  } catch {
    /* transient polling errors are retried by the timer */
  }
}
async function openDetail(row: WeComApi.WeComContactVO) {
  detailVisible.value = true
  detail.value = undefined
  try {
    detail.value = (await WeComApi.getWeComContact(row.id, includePii.value)) || undefined
  } catch (error: any) {
    ElMessage.error(error?.message || '企微客户详情读取失败')
  }
}
function reset() {
  query.pageNo = 1
  query.query = ''
  query.followUserKey = ''
  query.externalType = ''
  void load()
}
function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
function syncStatus(value: WeComApi.WeComSyncJobVO['status']) {
  return {
    queued: '等待同步',
    running: '正在同步',
    completed: '同步完成',
    partial: '部分完成',
    failed: '同步失败'
  }[value]
}
function makeIdempotencyKey() {
  return (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  )
}
onMounted(() => {
  if (!previewMode) {
    void WeComApi.getWeComPiiPermission()
      .then((value) => {
        piiAllowed.value = value
      })
      .catch(() => {
        piiAllowed.value = false
      })
    void WeComApi.getWeComSyncPermission()
      .then(async (value) => {
        syncAllowed.value = value
        if (value) await loadUsers()
      })
      .catch(() => {
        syncAllowed.value = false
      })
  }
  void load()
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.wecom-page {
  padding: 20px 22px 28px;
  color: #20293b;
}

.preview-alert {
  margin-bottom: 16px;
}

.page-panel {
  padding: 24px 24px 16px;
  background: #fff;
  border: 1px solid #e9edf4;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgb(31 48 80 / 3%);
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.eyebrow {
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #3159d9;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  color: #20293b;
}

.page-heading p {
  margin: 8px 0 0;
  font-size: 13px;
  color: #7b8598;
}

.heading-actions {
  display: flex;
  gap: 10px;
}

.heading-actions :deep(.el-button .iconify) {
  margin-right: 6px;
}

.privacy-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  margin-bottom: 20px;
  background: #f4f7ff;
  border: 1px solid #e5ebff;
  border-radius: 10px;
}

.privacy-icon {
  display: grid;
  width: 34px;
  height: 34px;
  color: #3159d9;
  background: #e6edff;
  border-radius: 9px;
  place-items: center;
}

.privacy-strip > div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.privacy-strip strong {
  font-size: 13px;
  color: #303b50;
}

.privacy-strip span:not(.privacy-icon) {
  font-size: 12px;
  color: #7b8598;
}

.sync-progress {
  padding: 12px 15px;
  margin-bottom: 18px;
  background: #f7f9fc;
  border: 1px solid #edf0f5;
  border-radius: 9px;
}

.sync-copy {
  display: flex;
  margin-bottom: 10px;
  font-size: 12px;
  color: #778196;
  align-items: center;
  gap: 10px;
}

.sync-copy strong {
  font-size: 13px;
  color: #303b50;
}

.sync-dot {
  width: 8px;
  height: 8px;
  background: #97a1b2;
  border-radius: 50%;
}

.sync-dot.running {
  background: #3d67e8;
  box-shadow: 0 0 0 4px #e5ebff;
  animation: pulse 1.4s infinite;
}

@keyframes pulse {
  50% {
    box-shadow: 0 0 0 7px rgb(61 103 232 / 8%);
  }
}

.filter-bar {
  padding: 15px 15px 0;
  margin-bottom: 12px;
  background: #f8f9fc;
  border-radius: 9px;
}

.filter-bar :deep(.el-input),
.filter-bar :deep(.el-select) {
  width: 190px;
}

.contact-cell {
  display: flex;
  align-items: center;
  gap: 11px;
}

.contact-cell > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.contact-cell strong {
  font-size: 13px;
  font-weight: 600;
  color: #303b50;
}

.contact-cell small {
  font-size: 11px;
  color: #9aa3b3;
}

.avatar {
  display: grid;
  width: 36px;
  height: 36px;
  color: #5674d9;
  background: #edf2ff;
  border-radius: 50%;
  place-items: center;
}

.avatar.large {
  width: 52px;
  height: 52px;
  font-size: 20px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.muted {
  font-size: 12px;
  color: #a2aabc;
}

.table-footer {
  display: flex;
  padding-top: 15px;
  font-size: 12px;
  color: #7b8598;
  align-items: center;
  justify-content: space-between;
}

.detail-content {
  padding: 0 6px;
}

.detail-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 0 22px;
}

.detail-hero h2 {
  margin: 0 0 8px;
  font-size: 19px;
  color: #20293b;
}

.detail-descriptions :deep(.el-descriptions__label) {
  width: 105px;
  color: #748096;
  background: #f8f9fc;
}

.detail-descriptions :deep(.el-descriptions__content) {
  color: #303b50;
}

.detail-note {
  display: flex;
  padding: 12px;
  margin-top: 18px;
  font-size: 12px;
  line-height: 1.6;
  color: #67748b;
  background: #f4f7ff;
  border-radius: 8px;
  gap: 8px;
}

@media (width <= 900px) {
  .page-heading {
    flex-direction: column;
  }

  .heading-actions {
    align-self: flex-end;
  }

  .privacy-strip {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
