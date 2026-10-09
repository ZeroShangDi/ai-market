<template>
  <div class="backup-page">
    <section class="backup-card">
      <header class="page-heading">
        <div>
          <div class="eyebrow">系统设置 · 数据安全</div>
          <h1>本地备份与恢复</h1>
          <p>备份文件留在部署服务器，并使用本地密钥加密。</p>
        </div>
        <el-button type="primary" :disabled="previewMode" :loading="creating" @click="createBackup">
          <Icon icon="ep:download" />立即创建备份
        </el-button>
      </header>

      <el-alert
        class="scope-alert"
        title="备份范围仅包含当前租户的 Call Phone 业务数据"
        description="包含 Call Phone 的 cp_* 业务表；不包含 Yudao 用户、角色、组织、权限等系统数据，也不包含备份文件本身。恢复会整体替换当前租户的 Call Phone 数据。"
        type="info"
        :closable="false"
        show-icon
      />

      <div class="backup-stats">
        <div><span>备份位置</span><strong>当前部署服务器</strong></div>
        <div
          ><span>文件保护</span><strong><Icon icon="ep:lock" /> AES-GCM 加密</strong></div
        >
        <div><span>恢复方式</span><strong>预览差异 · 二次确认</strong></div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" class="backup-table">
        <el-table-column label="备份时间" min-width="190">
          <template #default="{ row }">{{
            formatDate(row.completedAt || row.createTime)
          }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default><el-tag type="success" effect="light">已完成</el-tag></template>
        </el-table-column>
        <el-table-column label="数据表" width="110" align="right">
          <template #default="{ row }">{{ row.tableCount }}</template>
        </el-table-column>
        <el-table-column label="数据行" width="130" align="right">
          <template #default="{ row }">{{ row.rowCount.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="文件大小" width="120" align="right">
          <template #default="{ row }">{{ formatBytes(row.artifactSize) }}</template>
        </el-table-column>
        <el-table-column label="格式版本" width="110" align="center">
          <template #default="{ row }">v{{ row.schemaVersion }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="previewMode" @click="download(row)"
              >下载加密文件</el-button
            >
            <el-button link type="danger" :disabled="previewMode" @click="openRestore(row)"
              >恢复</el-button
            >
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="previewMode ? '本地预览不连接备份服务，未生成演示备份' : '还没有备份记录'"
            :image-size="84"
          >
            <el-button v-if="previewMode" disabled>立即创建备份</el-button>
            <el-button v-else type="primary" :loading="creating" @click="createBackup"
              >创建第一份备份</el-button
            >
          </el-empty>
        </template>
      </el-table>

      <footer class="table-footer">
        <span><Icon icon="ep:warning" /> 请妥善保管服务端加密密钥；丢失密钥后无法读取备份。</span>
        <el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="load"
        />
      </footer>
    </section>

    <el-dialog v-model="restoreVisible" title="恢复前检查" width="680px" destroy-on-close>
      <template v-if="restorePreview">
        <el-alert
          title="恢复将替换当前租户的 Call Phone 业务数据"
          description="请先确认以下数据差异。Yudao 用户、角色、组织和权限不会被修改。建议先创建一份当前数据备份。"
          type="warning"
          :closable="false"
          show-icon
        />
        <div class="restore-summary">
          <span
            >备份数据 <strong>{{ restorePreview.backupRowCount.toLocaleString() }}</strong> 行</span
          >
          <span
            >当前数据
            <strong>{{ restorePreview.currentRowCount.toLocaleString() }}</strong> 行</span
          >
          <span
            >涉及 <strong>{{ restorePreview.tableCount }}</strong> 张表</span
          >
        </div>
        <el-table :data="restorePreview.tables" max-height="270" size="small" class="diff-table">
          <el-table-column prop="tableName" label="数据表" min-width="210" />
          <el-table-column prop="currentRows" label="当前行数" width="130" align="right" />
          <el-table-column prop="backupRows" label="恢复后行数" width="130" align="right" />
        </el-table>
        <el-form label-position="top" class="confirm-form">
          <el-form-item label="输入确认短语以继续">
            <el-input
              v-model="confirmText"
              placeholder="REPLACE CALLPHONE DATA"
              autocomplete="off"
            />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="restoreVisible = false">取消</el-button>
        <el-button
          type="danger"
          :disabled="confirmText !== 'REPLACE CALLPHONE DATA'"
          :loading="restoring"
          @click="confirmRestore"
        >
          确认替换并恢复
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import {
  createLocalBackup,
  downloadLocalBackup,
  getLocalBackupPage,
  previewLocalBackupRestore,
  restoreLocalBackup,
  type LocalBackupPreview,
  type LocalBackupRecord
} from '@/api/callphone/system/local-backup'

const route = useRoute()
const previewMode = import.meta.env.DEV && route.query.preview === '1'
const loading = ref(false)
const creating = ref(false)
const restoring = ref(false)
const rows = ref<LocalBackupRecord[]>([])
const total = ref(0)
const pageNo = ref(1)
const pageSize = ref(10)
const restoreVisible = ref(false)
const restorePreview = ref<LocalBackupPreview>()
const restoreTarget = ref<LocalBackupRecord>()
const confirmText = ref('')

async function load() {
  if (previewMode) return
  loading.value = true
  try {
    const result = (await getLocalBackupPage({
      pageNo: pageNo.value,
      pageSize: pageSize.value
    })) as { list: LocalBackupRecord[]; total: number }
    rows.value = result.list || []
    total.value = result.total || 0
  } finally {
    loading.value = false
  }
}
async function createBackup() {
  try {
    await ElMessageBox.confirm(
      '将加密导出当前租户的 Call Phone 业务数据到本地服务器，是否继续？',
      '创建本地备份',
      { type: 'info', confirmButtonText: '开始备份' }
    )
    creating.value = true
    const result = await createLocalBackup()
    ElMessage.success(`备份已完成，SHA-256：${result.checksum.slice(0, 12)}…`)
    await load()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('创建备份失败，请查看服务日志')
  } finally {
    creating.value = false
  }
}
async function download(row: LocalBackupRecord) {
  await downloadLocalBackup(row.id)
}
async function openRestore(row: LocalBackupRecord) {
  try {
    restoreTarget.value = row
    restorePreview.value = await previewLocalBackupRestore(row.id)
    confirmText.value = ''
    restoreVisible.value = true
  } catch {
    ElMessage.error('无法生成恢复预览，请确认备份文件仍在且版本兼容')
  }
}
async function confirmRestore() {
  if (!restoreTarget.value || !restorePreview.value) return
  restoring.value = true
  try {
    await restoreLocalBackup({
      backupId: restoreTarget.value.id,
      previewToken: restorePreview.value.previewToken,
      confirmText: confirmText.value
    })
    ElMessage.success('Call Phone 数据已恢复')
    restoreVisible.value = false
    await load()
  } catch {
    ElMessage.error('恢复失败，预览令牌可能已过期；请重新打开恢复预览')
  } finally {
    restoring.value = false
  }
}
function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}
onMounted(load)
</script>

<style scoped>
.backup-page {
  min-height: calc(100vh - 104px);
  padding: 24px;
  color: #263248;
  background: #f5f7fb;
}

.backup-card {
  padding: 24px;
  background: #fff;
  border: 1px solid #e8edf5;
  border-radius: 12px;
  box-shadow: 0 4px 18px rgb(32 55 90 / 4%);
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}

.eyebrow {
  margin-bottom: 6px;
  font-size: 12px;
  color: #74819a;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  color: #202b3e;
}

.page-heading p {
  margin: 7px 0 0;
  font-size: 13px;
  color: #7b879a;
}

.scope-alert {
  margin-bottom: 18px;
}

.backup-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.backup-stats > div {
  display: flex;
  min-height: 68px;
  padding: 12px 16px;
  background: #fbfcfe;
  border: 1px solid #edf0f6;
  border-radius: 8px;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
}

.backup-stats span {
  font-size: 12px;
  color: #8994a7;
}

.backup-stats strong {
  display: flex;
  font-size: 13px;
  font-weight: 600;
  color: #34435c;
  align-items: center;
  gap: 6px;
}

.backup-table {
  --el-table-header-bg-color: #f7f9fc;
  --el-table-row-hover-bg-color: #f7faff;
}

.table-footer {
  display: flex;
  min-height: 56px;
  font-size: 12px;
  color: #858fa1;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.table-footer > span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.restore-summary {
  display: flex;
  padding: 14px;
  margin: 20px 0 14px;
  font-size: 13px;
  color: #718099;
  background: #f6f8fc;
  border-radius: 8px;
  justify-content: space-around;
}

.restore-summary strong {
  margin-left: 4px;
  font-size: 15px;
  color: #2d3c56;
}

.diff-table {
  border: 1px solid #edf0f6;
  border-radius: 6px;
}

.confirm-form {
  margin-top: 18px;
}

@media (width <= 900px) {
  .backup-page {
    padding: 14px;
  }

  .backup-card {
    padding: 16px;
  }

  .backup-stats {
    grid-template-columns: 1fr;
  }

  .table-footer {
    align-items: flex-start;
    padding-top: 10px;
    flex-direction: column;
  }
}
</style>
