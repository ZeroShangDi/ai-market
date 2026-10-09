<template>
  <div class="wecom-groups-page">
    <el-alert
      v-if="previewMode"
      class="preview-alert"
      title="页面预览 · 未连接企微"
      description="此页不展示虚构群聊。实际列表来自所选企微成员授权可见的客户群，本地只读保存同步快照。"
      type="info"
      :closable="false"
      show-icon
    />
    <section class="page-panel">
      <header class="page-heading">
        <div
          ><div class="eyebrow">客户关系 · 企业微信</div><h1>客户群</h1
          ><p>同步员工可见的外部客户群，查看群资料与成员变化。</p></div
        >
        <div class="heading-actions">
          <el-button
            v-if="!previewMode && syncAllowed"
            :loading="refreshingUsers"
            @click="loadUsers"
            ><Icon icon="ep:refresh" />刷新成员</el-button
          >
          <el-button
            type="primary"
            :disabled="previewMode || !syncAllowed || !query.ownerKey"
            :loading="startingSync"
            @click="startSync"
            ><Icon icon="ep:refresh-right" />同步所选成员</el-button
          >
        </div>
      </header>
      <div class="privacy-strip">
        <span class="privacy-icon"><Icon icon="ep:lock" /></span>
        <div
          ><strong>只读的本地群快照</strong
          ><span>不会从此页添加成员、移除成员或发送群消息；成员姓名仅向获准用户返回。</span></div
        >
        <el-switch
          v-model="includePii"
          :disabled="previewMode || !piiAllowed"
          active-text="显示成员姓名"
          @change="load"
        />
      </div>
      <div v-if="activeJob" class="sync-progress">
        <div class="sync-copy"
          ><span class="sync-dot" :class="{ running: activeJob.status === 'running' }"></span
          ><strong>{{ syncStatus(activeJob.status) }}</strong
          ><span>已处理 {{ activeJob.processed }} / {{ activeJob.total }}</span
          ><span v-if="activeJob.failed">失败 {{ activeJob.failed }} 个群</span></div
        >
        <el-progress :percentage="progress" :stroke-width="7" :show-text="false" />
      </div>
      <el-form :inline="true" :model="query" class="filter-bar" @submit.prevent="load">
        <el-form-item label="同步成员"
          ><el-select
            v-model="query.ownerKey"
            filterable
            clearable
            placeholder="全部成员"
            @change="load"
            ><el-option
              v-for="user in followUsers"
              :key="user.userId"
              :label="user.name"
              :value="user.userId" /></el-select
        ></el-form-item>
        <el-form-item label="群名称"
          ><el-input
            v-model="query.query"
            clearable
            maxlength="80"
            placeholder="输入完整群名精确查找"
            @keyup.enter="load"
        /></el-form-item>
        <el-form-item label="群状态"
          ><el-select v-model="query.status" clearable placeholder="全部状态" @change="load"
            ><el-option label="正常" value="active" /><el-option
              label="已解散"
              value="dissolved" /></el-select
        ></el-form-item>
        <el-form-item
          ><el-button type="primary" @click="load">查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>
      <el-table v-loading="loading" :data="rows" row-key="id" @row-click="openDetail">
        <el-table-column label="客户群" min-width="260"
          ><template #default="{ row }"
            ><div class="group-cell"
              ><span class="group-avatar"><Icon icon="ep:chat-line-round" /></span
              ><div
                ><strong>{{ row.name }}</strong
                ><small>{{ row.status === 'dissolved' ? '群聊已解散' : '外部客户群' }}</small></div
              ></div
            ></template
          ></el-table-column
        >
        <el-table-column label="群主 / 同步范围" min-width="170"
          ><template #default="{ row }">{{ row.ownerName || '—' }}</template></el-table-column
        >
        <el-table-column label="成员数" width="110"
          ><template #default="{ row }"
            ><span class="count-pill"><Icon icon="ep:user" />{{ row.memberCount }}</span></template
          ></el-table-column
        >
        <el-table-column label="建群时间" min-width="170"
          ><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column
        >
        <el-table-column label="最近同步" min-width="170"
          ><template #default="{ row }">{{
            formatTime(row.lastSyncedAt)
          }}</template></el-table-column
        >
        <el-table-column label="状态" width="110"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="light">{{
              row.status === 'active' ? '正常' : '已解散'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="操作" width="90" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click.stop="openDetail(row)"
              >查看成员</el-button
            ></template
          ></el-table-column
        >
        <template #empty
          ><el-empty
            :description="
              previewMode
                ? '连接企业微信后，已授权同步的客户群会显示在这里'
                : '暂无本地群快照，请选择同步成员并开始同步'
            "
        /></template>
      </el-table>
      <footer class="table-footer"
        ><span>本地群快照 {{ total.toLocaleString() }} 个</span
        ><el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="load"
      /></footer>
    </section>
    <el-drawer v-model="detailVisible" title="客户群详情" size="520px" destroy-on-close>
      <div v-if="detail" class="detail-content">
        <div class="detail-hero"
          ><span class="group-avatar large"><Icon icon="ep:chat-line-round" /></span
          ><div
            ><h2>{{ detail.name }}</h2
            ><el-tag :type="detail.status === 'active' ? 'success' : 'info'" effect="light">{{
              detail.status === 'active' ? '正常' : '已解散'
            }}</el-tag></div
          ></div
        >
        <el-descriptions :column="2" border class="detail-descriptions"
          ><el-descriptions-item label="同步成员">{{
            detail.ownerName || '—'
          }}</el-descriptions-item
          ><el-descriptions-item label="成员数">{{ detail.memberCount }}</el-descriptions-item
          ><el-descriptions-item label="建群时间">{{
            formatTime(detail.createdAt)
          }}</el-descriptions-item
          ><el-descriptions-item label="最近同步">{{
            formatTime(detail.lastSyncedAt)
          }}</el-descriptions-item></el-descriptions
        >
        <div class="member-heading"
          ><div
            ><h3>群成员</h3
            ><p>{{
              detail.piiVisible ? '成员信息来自最近一次授权同步' : '姓名受字段权限保护'
            }}</p></div
          ><el-tag effect="plain">{{ detail.memberCount }} 人</el-tag></div
        >
        <el-table
          v-if="detail.piiVisible"
          :data="detail.members || []"
          max-height="420"
          row-key="name"
          ><el-table-column label="成员" min-width="180"
            ><template #default="{ row }"
              ><div class="member-cell"
                ><span class="member-avatar"><Icon icon="ep:user-filled" /></span
                >{{ row.name || '未命名成员'
                }}<el-tag v-if="row.groupAdmin" size="small" effect="plain">群主</el-tag></div
              ></template
            ></el-table-column
          ><el-table-column label="类型" prop="type" width="120" /><el-table-column
            label="加入时间"
            min-width="165"
            ><template #default="{ row }">{{ formatTime(row.joinedAt) }}</template></el-table-column
          ></el-table
        >
        <el-empty
          v-else
          description="开启成员姓名查看权限后，服务端才会返回成员信息"
          :image-size="90"
        />
        <div class="detail-note"
          ><Icon
            icon="ep:lock"
          />成员标识加密保存在本地。客户群首期为只读页面，不执行任何群成员或消息操作。</div
        >
      </div>
      <el-empty v-else description="读取群详情失败，请重试" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import * as GroupApi from '@/api/callphone/wecom/group'

defineOptions({ name: 'CallPhoneWeComGroups' })
const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false)
const refreshingUsers = ref(false)
const startingSync = ref(false)
const includePii = ref(false)
const piiAllowed = ref(false)
const syncAllowed = ref(false)
const detailVisible = ref(false)
const rows = ref<GroupApi.WeComGroupVO[]>([])
const followUsers = ref<GroupApi.WeComGroupFollowUser[]>([])
const detail = ref<GroupApi.WeComGroupVO>()
const activeJob = ref<GroupApi.WeComGroupSyncJob>()
const total = ref(0)
const query = reactive({ pageNo: 1, pageSize: 10, query: '', ownerKey: '', status: '' })
let pollTimer: ReturnType<typeof setInterval> | undefined
const progress = computed(() =>
  activeJob.value?.total
    ? Math.min(100, Math.round((activeJob.value.processed / activeJob.value.total) * 100))
    : 0
)
async function load() {
  if (previewMode) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const result = (await GroupApi.getWeComGroupPage({
      ...query,
      query: query.query.trim() || undefined,
      ownerKey: query.ownerKey || undefined,
      status: query.status || undefined,
      includePii: includePii.value
    })) as { list?: GroupApi.WeComGroupVO[]; total?: number }
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error: any) {
    rows.value = []
    total.value = 0
    ElMessage.error(error?.message || '企微群列表读取失败')
  } finally {
    loading.value = false
  }
}
async function loadUsers() {
  if (previewMode) return
  refreshingUsers.value = true
  try {
    followUsers.value = await GroupApi.getWeComGroupFollowUsers()
  } catch (error: any) {
    followUsers.value = []
    ElMessage.error(error?.message || '企微成员读取失败，请检查企业微信连接')
  } finally {
    refreshingUsers.value = false
  }
}
async function startSync() {
  if (!query.ownerKey) {
    ElMessage.warning('请选择一位同步成员')
    return
  }
  startingSync.value = true
  try {
    const job = await GroupApi.startWeComGroupSync({
      ownerKey: query.ownerKey,
      idempotencyKey:
        globalThis.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    })
    activeJob.value = job
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      void pollJob(job.id)
    }, 1200)
    ElMessage.success('群同步任务已提交')
  } catch (error: any) {
    ElMessage.error(error?.message || '群同步任务提交失败')
  } finally {
    startingSync.value = false
  }
}
async function pollJob(id: string) {
  try {
    const job = await GroupApi.getWeComGroupSyncJob(id)
    if (!job) return
    activeJob.value = job
    if (['completed', 'partial', 'failed'].includes(job.status)) {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = undefined
      await load()
      if (job.status === 'completed') ElMessage.success(`同步完成，处理 ${job.succeeded} 个群`)
      else if (job.status === 'partial')
        ElMessage.warning(`同步部分完成：成功 ${job.succeeded} 个，失败 ${job.failed} 个`)
      else ElMessage.error('群同步失败，请检查企业微信配置后重试')
    }
  } catch {
    /* retry transient polling errors */
  }
}
async function openDetail(row: GroupApi.WeComGroupVO) {
  detailVisible.value = true
  detail.value = undefined
  try {
    detail.value = (await GroupApi.getWeComGroup(row.id, includePii.value)) || undefined
  } catch (error: any) {
    ElMessage.error(error?.message || '客户群详情读取失败')
  }
}
function reset() {
  query.pageNo = 1
  query.query = ''
  query.ownerKey = ''
  query.status = ''
  void load()
}
function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
function syncStatus(value: GroupApi.WeComGroupSyncJob['status']) {
  return {
    queued: '等待同步',
    running: '正在同步',
    completed: '同步完成',
    partial: '部分完成',
    failed: '同步失败'
  }[value]
}
onMounted(() => {
  if (!previewMode) {
    void GroupApi.getWeComGroupPiiPermission()
      .then((value) => {
        piiAllowed.value = value
      })
      .catch(() => {
        piiAllowed.value = false
      })
    void GroupApi.getWeComGroupSyncPermission()
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
.wecom-groups-page {
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

.group-cell {
  display: flex;
  align-items: center;
  gap: 11px;
}

.group-cell > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-cell strong {
  font-size: 13px;
  font-weight: 600;
  color: #303b50;
}

.group-cell small {
  font-size: 11px;
  color: #9aa3b3;
}

.group-avatar {
  display: grid;
  width: 38px;
  height: 38px;
  color: #4f6bce;
  background: #edf2ff;
  border-radius: 12px;
  place-items: center;
}

.group-avatar.large {
  width: 50px;
  height: 50px;
  font-size: 21px;
}

.count-pill {
  display: inline-flex;
  padding: 5px 10px;
  font-size: 12px;
  color: #56657d;
  background: #f5f7fb;
  border-radius: 16px;
  align-items: center;
  gap: 6px;
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

.detail-descriptions {
  margin-bottom: 22px;
}

.detail-descriptions :deep(.el-descriptions__label) {
  color: #748096;
  background: #f8f9fc;
}

.detail-descriptions :deep(.el-descriptions__content) {
  color: #303b50;
}

.member-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 12px;
}

.member-heading h3 {
  margin: 0;
  font-size: 15px;
  color: #303b50;
}

.member-heading p {
  margin: 5px 0 0;
  font-size: 12px;
  color: #929bad;
}

.member-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.member-avatar {
  display: grid;
  width: 28px;
  height: 28px;
  color: #5874d4;
  background: #eef2ff;
  border-radius: 50%;
  place-items: center;
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
