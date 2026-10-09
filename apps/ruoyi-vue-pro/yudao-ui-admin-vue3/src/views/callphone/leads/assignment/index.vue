<template>
  <div class="lead-assignment-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="分配和回收只修改当前浏览器中的演示数据。"
      type="warning"
      :closable="false"
    />
    <section class="page-panel">
      <header class="page-heading"
        ><div
          ><h1>分配与回收</h1
          ><p>将线索分配给启用成员，或回收到公共池；每次流转都会留下原因。</p></div
        ><el-tag effect="light">{{ total.toLocaleString() }} 条线索</el-tag></header
      >
      <el-form :inline="true" :model="query" class="filter-bar" @submit.prevent="load">
        <el-form-item label="负责人"
          ><el-select v-model="query.ownerUserId" clearable placeholder="全部成员" @change="load"
            ><el-option
              v-for="item in users"
              :key="item.id"
              :label="item.nickname"
              :value="String(item.id)" /></el-select
        ></el-form-item>
        <el-form-item label="状态"
          ><el-select v-model="query.status" clearable placeholder="全部状态" @change="load"
            ><el-option label="待分配" value="new" /><el-option
              label="已分配"
              value="claimed" /></el-select
        ></el-form-item>
        <el-form-item label="线索检索"
          ><el-input v-model="query.query" clearable placeholder="号码后四位" @keyup.enter="load"
        /></el-form-item>
        <el-form-item
          ><el-button type="primary" @click="load">查询</el-button
          ><el-button @click="reset">重置</el-button></el-form-item
        >
      </el-form>
      <div class="selection-actions">
        <span v-if="selectedLeads.length">已选 {{ selectedLeads.length }} 条</span>
        <el-button @click="openRules">分配规则</el-button>
        <el-button
          :disabled="selectedLeads.length === 0 || enabledRules.length === 0"
          @click="openRuleApply"
          >按规则分配</el-button
        >
        <el-button :disabled="selectedLeads.length === 0" @click="openBatchAssign"
          >批量分配 / 改派</el-button
        >
        <el-button
          :disabled="selectedLeads.length === 0 || users.length < 2"
          @click="openRoundRobin"
          >按成员轮转分配</el-button
        >
      </div>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="rows"
        row-key="id"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="线索" min-width="160"
          ><template #default="{ row }"
            ><strong>{{ row.name }}</strong
            ><small class="subline">{{ row.phoneDisplay }}</small></template
          ></el-table-column
        >
        <el-table-column label="来源" prop="sourceCode" min-width="120"
          ><template #default="{ row }">{{
            sourceLabel(row.sourceCode)
          }}</template></el-table-column
        >
        <el-table-column label="评分" width="92"
          ><template #default="{ row }"
            ><el-progress :percentage="row.score" :show-text="false" :stroke-width="6" /><small
              >{{ row.score }} 分</small
            ></template
          ></el-table-column
        >
        <el-table-column label="负责人" min-width="120"
          ><template #default="{ row }">{{ row.ownerName || '公共池' }}</template></el-table-column
        >
        <el-table-column label="状态" width="95"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 'new' ? 'warning' : 'success'" effect="light">{{
              row.status === 'new' ? '待分配' : '已分配'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="更新时间" min-width="180"
          ><template #default="{ row }">{{
            formatTime(row.updateTime || row.createTime)
          }}</template></el-table-column
        >
        <el-table-column label="操作" width="250" fixed="right"
          ><template #default="{ row }"
            ><el-button link @click="openHistory(row)">流转记录</el-button
            ><el-button link type="primary" @click="openAssign(row)">{{
              row.status === 'new' ? '分配' : '改派'
            }}</el-button
            ><el-button v-if="row.status === 'claimed'" link type="warning" @click="recycle(row)"
              >回收到公共池</el-button
            ></template
          ></el-table-column
        >
        <template #empty><el-empty :description="error || '没有符合条件的线索'" /></template>
      </el-table>
      <footer class="table-footer"
        ><span>只展示待分配或已分配线索</span
        ><el-pagination
          v-model:current-page="query.pageNo"
          v-model:page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next, sizes"
          @change="load"
      /></footer>
      <p class="privacy-note">分配按租户隔离并校验目标成员状态；回收和改派均追加流转审计记录。</p>
    </section>

    <el-drawer v-model="historyVisible" title="线索流转记录" size="520px">
      <div v-if="historyLead" class="history-lead">
        <strong>{{ historyLead.name }}</strong>
        <span>{{ historyLead.phoneDisplay }}</span>
      </div>
      <el-skeleton v-if="historyLoading" :rows="4" animated />
      <el-empty v-else-if="!historyRows.length" description="暂无分配或回收记录" />
      <el-timeline v-else class="history-timeline">
        <el-timeline-item
          v-for="event in historyRows"
          :key="event.id"
          :timestamp="formatTime(event.occurredAt)"
          placement="top"
          :type="event.action === 'recycle' ? 'warning' : 'primary'"
        >
          <div class="history-title">{{ actionLabel(event.action) }}</div>
          <div class="history-route"
            >{{ event.fromUserName }} <span>→</span> {{ event.toUserName }}</div
          >
          <div class="history-meta">操作人：{{ event.actorName }}</div>
          <div v-if="event.reason" class="history-reason">{{ event.reason }}</div>
        </el-timeline-item>
      </el-timeline>
      <el-pagination
        v-if="historyTotal > historyQuery.pageSize"
        v-model:current-page="historyQuery.pageNo"
        v-model:page-size="historyQuery.pageSize"
        :total="historyTotal"
        layout="prev, pager, next"
        @change="loadHistory"
      />
    </el-drawer>

    <el-dialog v-model="dialogVisible" title="分配线索" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="线索"
          ><el-input
            :model-value="activeLead ? `${activeLead.name} · ${activeLead.phoneDisplay}` : ''"
            disabled
        /></el-form-item>
        <el-form-item label="分配给" prop="toUserId"
          ><el-select v-model="form.toUserId" class="fill" filterable placeholder="选择启用成员"
            ><el-option
              v-for="item in users"
              :key="item.id"
              :label="item.nickname"
              :value="String(item.id)" /></el-select
        ></el-form-item>
        <el-form-item label="分配原因" prop="reason"
          ><el-input
            v-model="form.reason"
            type="textarea"
            maxlength="200"
            show-word-limit
            :rows="3"
            placeholder="说明分配或改派原因"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveAssign"
          >确认分配</el-button
        ></template
      >
    </el-dialog>

    <el-dialog v-model="batchDialogVisible" title="批量分配 / 改派" width="500px" destroy-on-close>
      <el-alert
        :title="`已选择 ${selectedLeads.length} 条线索`"
        description="已分配线索将改派给新负责人。状态已变化或不可分配的行会单独标记，其他行继续处理。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form
        ref="batchFormRef"
        :model="batchForm"
        :rules="rules"
        label-position="top"
        class="batch-form"
      >
        <el-form-item label="分配给" prop="toUserId">
          <el-select
            v-model="batchForm.toUserId"
            class="fill"
            filterable
            placeholder="选择启用成员"
          >
            <el-option
              v-for="item in users"
              :key="item.id"
              :label="item.nickname"
              :value="String(item.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分配原因" prop="reason">
          <el-input
            v-model="batchForm.reason"
            type="textarea"
            maxlength="200"
            show-word-limit
            :rows="3"
            placeholder="说明本次批量分配或改派原因"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveBatchAssign">确认处理</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="roundRobinDialogVisible"
      class="round-robin-dialog"
      title="按成员轮转分配"
      width="660px"
      destroy-on-close
    >
      <el-alert
        :title="`已选 ${roundRobinPlan.length} 条线索`"
        description="按预览顺序逐条分配给所选成员；每位成员获得的数量最多相差一条。状态已变化的线索会单独标记。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form
        ref="roundRobinFormRef"
        :model="roundRobinForm"
        :rules="roundRobinRules"
        label-position="top"
        class="batch-form"
      >
        <el-form-item label="轮转成员（至少两人）" prop="toUserIds">
          <el-select
            v-model="roundRobinForm.toUserIds"
            class="fill"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            :multiple-limit="20"
            placeholder="按选择顺序轮转"
          >
            <el-option
              v-for="item in users"
              :key="item.id"
              :label="item.nickname"
              :value="String(item.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分配原因" prop="reason">
          <el-input
            v-model="roundRobinForm.reason"
            type="textarea"
            maxlength="200"
            show-word-limit
            :rows="2"
            placeholder="说明本次轮转分配原因"
          />
        </el-form-item>
      </el-form>
      <div v-if="roundRobinPlan.length" class="round-robin-preview">
        <div class="preview-title">分配预览</div>
        <el-table :data="roundRobinPlan" size="small" height="210">
          <el-table-column label="线索" min-width="220">
            <template #default="{ row }">
              {{ row.lead.name }} <small>{{ row.lead.phoneDisplay }}</small>
            </template>
          </el-table-column>
          <el-table-column label="分配给" min-width="150">
            <template #default="{ row }">{{ row.user?.nickname || '请选择成员' }}</template>
          </el-table-column>
          <el-table-column label="轮次" width="76">
            <template #default="{ row }">{{ row.index + 1 }}</template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="roundRobinDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRoundRobin">确认轮转分配</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="rulesDrawerVisible" title="线索分配规则" size="920px">
      <el-alert
        class="auto-rule-notice"
        title="自动规则只处理新建线索，并立即分配负责人；现有待分配线索不会自动改派。"
        description="停用规则会暂停自动分配。存量线索仍可通过“按规则分配”手动处理。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="!autoConfigAvailable"
        class="auto-rule-notice"
        title="自动分配设置暂不可用"
        description="现有规则仍可查看和手动使用；请确认后端已部署 v50 接口并完成数据库迁移后，再启用自动分配或超时回收。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert
        v-else-if="!recycleConfigAvailable"
        class="auto-rule-notice"
        title="超时回收设置需要 v50 后端"
        description="新线索自动分配仍可使用；超时回收开关会在后端升级后开放。"
        type="warning"
        :closable="false"
        show-icon
      />
      <section class="recycle-policy">
        <div class="recycle-policy-copy">
          <strong>已分配线索超时回收</strong>
          <p>每 15 分钟检查一次；有近期跟进或正在处理的手机派发时会跳过。默认关闭。</p>
        </div>
        <div class="recycle-policy-controls">
          <el-switch
            v-model="recycleDraft.enabled"
            active-text="开启"
            inactive-text="关闭"
            :disabled="!recycleConfigAvailable || autoSaving"
          />
          <span>连续</span>
          <el-select
            v-model="recycleDraft.afterDays"
            class="recycle-days-select"
            :disabled="!recycleConfigAvailable || autoSaving"
          >
            <el-option
              v-for="days in recycleDaysOptions"
              :key="days"
              :label="`${days} 天`"
              :value="days"
            />
          </el-select>
          <span>未更新后回收到公共池</span>
          <el-button
            type="primary"
            plain
            :loading="autoSaving"
            :disabled="
              !recycleConfigAvailable ||
              autoSaving ||
              (recycleDraft.enabled === autoConfig.recycleEnabled &&
                recycleDraft.afterDays === autoConfig.recycleAfterDays)
            "
            @click="saveRecyclePolicy"
            >保存回收设置</el-button
          >
        </div>
      </section>
      <div class="rules-toolbar">
        <span>每个租户同时只能启用一条新线索自动分配规则。</span>
        <el-button type="primary" @click="openCreateRule">新建规则</el-button>
      </div>
      <el-table v-loading="rulesLoading" :data="assignmentRules" row-key="id">
        <el-table-column label="规则名称" prop="ruleName" min-width="135" />
        <el-table-column label="成员顺序" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.memberNames.join(' → ') }}</template>
        </el-table-column>
        <el-table-column label="下次轮到" width="95">
          <template #default="{ row }">{{
            row.memberNames[row.cursorIndex % row.memberNames.length] || '—'
          }}</template>
        </el-table-column>
        <el-table-column label="新线索自动分配" width="150">
          <template #default="{ row }">
            <el-tag
              v-if="autoConfig.ruleId === row.id && row.enabled"
              type="success"
              effect="light"
            >
              自动执行
            </el-tag>
            <el-tag v-else-if="autoConfig.ruleId === row.id" type="warning" effect="light">
              规则停用，已暂停
            </el-tag>
            <el-tag v-else-if="!autoConfigAvailable" type="warning" effect="light">不可用</el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="75">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" effect="light">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="185" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditRule(row)">编辑</el-button>
            <el-button
              link
              :disabled="
                !autoConfigAvailable || autoSaving || (!row.enabled && autoConfig.ruleId !== row.id)
              "
              @click="toggleAutoAssignment(row)"
              >{{ autoConfig.ruleId === row.id ? '停用自动' : '设为自动' }}</el-button
            >
            <el-button link @click="toggleRule(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="还没有分配规则" /></template>
      </el-table>
      <el-pagination
        v-if="ruleTotal > rulePageSize"
        v-model:current-page="rulePageNo"
        :page-size="rulePageSize"
        :total="ruleTotal"
        layout="prev, pager, next"
        @change="loadRules"
      />
    </el-drawer>

    <el-dialog
      v-model="ruleDialogVisible"
      :title="ruleForm.id ? '编辑分配规则' : '新建分配规则'"
      width="520px"
    >
      <el-form ref="ruleFormRef" :model="ruleForm" :rules="ruleFormRules" label-position="top">
        <el-form-item label="规则名称" prop="ruleName">
          <el-input
            v-model="ruleForm.ruleName"
            maxlength="100"
            show-word-limit
            placeholder="例如：华东销售组轮转"
          />
        </el-form-item>
        <el-form-item label="成员顺序" prop="memberIds">
          <el-select
            v-model="ruleForm.memberIds"
            class="fill"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            :multiple-limit="20"
            placeholder="按点击选择的顺序轮转，至少两位成员"
          >
            <el-option
              v-for="item in users"
              :key="item.id"
              :label="item.nickname"
              :value="String(item.id)"
            />
          </el-select>
          <draggable
            v-if="orderedRuleMembers.length"
            v-model="orderedRuleMembers"
            class="member-order-list"
            item-key="id"
            handle=".member-order-handle"
            ghost-class="member-order-ghost"
            aria-label="轮转成员顺序"
          >
            <template #item="{ element, index }">
              <div class="member-order-item">
                <span class="member-order-handle" title="拖动调整顺序" aria-label="拖动调整顺序"
                  >⠿</span
                >
                <span class="member-order-index">{{ index + 1 }}</span>
                <strong class="member-order-name">{{ element.nickname }}</strong>
                <el-button link :disabled="index === 0" @click="moveRuleMember(index, -1)">
                  上移
                </el-button>
                <el-button
                  link
                  :disabled="index === orderedRuleMembers.length - 1"
                  @click="moveRuleMember(index, 1)"
                >
                  下移
                </el-button>
              </div>
            </template>
          </draggable>
          <small class="form-hint">拖动或使用上移 / 下移调整轮转顺序，保存后生效。</small>
        </el-form-item>
        <el-form-item label="规则状态">
          <el-switch v-model="ruleForm.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRule">保存规则</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ruleApplyDialogVisible" title="按分配规则执行" width="680px">
      <el-alert
        :title="`已选 ${selectedLeads.length} 条线索`"
        description="预览使用规则当前轮转位置；确认后每次尝试都会推进轮转游标，单条状态冲突会单独返回。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form label-position="top" class="batch-form">
        <el-form-item label="分配规则">
          <el-select
            v-model="selectedRuleId"
            class="fill"
            placeholder="选择启用规则"
            @change="refreshRulePreview"
          >
            <el-option
              v-for="item in enabledRules"
              :key="item.id"
              :label="item.ruleName"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分配原因">
          <el-input
            v-model="ruleApplyReason"
            maxlength="200"
            show-word-limit
            placeholder="例如：按团队轮转规则分配"
          />
        </el-form-item>
      </el-form>
      <div class="round-robin-preview">
        <div class="preview-heading">
          <div class="preview-title">本次预览</div>
          <el-button
            link
            type="primary"
            :disabled="!selectedRuleId"
            :loading="rulePreviewLoading"
            @click="refreshRulePreview"
          >
            刷新预览
          </el-button>
        </div>
        <el-table :data="rulePreviewRows" size="small" height="220">
          <el-table-column label="线索" min-width="240">
            <template #default="{ row }">
              {{ leadById(row.leadId)?.name || row.leadId }}
              <small>{{ leadById(row.leadId)?.phoneDisplay }}</small>
            </template>
          </el-table-column>
          <el-table-column label="分配给" min-width="150" prop="toUserName" />
          <el-table-column label="顺序" width="80">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="ruleApplyDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!rulePreviewRows.length"
          @click="applyRule"
        >
          确认分配
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormRules,
  type TableInstance
} from 'element-plus'
import { useRoute } from 'vue-router'
import * as LeadApi from '@/api/callphone/lead'
import * as PreviewStore from '@/api/callphone/preview-store'
import * as UserApi from '@/api/system/user'
import { parseCallPhoneDateTime } from '@/utils/callphone/time'
import draggable from 'vuedraggable'

defineOptions({ name: 'CallPhoneLeadAssignment' })
const route = useRoute(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
type Member = { id: string | number; nickname: string }
const loading = ref(false),
  saving = ref(false),
  dialogVisible = ref(false),
  batchDialogVisible = ref(false),
  roundRobinDialogVisible = ref(false),
  historyVisible = ref(false),
  rulesDrawerVisible = ref(false),
  rulesLoading = ref(false),
  ruleDialogVisible = ref(false),
  ruleApplyDialogVisible = ref(false),
  rulePreviewLoading = ref(false),
  historyLoading = ref(false),
  error = ref('')
const rows = ref<LeadApi.LeadVO[]>([]),
  total = ref(0),
  selectedLeads = ref<LeadApi.LeadVO[]>([]),
  users = ref<Member[]>([]),
  activeLead = ref<LeadApi.LeadVO>(),
  historyLead = ref<LeadApi.LeadVO>(),
  historyRows = ref<LeadApi.LeadAssignmentHistoryVO[]>([]),
  assignmentRules = ref<LeadApi.LeadAssignmentRuleVO[]>([]),
  autoConfig = ref<LeadApi.LeadAssignmentAutoConfigVO>({
    version: 0,
    recycleEnabled: false,
    recycleAfterDays: 7
  }),
  autoConfigAvailable = ref(true),
  recycleConfigAvailable = ref(false),
  autoSaving = ref(false),
  rulePreviewRows = ref<LeadApi.LeadAssignmentRulePreviewVO[]>([]),
  historyTotal = ref(0),
  ruleTotal = ref(0),
  rulePageNo = ref(1),
  rulePageSize = 10,
  selectedRuleId = ref(''),
  ruleApplyExpectedVersion = ref(0),
  ruleApplyReason = ref(''),
  tableRef = ref<TableInstance>(),
  formRef = ref<FormInstance>()
const historyQuery = reactive({ pageNo: 1, pageSize: 10 })
const query = reactive({
  pageNo: 1,
  pageSize: 10,
  ownerUserId: '',
  status: '' as '' | LeadApi.LeadVO['status'],
  query: ''
})
const form = reactive({ toUserId: '', reason: '' })
const batchForm = reactive({ toUserId: '', reason: '' })
const batchFormRef = ref<FormInstance>()
const roundRobinForm = reactive({ toUserIds: [] as string[], reason: '' })
const roundRobinFormRef = ref<FormInstance>()
const recycleDraft = reactive({ enabled: false, afterDays: 7 })
const recycleDaysOptions = [1, 3, 7, 14, 30, 60, 90]
const ruleForm = reactive<{
  id?: string
  expectedVersion?: number
  ruleName: string
  memberIds: string[]
  enabled: boolean
}>({ ruleName: '', memberIds: [], enabled: true })
const orderedRuleMembers = computed<Member[]>({
  get: () =>
    ruleForm.memberIds.map(
      (id) =>
        users.value.find((user) => String(user.id) === id) || { id, nickname: `不可用成员 (${id})` }
    ),
  set: (members) => {
    ruleForm.memberIds = members.map((member) => String(member.id))
  }
})
const ruleFormRef = ref<FormInstance>()
const enabledRules = computed(() => assignmentRules.value.filter((item) => item.enabled))
const ruleFormRules: FormRules = {
  ruleName: [{ required: true, message: '请填写规则名称', trigger: 'blur' }],
  memberIds: [
    { required: true, type: 'array', min: 2, message: '请选择至少两位成员', trigger: 'change' }
  ]
}
const roundRobinRules: FormRules = {
  toUserIds: [
    { required: true, type: 'array', min: 2, message: '请选择至少两位成员', trigger: 'change' }
  ],
  reason: [{ required: true, message: '请填写分配原因', trigger: 'blur' }]
}
const roundRobinPlan = computed(() => {
  const selectedIds = new Set(selectedLeads.value.map((lead) => lead.id))
  const leads = rows.value.filter((lead) => selectedIds.has(lead.id))
  return leads.map((lead, index) => ({
    lead,
    index,
    user: users.value.find(
      (member) =>
        String(member.id) === roundRobinForm.toUserIds[index % roundRobinForm.toUserIds.length]
    )
  }))
})
const rules: FormRules = {
  toUserId: [{ required: true, message: '请选择负责人', trigger: 'change' }],
  reason: [{ required: true, message: '请填写分配原因', trigger: 'blur' }]
}
const previewUsers: Member[] = [
  { id: 'demo-user', nickname: '我' },
  { id: 'demo-amy', nickname: '林晓' },
  { id: 'demo-lee', nickname: '陈立' }
]
async function load() {
  loading.value = true
  error.value = ''
  tableRef.value?.clearSelection()
  selectedLeads.value = []
  try {
    const params = {
      ...query,
      status: query.status || undefined,
      ownerUserId: query.ownerUserId || undefined,
      query: query.query || undefined
    }
    const result = previewMode
      ? PreviewStore.previewLeadAssignmentPage(params)
      : await LeadApi.getLeadAssignmentPage(params)
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.message || '线索加载失败'
  } finally {
    loading.value = false
  }
}
async function loadRules() {
  rulesLoading.value = true
  try {
    const result = previewMode
      ? {
          list: PreviewStore.previewLeadAssignmentRules(),
          total: PreviewStore.previewLeadAssignmentRules().length
        }
      : await LeadApi.getLeadAssignmentRules({ pageNo: rulePageNo.value, pageSize: rulePageSize })
    assignmentRules.value = result.list || []
    ruleTotal.value = result.total || 0
    try {
      const loadedConfig = previewMode
        ? PreviewStore.previewLeadAssignmentAutoConfig()
        : await LeadApi.getLeadAssignmentAutoConfig()
      recycleConfigAvailable.value =
        typeof loadedConfig.recycleEnabled === 'boolean' &&
        Number.isInteger(loadedConfig.recycleAfterDays) &&
        loadedConfig.recycleAfterDays >= 1 &&
        loadedConfig.recycleAfterDays <= 90
      autoConfig.value = normalizeAutoConfig(loadedConfig, autoConfig.value)
      recycleDraft.enabled = autoConfig.value.recycleEnabled
      recycleDraft.afterDays = autoConfig.value.recycleAfterDays
      autoConfigAvailable.value = true
    } catch {
      autoConfig.value = { version: 0, recycleEnabled: false, recycleAfterDays: 7 }
      recycleConfigAvailable.value = false
      recycleDraft.enabled = false
      recycleDraft.afterDays = 7
      autoConfigAvailable.value = false
    }
  } catch (e: any) {
    assignmentRules.value = []
    ruleTotal.value = 0
    autoConfigAvailable.value = false
    recycleConfigAvailable.value = false
    ElMessage.error(e?.message || '分配规则加载失败')
  } finally {
    rulesLoading.value = false
  }
}
async function toggleAutoAssignment(rule: LeadApi.LeadAssignmentRuleVO) {
  if (!rule.enabled && autoConfig.value.ruleId !== rule.id) return
  if (autoConfig.value.ruleId && autoConfig.value.ruleId !== rule.id) {
    try {
      await ElMessageBox.confirm(
        `启用“${rule.ruleName}”后，新建线索将按它的成员顺序自动分配；原自动规则将停止。`,
        '切换新线索自动分配规则',
        { confirmButtonText: '确认切换', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
  }
  autoSaving.value = true
  try {
    const ruleId = autoConfig.value.ruleId === rule.id ? undefined : rule.id
    const saved = previewMode
      ? PreviewStore.savePreviewLeadAssignmentAutoConfig({
          ruleId,
          recycleEnabled: autoConfig.value.recycleEnabled,
          recycleAfterDays: autoConfig.value.recycleAfterDays,
          expectedVersion: autoConfig.value.version
        })
      : await LeadApi.saveLeadAssignmentAutoConfig({
          ruleId,
          recycleEnabled: autoConfig.value.recycleEnabled,
          recycleAfterDays: autoConfig.value.recycleAfterDays,
          expectedVersion: autoConfig.value.version
        })
    autoConfig.value = normalizeAutoConfig(saved, autoConfig.value)
    recycleDraft.enabled = autoConfig.value.recycleEnabled
    recycleDraft.afterDays = autoConfig.value.recycleAfterDays
    ElMessage.success(ruleId ? '新线索自动分配已启用' : '新线索自动分配已停用')
  } catch (e: any) {
    ElMessage.error(e?.message || '自动分配设置失败')
    await loadRules()
  } finally {
    autoSaving.value = false
  }
}
function normalizeAutoConfig(
  config: Partial<LeadApi.LeadAssignmentAutoConfigVO>,
  fallback: LeadApi.LeadAssignmentAutoConfigVO
): LeadApi.LeadAssignmentAutoConfigVO {
  return {
    ruleId: config.ruleId,
    version: config.version ?? fallback.version,
    recycleEnabled:
      typeof config.recycleEnabled === 'boolean' ? config.recycleEnabled : fallback.recycleEnabled,
    recycleAfterDays:
      Number.isInteger(config.recycleAfterDays) && config.recycleAfterDays! >= 1
        ? config.recycleAfterDays!
        : fallback.recycleAfterDays
  }
}
async function saveRecyclePolicy() {
  autoSaving.value = true
  try {
    const input = {
      ruleId: autoConfig.value.ruleId || undefined,
      recycleEnabled: recycleDraft.enabled,
      recycleAfterDays: recycleDraft.afterDays,
      expectedVersion: autoConfig.value.version
    }
    const saved = previewMode
      ? PreviewStore.savePreviewLeadAssignmentAutoConfig(input)
      : await LeadApi.saveLeadAssignmentAutoConfig(input)
    autoConfig.value = normalizeAutoConfig(saved, autoConfig.value)
    recycleConfigAvailable.value = true
    recycleDraft.enabled = autoConfig.value.recycleEnabled
    recycleDraft.afterDays = autoConfig.value.recycleAfterDays
    ElMessage.success(recycleDraft.enabled ? '超时自动回收已开启' : '超时自动回收已关闭')
  } catch (e: any) {
    ElMessage.error(e?.message || '回收设置保存失败')
    await loadRules()
  } finally {
    autoSaving.value = false
  }
}
function handleSelectionChange(selection: LeadApi.LeadVO[]) {
  selectedLeads.value = selection
}
async function openHistory(row: LeadApi.LeadVO) {
  historyLead.value = row
  historyQuery.pageNo = 1
  historyVisible.value = true
  await loadHistory()
}
async function loadHistory() {
  if (!historyLead.value) return
  historyLoading.value = true
  try {
    const params = { ...historyQuery, leadId: historyLead.value.id }
    const result = previewMode
      ? PreviewStore.previewLeadAssignmentHistory(params)
      : await LeadApi.getLeadAssignmentHistory(params)
    historyRows.value = result.list || []
    historyTotal.value = result.total || 0
  } catch (e: any) {
    historyRows.value = []
    historyTotal.value = 0
    ElMessage.error(e?.message || '流转记录加载失败')
  } finally {
    historyLoading.value = false
  }
}
function actionLabel(action: string) {
  const labels: Record<string, string> = {
    assign: '分配线索',
    reassign: '改派线索',
    recycle: '回收到公共池',
    claim: '成员领取',
    convert: '转为客户',
    archive: '归档线索',
    restore: '恢复线索'
  }
  return labels[action] || '线索状态变更'
}
function reset() {
  query.pageNo = 1
  query.ownerUserId = ''
  query.status = ''
  query.query = ''
  void load()
}
function openAssign(row: LeadApi.LeadVO) {
  activeLead.value = row
  form.toUserId = row.ownerUserId || ''
  form.reason = row.status === 'new' ? '待分配线索' : ''
  dialogVisible.value = true
}
function openBatchAssign() {
  if (!selectedLeads.value.length) return
  batchForm.toUserId = ''
  batchForm.reason = ''
  batchDialogVisible.value = true
}
function openRoundRobin() {
  if (!selectedLeads.value.length || users.value.length < 2) return
  roundRobinForm.toUserIds = []
  roundRobinForm.reason = ''
  roundRobinDialogVisible.value = true
}
async function openRules() {
  rulesDrawerVisible.value = true
  await loadRules()
}
function resetRuleForm() {
  ruleForm.id = undefined
  ruleForm.expectedVersion = undefined
  ruleForm.ruleName = ''
  ruleForm.memberIds = []
  ruleForm.enabled = true
}
function openCreateRule() {
  resetRuleForm()
  ruleDialogVisible.value = true
}
function openEditRule(rule: LeadApi.LeadAssignmentRuleVO) {
  ruleForm.id = rule.id
  ruleForm.expectedVersion = rule.version
  ruleForm.ruleName = rule.ruleName
  ruleForm.memberIds = rule.memberIds.map(String)
  ruleForm.enabled = rule.enabled
  ruleDialogVisible.value = true
}
function moveRuleMember(index: number, offset: -1 | 1) {
  const targetIndex = index + offset
  if (targetIndex < 0 || targetIndex >= orderedRuleMembers.value.length) return
  const members = [...orderedRuleMembers.value]
  const [member] = members.splice(index, 1)
  members.splice(targetIndex, 0, member)
  orderedRuleMembers.value = members
}
async function saveRule() {
  await ruleFormRef.value?.validate()
  if (new Set(ruleForm.memberIds).size !== ruleForm.memberIds.length)
    return ElMessage.error('成员不能重复')
  const members = ruleForm.memberIds
    .map((id) => users.value.find((user) => String(user.id) === id))
    .filter((user): user is Member => Boolean(user))
  if (members.length !== ruleForm.memberIds.length)
    return ElMessage.error('部分成员已不可用，请重新选择')
  saving.value = true
  try {
    const input = {
      id: ruleForm.id,
      expectedVersion: ruleForm.expectedVersion,
      ruleName: ruleForm.ruleName.trim(),
      enabled: ruleForm.enabled,
      members: members.map((user) => ({ id: String(user.id), nickname: user.nickname }))
    }
    if (previewMode) PreviewStore.savePreviewLeadAssignmentRule(input)
    else {
      await LeadApi.saveLeadAssignmentRule({
        id: input.id,
        expectedVersion: input.expectedVersion,
        ruleName: input.ruleName,
        enabled: input.enabled,
        memberIds: members.map((user) => user.id)
      })
    }
    ElMessage.success('分配规则已保存')
    ruleDialogVisible.value = false
    await loadRules()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存规则失败')
  } finally {
    saving.value = false
  }
}
async function toggleRule(rule: LeadApi.LeadAssignmentRuleVO) {
  try {
    const nextEnabled = !rule.enabled
    await ElMessageBox.confirm(
      nextEnabled
        ? `启用“${rule.ruleName}”后可用于分配。`
        : `停用“${rule.ruleName}”后不能用于分配。`,
      nextEnabled ? '启用分配规则' : '停用分配规则',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
    const members = rule.memberIds
      .map((id) => users.value.find((user) => String(user.id) === String(id)))
      .filter((user): user is Member => Boolean(user))
    const input = {
      id: rule.id,
      expectedVersion: rule.version,
      ruleName: rule.ruleName,
      enabled: nextEnabled,
      members: members.map((user) => ({ id: String(user.id), nickname: user.nickname }))
    }
    if (previewMode) PreviewStore.savePreviewLeadAssignmentRule(input)
    else
      await LeadApi.saveLeadAssignmentRule({
        id: rule.id,
        expectedVersion: rule.version,
        ruleName: rule.ruleName,
        enabled: nextEnabled,
        memberIds: rule.memberIds
      })
    ElMessage.success(nextEnabled ? '规则已启用' : '规则已停用')
    await loadRules()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '更新规则状态失败')
  }
}
async function openRuleApply() {
  if (!selectedLeads.value.length) return
  if (!assignmentRules.value.length) await loadRules()
  if (!enabledRules.value.length) {
    ElMessage.warning('请先创建并启用一条分配规则')
    return
  }
  selectedRuleId.value = enabledRules.value[0].id
  ruleApplyReason.value = '按分配规则轮转'
  rulePreviewRows.value = []
  ruleApplyDialogVisible.value = true
  await refreshRulePreview()
}
async function refreshRulePreview() {
  const rule = enabledRules.value.find((item) => item.id === selectedRuleId.value)
  if (!rule) {
    rulePreviewRows.value = []
    return
  }
  rulePreviewLoading.value = true
  try {
    const leadIds = selectedLeads.value.map((lead) => lead.id)
    ruleApplyExpectedVersion.value = rule.version
    rulePreviewRows.value = previewMode
      ? PreviewStore.previewLeadAssignmentRule(rule.id, leadIds)
      : await LeadApi.previewLeadAssignmentRule({
          ruleId: rule.id,
          expectedVersion: rule.version,
          leadIds
        })
  } catch (e: any) {
    rulePreviewRows.value = []
    ElMessage.error(e?.message || '分配预览失败')
  } finally {
    rulePreviewLoading.value = false
  }
}
function leadById(id: string) {
  return selectedLeads.value.find((lead) => lead.id === id)
}
async function applyRule() {
  const leadIds = selectedLeads.value.map((lead) => lead.id)
  if (!selectedRuleId.value || !leadIds.length || !ruleApplyReason.value.trim()) {
    ElMessage.warning('请选择规则并填写分配原因')
    return
  }
  if (rulePreviewRows.value.length !== leadIds.length) {
    ElMessage.warning('请先刷新完整预览')
    return
  }
  saving.value = true
  try {
    const results = previewMode
      ? PreviewStore.applyPreviewLeadAssignmentRule(
          selectedRuleId.value,
          ruleApplyExpectedVersion.value,
          leadIds,
          ruleApplyReason.value.trim()
        )
      : (
          await LeadApi.applyLeadAssignmentRule({
            ruleId: selectedRuleId.value,
            expectedVersion: ruleApplyExpectedVersion.value,
            leadIds,
            reason: ruleApplyReason.value.trim()
          })
        ).results
    if (results.length !== leadIds.length) throw new Error('分配结果不完整，请刷新页面后重试')
    const failed = results.filter((item) => !item.success)
    if (failed.length) {
      const selectedById = new Map(selectedLeads.value.map((lead) => [lead.id, lead]))
      const labels: Record<string, string> = {
        not_found: '记录已不存在',
        not_assignable: '当前状态不可分配',
        conflict: '记录被其他操作更新'
      }
      await ElMessageBox.alert(
        `已分配 ${results.length - failed.length} 条，${failed.length} 条未处理。\n${failed
          .map(
            (item) =>
              `${selectedById.get(item.id)?.name || item.id}：${labels[item.outcome] || '未处理'}`
          )
          .join('\n')}`,
        '分配结果',
        { confirmButtonText: '知道了', type: 'warning' }
      )
    } else ElMessage.success(`已按规则分配 ${results.length} 条线索`)
    ruleApplyDialogVisible.value = false
    selectedLeads.value = []
    await Promise.all([load(), loadRules()])
  } catch (e: any) {
    ElMessage.error(e?.message || '按规则分配失败')
  } finally {
    saving.value = false
  }
}
async function saveAssign() {
  await formRef.value?.validate()
  if (!activeLead.value) return
  saving.value = true
  try {
    const user = users.value.find((item) => String(item.id) === form.toUserId)
    if (!user) throw new Error('所选成员不可用，请刷新后重试')
    if (previewMode) {
      if (
        !PreviewStore.assignPreviewLead(
          activeLead.value.id,
          {
            id: String(user.id),
            nickname: user.nickname
          },
          form.reason.trim()
        )
      )
        throw new Error('分配失败，请刷新列表')
    } else {
      const ok = await LeadApi.assignLead({
        id: activeLead.value.id,
        toUserId: user.id,
        reason: form.reason.trim()
      })
      if (!ok) throw new Error('线索状态已变化，请刷新后重试')
    }
    ElMessage.success('线索已分配')
    dialogVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '分配失败')
  } finally {
    saving.value = false
  }
}
async function saveBatchAssign() {
  await batchFormRef.value?.validate()
  const selectedIds = selectedLeads.value.map((lead) => lead.id)
  if (!selectedIds.length) return
  saving.value = true
  try {
    const user = users.value.find((item) => String(item.id) === batchForm.toUserId)
    if (!user) throw new Error('所选成员不可用，请刷新后重试')
    const results = previewMode
      ? PreviewStore.assignPreviewLeads(
          selectedIds,
          {
            id: String(user.id),
            nickname: user.nickname
          },
          batchForm.reason.trim()
        )
      : await LeadApi.assignLeadsBatch({
          leadIds: selectedIds,
          toUserId: user.id,
          reason: batchForm.reason.trim()
        })
    const succeeded = results.filter((result) => result.success).length
    const failedRows = results.filter((result) => !result.success)
    if (failedRows.length) {
      const selectedById = new Map(selectedLeads.value.map((lead) => [lead.id, lead]))
      const outcomeLabel: Record<string, string> = {
        not_found: '记录已不存在',
        not_assignable: '当前状态不可分配',
        conflict: '记录被其他操作更新'
      }
      const lines = failedRows.map((result) => {
        const lead = selectedById.get(result.id)
        return `${lead?.name || result.id}：${outcomeLabel[result.outcome] || '未处理'}`
      })
      await ElMessageBox.alert(
        `已处理 ${succeeded} 条，${failedRows.length} 条未处理。\n${lines.join('\n')}`,
        '批量分配结果',
        { confirmButtonText: '知道了', type: 'warning' }
      )
    } else ElMessage.success(`已处理 ${succeeded} 条线索`)
    batchDialogVisible.value = false
    selectedLeads.value = []
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '批量分配失败')
  } finally {
    saving.value = false
  }
}
async function saveRoundRobin() {
  await roundRobinFormRef.value?.validate()
  const selectedIds = roundRobinPlan.value.map((item) => item.lead.id)
  const recipients = roundRobinForm.toUserIds
    .map((id) => users.value.find((user) => String(user.id) === id))
    .filter((user): user is Member => Boolean(user))
  if (!selectedIds.length || recipients.length !== roundRobinForm.toUserIds.length) return
  saving.value = true
  try {
    const results = previewMode
      ? PreviewStore.assignPreviewLeadsRoundRobin(
          selectedIds,
          recipients.map((user) => ({ id: String(user.id), nickname: user.nickname })),
          roundRobinForm.reason.trim()
        )
      : await LeadApi.assignLeadsRoundRobin({
          leadIds: selectedIds,
          toUserIds: recipients.map((user) => user.id),
          reason: roundRobinForm.reason.trim()
        })
    if (results.length !== selectedIds.length) throw new Error('分配结果不完整，请刷新页面后重试')
    const succeeded = results.filter((result) => result.success).length
    const failedRows = results.filter((result) => !result.success)
    const succeededByUser = new Map<string, number>()
    results
      .filter((result) => result.success)
      .forEach((result) => {
        const targetId = String(result.toUserId)
        succeededByUser.set(targetId, (succeededByUser.get(targetId) || 0) + 1)
      })
    const distribution = recipients
      .map((user) => `${user.nickname} ${succeededByUser.get(String(user.id)) || 0} 条`)
      .join('；')
    if (failedRows.length) {
      const selectedById = new Map(roundRobinPlan.value.map((item) => [item.lead.id, item.lead]))
      const outcomeLabel: Record<string, string> = {
        not_found: '记录已不存在',
        not_assignable: '当前状态不可分配',
        conflict: '记录被其他操作更新'
      }
      const lines = failedRows.map((result) => {
        const lead = selectedById.get(result.id)
        return `${lead?.name || result.id}：${outcomeLabel[result.outcome] || '未处理'}`
      })
      await ElMessageBox.alert(
        `已分配 ${succeeded} 条（${distribution}），${failedRows.length} 条未处理。\n${lines.join('\n')}`,
        '轮转分配结果',
        { confirmButtonText: '知道了', type: 'warning' }
      )
    } else {
      ElMessage.success(`已分配 ${succeeded} 条线索：${distribution}`)
    }
    roundRobinDialogVisible.value = false
    selectedLeads.value = []
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '轮转分配失败')
  } finally {
    saving.value = false
  }
}
async function recycle(row: LeadApi.LeadVO) {
  try {
    const { value } = await ElMessageBox.prompt(`请输入回收“${row.name}”的原因`, '回收线索', {
      inputPlaceholder: '例如：成员离职或超期未跟进',
      inputValidator: (value) => Boolean(value.trim()) || '回收原因不能为空',
      inputErrorMessage: '回收原因不能为空'
    })
    if (previewMode) {
      if (!PreviewStore.recyclePreviewLead(row.id, value.trim()))
        throw new Error('线索状态已变化，请刷新后重试')
    } else {
      const ok = await LeadApi.recycleLead({ id: row.id, reason: value.trim() })
      if (!ok) throw new Error('线索状态已变化，请刷新后重试')
    }
    ElMessage.success('线索已回收到公共池')
    await load()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '回收失败')
  }
}
function sourceLabel(code?: string) {
  return (
    (
      {
        manual: '手工录入',
        web_form: '网站表单',
        referral: '客户转介绍',
        channel: '渠道获客'
      } as Record<string, string>
    )[code || ''] ||
    code ||
    '—'
  )
}
function formatTime(value?: string) {
  return value ? parseCallPhoneDateTime(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}
onMounted(async () => {
  try {
    users.value = previewMode
      ? previewUsers
      : (await UserApi.getSimpleUserList()).map((user) => ({
          id: user.id,
          nickname: user.nickname
        }))
  } catch {
    users.value = []
  }
  await load()
  await loadRules()
})
</script>

<style scoped>
.lead-assignment-page {
  padding: 20px;
}

.preview-banner {
  margin-bottom: 14px;
}

.page-panel {
  padding: 22px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 0;
  font-size: 20px;
  color: var(--el-text-color-primary);
}

.page-heading p,
.privacy-note {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.page-heading p {
  margin: 7px 0 0;
}

.filter-bar {
  margin-bottom: 8px;
}

.selection-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  color: var(--el-text-color-secondary);
}

.batch-form {
  margin-top: 18px;
}

.round-robin-preview {
  margin-top: 12px;
}

.auto-rule-notice {
  margin-bottom: 14px;
}

.recycle-policy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  margin-bottom: 18px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.recycle-policy-copy {
  min-width: 210px;
}

.recycle-policy-copy strong {
  color: var(--el-text-color-primary);
}

.recycle-policy-copy p {
  margin: 6px 0 0;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.recycle-policy-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.recycle-days-select {
  width: 100px;
}

.rules-toolbar,
.preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  color: var(--el-text-color-secondary);
}

.preview-heading {
  margin-bottom: 4px;
}

.form-hint {
  display: block;
  margin-top: 6px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.member-order-list {
  display: grid;
  width: 100%;
  gap: 6px;
  margin-top: 10px;
}

.member-order-item {
  display: flex;
  min-height: 38px;
  padding: 4px 8px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  align-items: center;
  gap: 8px;
}

.member-order-handle {
  font-size: 16px;
  color: var(--el-text-color-secondary);
  cursor: grab;
  user-select: none;
}

.member-order-handle:active {
  cursor: grabbing;
}

.member-order-index {
  display: inline-flex;
  width: 22px;
  height: 22px;
  font-size: 12px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: 50%;
  align-items: center;
  justify-content: center;
}

.member-order-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.member-order-ghost) {
  opacity: 0.5;
}

.preview-title {
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

:global(.round-robin-dialog.el-dialog) {
  margin-top: 3vh !important;
}

:global(.round-robin-dialog .el-dialog__body) {
  max-height: calc(100vh - 230px);
  overflow-y: auto;
}

.subline {
  display: block;
  margin-top: 4px;
  color: var(--el-text-color-secondary);
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  color: var(--el-text-color-secondary);
}

.privacy-note {
  margin-top: 18px;
}

.fill {
  width: 100%;
}

.history-lead {
  display: flex;
  padding: 14px 16px;
  margin-bottom: 24px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  flex-direction: column;
  gap: 5px;
}

.history-lead span,
.history-meta {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.history-title {
  margin-bottom: 5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.history-route {
  color: var(--el-color-primary);
}

.history-route span {
  padding: 0 5px;
  color: var(--el-text-color-secondary);
}

.history-reason {
  padding: 8px 10px;
  margin-top: 7px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  overflow-wrap: anywhere;
}

.history-timeline {
  padding-left: 4px;
}
</style>
