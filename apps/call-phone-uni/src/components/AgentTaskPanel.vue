<template>
  <view class="agent-panel">
    <view class="agent-entry" role="button" aria-label="资料任务" @tap="toggle">
      <text>✦ 资料任务{{ taskState.items.length ? ` · ${taskState.items.length}` : '' }}</text>
      <text class="muted">{{ expanded ? '收起' : '读取资料，生成跟进建议' }}</text>
    </view>
    <view v-if="expanded" class="agent-body">
      <text v-if="taskState.disabled" class="agent-note">演示模式暂不执行资料任务。连接真实服务后，可提交资料并确认创建跟进待办。</text>
      <template v-else>
        <text class="agent-note">任务可在离开页面后继续。仅查询所选客户，创建跟进待办前会请你确认。</text>
        <view class="agent-form">
          <picker :range="customers" range-key="name" :value="customerIndex" @change="selectCustomer">
            <view class="agent-field">{{ selectedCustomer ? `客户：${selectedCustomer.name}` : '选择可访问的客户' }} <text class="muted">⌄</text></view>
          </picker>
          <view class="agent-links">
            <button size="mini" :disabled="customerLoading" @tap="loadCustomers(false)">{{ customers.length ? '刷新客户' : '加载客户' }}</button>
            <button v-if="moreCustomers" size="mini" :disabled="customerLoading" @tap="loadCustomers(true)">更多客户</button>
          </view>
          <text v-if="customerError" class="agent-error">{{ customerError }}</text>
          <view class="agent-links"><button size="mini" @tap="pick">选择 .txt / .md</button><button size="mini" @tap="pasteMode = !pasteMode">{{ pasteMode ? '收起粘贴' : '粘贴资料' }}</button></view>
          <view v-if="pasteMode" class="paste-fields">
            <input v-model="pasteName" class="agent-field" :maxlength="120" placeholder="资料名称，例如 沟通记录.txt" />
            <textarea v-model="pasteContent" class="agent-textarea" :maxlength="65536" :adjust-position="false" placeholder="粘贴资料正文（作为文本资料提交，最多 64 KiB）" />
            <button size="mini" @tap="usePasted">使用这份粘贴资料</button>
          </view>
          <view v-if="attachment" class="attachment">
            <view class="agent-links"><text>{{ attachment.name }} · {{ utf8Size(attachment.content) }} 字节{{ attachmentSource === 'paste' ? ' · 粘贴资料' : ' · 本地文件' }}</text><text role="button" @tap="attachment = undefined">移除</text></view>
            <text class="attachment-preview">{{ attachment.content.slice(0, 180) }}{{ attachment.content.length > 180 ? '…' : '' }}</text>
          </view>
          <textarea v-model="prompt" class="agent-textarea instruction" :maxlength="2000" :adjust-position="false" placeholder="希望助手做什么？" />
          <button class="agent-submit" size="mini" :disabled="taskState.submitting || !attachment || !selectedCustomer || !conversationId" @tap="submit">{{ taskState.submitting ? '正在交办…' : '交给助手' }}</button>
        </view>
        <text v-if="localError || taskState.error" class="agent-error">{{ localError || taskState.error }}</text>
        <view class="agent-links"><text v-if="taskState.loading" class="muted">正在同步任务…</text><text role="button" @tap="aiTasks.refresh()">刷新进度</text></view>
        <view v-for="task in taskState.items" :key="task.id" class="agent-card">
          <view class="agent-card-heading"><text>客户资料任务</text><text class="agent-status">{{ statusLabels[task.status] }}</text></view>
          <text class="agent-summary">{{ task.summary || '助手正在准备处理资料' }}</text>
          <view v-for="event in task.events" :key="event.sequence" class="agent-event"><text>· {{ event.message }}</text></view>
          <text v-if="task.error_message" class="agent-error">{{ task.error_message }}</text>
          <view v-if="task.status === 'awaiting_confirmation' && task.proposal && !taskNeedsReceipt(task)" class="agent-proposal">
            <text class="proposal-heading">请确认创建跟进待办</text>
            <text>客户：{{ customerName(task.customer_id) }}</text>
            <text>标题：{{ task.proposal.title }}</text><text>内容：{{ task.proposal.content }}</text><text>计划时间：{{ dueTime(task.proposal.due_at) }}</text>
            <button size="mini" :disabled="taskState.busyIds.includes(task.id)" @tap="confirm(task)">确认创建待办</button>
          </view>
          <text v-if="task.follow_up_task_id" class="agent-note">已创建跟进待办 · {{ task.follow_up_task_id }}</text>
          <view v-if="taskNeedsReceipt(task)" class="agent-proposal">
            <text>跟进待办已创建，结果正在同步。核对不会再次创建待办，取消任务也不会撤回已创建的待办。</text>
            <button size="mini" :disabled="taskState.busyIds.includes(task.id)" @tap="aiTasks.confirm(task.id)">核对待办提交结果</button>
          </view>
          <view class="agent-links">
            <button v-if="task.artifact" size="mini" :disabled="artifactBusy === task.id" @tap="showArtifact(task.id)">查看结果 · {{ task.artifact.name }}</button>
            <button v-if="taskIsActive(task) && !taskNeedsReceipt(task)" size="mini" :disabled="taskState.busyIds.includes(task.id)" @tap="cancel(task.id)">取消任务</button>
          </view>
          <view v-if="artifactTaskId === task.id && artifact" class="artifact-result">
            <TChatMarkdown :content="artifact.content" @click="handleMarkdownClick" />
            <view class="agent-links"><button size="mini" @tap="saveArtifact">保存文件</button><button size="mini" @tap="copyArtifact">复制内容</button></view>
          </view>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import TChatMarkdown from '@tdesign/uniapp-chat/chat-markdown/chat-markdown.vue';
import { handleMarkdownClick } from '@/ui/chat-markdown';
import { mobileApi } from '@/api/mobile';
import { onSessionChange, onDeviceChange } from '@/api/http';
import { aiTasks, taskIsActive, taskNeedsReceipt, utf8Size, validateTaskAttachment } from '@/services/ai-task';
import { chooseTaskAttachment, saveTaskArtifact } from '@/services/ai-task-files';
import { hasUnfinishedCall } from '@/services/calls';
import type { AgentArtifact, AgentAttachment, AgentTask } from '@/types/ai-task';
import type { Customer } from '@/types/mobile';
const props = defineProps<{ conversationId: string; visible: boolean }>();
const taskState = aiTasks.state;
const expanded = ref(false), customers = ref<Customer[]>([]), customerId = ref(''), customerLoading = ref(false), customerError = ref('');
const attachment = ref<AgentAttachment>(), attachmentSource = ref('file'), pasteMode = ref(false), pasteName = ref('沟通资料.txt'), pasteContent = ref('');
const prompt = ref('请结合资料和客户信息，生成一份跟进建议文件，并提出一个需要我确认的跟进待办。');
const localError = ref(''), moreCustomers = ref(false), artifact = ref<AgentArtifact>(), artifactTaskId = ref(''), artifactBusy = ref('');
let customerPage = 0, localGeneration = 0, artifactOperation = 0;
const selectedCustomer = computed(() => customers.value.find(item => item.id === customerId.value));
const customerIndex = computed(() => Math.max(0, customers.value.findIndex(item => item.id === customerId.value)));
const statusLabels = { queued: '等待执行', running: '正在执行', awaiting_confirmation: '等待你确认', completed: '已完成', failed: '执行失败', cancelled: '已取消' };
const readable = (reason: any) => reason?.message || '操作失败，请重试';
function clearIdentity() {
  ++localGeneration; customers.value = []; customerId.value = ''; customerPage = 0; moreCustomers.value = false;
  customerLoading.value = false; customerError.value = ''; attachment.value = undefined; pasteContent.value = ''; artifact.value = undefined;
  artifactTaskId.value = ''; artifactBusy.value = ''; localError.value = ''; expanded.value = false;
}
const offSession = onSessionChange(clearIdentity), offDevice = onDeviceChange(clearIdentity);
onUnmounted(() => { ++localGeneration; offSession(); offDevice(); aiTasks.suspend(); });
watch(() => [props.conversationId, props.visible] as const, ([id, visible], previous) => {
  ++localGeneration; customerLoading.value = false; artifactBusy.value = '';
  if (previous?.[0] !== id) { artifact.value = undefined; artifactTaskId.value = ''; localError.value = ''; }
  if (visible && id) { void aiTasks.observe(id); if (expanded.value && !customers.value.length) void loadCustomers(false); }
  else aiTasks.suspend();
}, { immediate: true });
function toggle() { expanded.value = !expanded.value; if (expanded.value && !taskState.disabled && !customers.value.length) void loadCustomers(false); }
async function loadCustomers(more: boolean) {
  if (taskState.disabled || !props.visible || customerLoading.value) return;
  const generation = localGeneration, page = more ? customerPage + 1 : 1;
  customerLoading.value = true; customerError.value = '';
  try {
    const result = await mobileApi.customers('all', page);
    if (generation !== localGeneration || !props.visible) return;
    customers.value = more ? [...customers.value, ...result.items.filter(item => !customers.value.some(old => old.id === item.id))] : result.items;
    if (!selectedCustomer.value) customerId.value = '';
    customerPage = page; moreCustomers.value = result.total !== undefined ? customers.value.length < result.total : !!result.next_cursor || result.items.length === 20;
    if (!customers.value.length) customerError.value = '暂无可访问的客户';
  } catch (reason) { if (generation === localGeneration) customerError.value = readable(reason); }
  finally { if (generation === localGeneration) customerLoading.value = false; }
}
function selectCustomer(event: { detail: { value: string | number } }) { customerId.value = customers.value[Number(event.detail.value)]?.id || ''; }
async function pick() {
  const generation = localGeneration; localError.value = '';
  try { const result = await chooseTaskAttachment(); if (generation === localGeneration && props.visible && result) { attachment.value = result; attachmentSource.value = 'file'; } }
  catch (reason) { if (generation === localGeneration) { localError.value = readable(reason); pasteMode.value = true; } }
}
function usePasted() {
  try { const result = { name: pasteName.value.trim(), content: pasteContent.value }; validateTaskAttachment(result); attachment.value = result; attachmentSource.value = 'paste'; localError.value = ''; pasteMode.value = false; }
  catch (reason) { localError.value = readable(reason); }
}
async function submit() {
  if (hasUnfinishedCall()) { localError.value = '请先完成当前通话并保存结果'; return; }
  if (!attachment.value || !selectedCustomer.value) return;
  const generation = localGeneration, submittedAttachment = attachment.value, submittedPaste = pasteContent.value;
  localError.value = '';
  if (await aiTasks.submit({ customer_id: customerId.value, prompt: prompt.value, attachment: { ...submittedAttachment } }) && generation === localGeneration) {
    if (attachment.value === submittedAttachment) attachment.value = undefined;
    if (pasteContent.value === submittedPaste) pasteContent.value = '';
  }
}
function customerName(id: string) { return customers.value.find(item => item.id === id)?.name || `客户 ${id}`; }
function dueTime(value: string) {
  const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}
function confirm(task: AgentTask) {
  if (!task.proposal) return;
  if (hasUnfinishedCall()) { localError.value = '请先完成当前通话并保存结果'; return; }
  const generation = localGeneration, proposal = JSON.stringify(task.proposal);
  uni.showModal({ title: '创建跟进待办', content: `客户：${customerName(task.customer_id)}\n标题：${task.proposal.title}\n内容：${task.proposal.content}\n计划时间：${dueTime(task.proposal.due_at)}`, success: result => {
    if (!result.confirm || generation !== localGeneration || !props.visible) return;
    const latest = taskState.items.find(item => item.id === task.id);
    if (JSON.stringify(latest?.proposal) !== proposal) { localError.value = '待办建议已更新，请重新确认'; return; }
    void aiTasks.confirm(task.id);
  } });
}
function cancel(id: string) { void aiTasks.cancel(id); }
async function showArtifact(id: string) {
  if (artifactBusy.value === id) return;
  const generation = localGeneration, operation = ++artifactOperation; artifactBusy.value = id;
  const result = await aiTasks.artifact(id);
  if (generation !== localGeneration || operation !== artifactOperation || !props.visible) return;
  artifactBusy.value = ''; if (result) { artifactTaskId.value = id; artifact.value = result; }
}
async function saveArtifact() { if (!artifact.value) return; try { await saveTaskArtifact(artifact.value); } catch (reason) { localError.value = readable(reason); } }
function copyArtifact() { if (artifact.value) uni.setClipboardData({ data: artifact.value.content, fail: () => { localError.value = '复制失败，请重试'; } }); }
</script>

<style scoped lang="scss">
.agent-panel { margin: 0 20px 12px; font-size: 12px; color: #374259; }
.agent-entry { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; background: #fff; border: 1px solid #e4e9f5; border-radius: 12px; color: #294fdb; }
.agent-body { padding: 12px 0 0; }.muted { color: #929bad; font-size: 11px; }
.agent-note { display: block; color: #7c879c; line-height: 1.7; margin-bottom: 10px; }
.agent-form, .agent-card { background: #fff; border: 1px solid #e4e9f5; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
.agent-field { box-sizing: border-box; height: 40px; line-height: 40px; padding: 0 10px; background: #f5f7fc; border-radius: 8px; }
.agent-textarea { box-sizing: border-box; width: 100%; height: 120px; padding: 10px; margin: 10px 0; background: #f5f7fc; border-radius: 8px; font-size: 12px; line-height: 1.6; }.instruction { height: 90px; }
.agent-links { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-start; gap: 10px; margin: 10px 0; color: #536aaf; font-size: 11px; }
.agent-links button, .paste-fields button, .agent-proposal button { margin: 0; font-size: 11px; }.agent-submit { margin: 0; background: #294fdb; color: #fff; font-size: 12px; }
.attachment { padding: 8px; background: #f5f7fc; border-radius: 8px; }.attachment-preview { display: block; color: #8992a3; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
.agent-card-heading { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }.agent-status { color: #294fdb; font-size: 11px; }.agent-summary { display: block; margin: 10px 0; line-height: 1.7; white-space: pre-wrap; }
.agent-event { color: #8992a3; font-size: 11px; line-height: 1.7; }.agent-error { display: block; color: #c45050; font-size: 12px; line-height: 1.6; margin: 8px 0; }
.agent-proposal { background: #f0f4ff; border-radius: 8px; padding: 10px; }.agent-proposal text { display: block; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }.proposal-heading { font-weight: 600; margin-bottom: 6px; }.agent-proposal button { margin-top: 10px; color: #294fdb; }
.artifact-copy { display: block; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.7; max-height: 350px; overflow-y: auto; }
</style>
