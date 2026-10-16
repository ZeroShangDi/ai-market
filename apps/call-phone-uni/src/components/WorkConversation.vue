<template>
  <view class="work">
    <scroll-view class="work-scroll" scroll-y :scroll-top="scrollTop" @touchmove="followLatest = false" @wheel="followLatest = false" @scrolltolower="followLatest = true">
      <view class="work-content">

        <view v-if="state.loading">正在读取工作会话…</view>
        <view v-if="!state.session?.messages.length" class="work-welcome">这次想完成什么？</view>
        <view v-for="message in state.session?.messages" :key="message.id" class="work-message" :class="message.role">
          <text v-if="message.delivery === 'queued' || message.delivery === 'cancelled' || message.delivery === 'interrupted'" class="work-note">{{ message.delivery === 'queued' ? '排队中' : message.delivery === 'interrupted' ? '执行已中断' : '已取消执行' }}</text>
          <text v-if="message.role === 'user'" class="work-text">{{ message.content }}</text>
          <TChatMarkdown v-else :content="message.content" @click="handleMarkdownClick" />
          <scroll-view v-if="message.role === 'user' && message.resource_ids?.length" scroll-x class="sent-files"><view class="sent-files-track"><view v-for="file in messageResources(message.resource_ids)" :key="file.id" class="sent-file"><TIcon :name="fileAppearance(file.name).icon" :color="fileAppearance(file.name).color" size="16px" /><text>{{ file.name }}</text></view></view></scroll-view>
          <view v-if="message.role === 'user' && (workSteps(state.events, message.id).length || progressNotes(message.id).length)" class="process">
            <view class="process-heading" role="button" @tap="expanded[message.id] = !processOpen(message.id)"><TIcon :name="processOpen(message.id) ? 'chevron-down' : 'chevron-right'" size="14px" /><text>{{ processLabel(message.id) }}</text></view>
            <view v-if="processOpen(message.id)" class="process-list">
              <view v-for="note in progressNotes(message.id)" :key="note.sequence" class="process-note"><TChatMarkdown :content="note.data.content" @click="handleMarkdownClick" /></view>
              <view v-for="step in workSteps(state.events, message.id)" :key="step.id" class="process-step"><TIcon :name="step.status === '完成' ? 'check' : 'time'" size="13px" /><text>{{ step.label }}</text><text class="step-status">{{ step.status }}</text></view>
            </view>
          </view>
          <view v-if="message.role === 'user'" class="plugin-results">
            <view v-for="receipt in workReceipts(state.events, message.id)" :key="receipt.sequence" class="plugin-receipt">
              <text class="receipt-title">{{ receipt.title }}</text>
              <text>{{ receipt.summary }}</text>
              <view role="button" class="details-toggle" @tap="receiptOpen[receipt.sequence] = !receiptOpen[receipt.sequence]">{{ receiptOpen[receipt.sequence] ? '收起详情' : '查看详情' }}</view>
              <scroll-view v-if="receiptOpen[receipt.sequence]" scroll-y class="receipt-rows">
                <view v-for="(row, rowIndex) in receipt.rows" :key="rowIndex" class="receipt-row">
                  <text>{{ row.label }} · {{ row.status }}</text>
                  <text selectable>{{ row.detail }}</text>
                </view>
              </scroll-view>
            </view>
          </view>
        </view>
        <view v-if="state.liveText && busy" class="work-message"><TChatMarkdown :content="state.liveText" :streaming="{ hasNextChunk: true, tail: true }" @click="handleMarkdownClick" /></view>
        <view v-if="busy" class="work-note"><text class="pulse">●</text> {{ statusLabel }}</view>
        <view v-if="['failed', 'interrupted', 'closed'].includes(state.session?.status || '')" class="work-note">{{ statusLabel }}</view>
        <view v-if="state.session?.artifacts.length" class="artifacts">
          <view v-for="file in state.session.artifacts" :key="file.id" class="artifact">
            <view class="file-icon" :class="fileKind(file.name)"><TIcon :name="fileAppearance(file.name).icon" :color="fileAppearance(file.name).color" size="23px" /></view>
            <view class="file-copy"><text class="file-name">{{ file.name }}</text><text class="file-size">{{ file.name.split('.').pop()?.toUpperCase() }} · {{ Math.max(1, Math.ceil(file.size / 1024)) }} KB</text></view>
            <view class="file-download" role="button" :aria-label="'下载 ' + file.name" @tap="download(file)"><TIcon :name="downloading === file.id ? 'time' : 'download'" size="19px" /></view>
          </view>
        </view>
        <view v-if="state.error" class="work-error">{{ state.error }}<text @tap="reload">重新读取状态</text></view>
        <view v-if="sources.length" class="sources">
          <view class="source-summary" role="button" @tap="sourcesOpen = !sourcesOpen"><view class="source-marks"><text v-for="source in sources.slice(0, 3)" :key="source.url">{{ source.domain.replace('www.', '').slice(0, 1).toUpperCase() }}</text></view><text>{{ sources.length }} 个来源</text><TIcon :name="sourcesOpen ? 'chevron-down' : 'chevron-right'" size="14px" /></view>
          <view v-if="sourcesOpen" class="source-list"><view v-for="(source, index) in sources" :key="source.url" class="source" @tap="handleMarkdownClick({ node: { type: 'link', href: source.url } })"><view class="source-site"><text class="source-number">{{ index + 1 }}</text><text>{{ source.domain }}</text><TIcon name="link" size="13px" /></view><text class="source-title">{{ source.title }}</text></view></view>
        </view>
      </view>
    </scroll-view>
    <view v-if="!followLatest && busy" class="back-latest" @tap="followLatest = true; scrollTop += 100000">↓ 查看最新进展</view>
    <view class="work-composer">
      <view v-if="interactions.length" class="interaction-dock"><text v-if="interactions.length > 1" class="work-note">还有 {{ interactions.length }} 项待处理</text><scroll-view scroll-y class="interaction-scroll">
        <view v-for="item in interactions.slice(0, 1)" :key="item.id" class="interaction" :class="{ red: item.input._risk === 3 }">
          <template v-if="item.kind === 'question'">
            <view class="interaction-eyebrow"><TIcon name="chat" size="14px" color="#8e75c9" /><text>需要你确认</text></view>
            <view v-for="question in item.input.questions" :key="question.question" class="question">
              <text class="question-title">{{ question.question }}</text>
              <view v-for="(option, optionIndex) in question.options" :key="option.label" class="option" :class="{ selected: (answers[item.id]?.[question.question] || '').split(', ').includes(option.label) }" @tap="choose(item.id, question.question, option.label, question.multiSelect)">
                <text class="option-number">{{ optionIndex + 1 }}</text><view class="option-copy"><text class="option-title">{{ option.label }}</text><text v-if="option.description" class="option-description">{{ option.description }}</text></view><view class="option-radio" :class="{ multiple: question.multiSelect }"><TIcon v-if="(answers[item.id]?.[question.question] || '').split(', ').includes(option.label)" name="check" size="12px" /></view>
              </view>
              <input class="answer-input" :value="answers[item.id]?.[question.question] || ''" placeholder="其他想法，直接输入…" @input="answerInput(item.id, question.question, $event)" />
            </view>
            <view class="buttons"><button size="mini" @tap="controller.interrupt()">取消</button><button size="mini" :disabled="state.submitting || !allAnswered(item)" @tap="controller.answer(item, { answers: answers[item.id] || {} })">继续<TIcon name="arrow-right" size="14px" /></button></view>
          </template>
          <template v-else>
            <view class="interaction-eyebrow"><TIcon name="lock-on" size="14px" color="#c79243" /><text>需要你的授权</text><text v-if="item.input._risk === 3" class="risk-label">业务操作</text></view>
            <text class="approval-title">允许执行这项操作吗？</text>
            <view class="approval-fields"><view v-for="field in approvalFields(item.tool, item.input)" :key="field.label" class="approval-field"><text>{{ field.label }}</text><text>{{ field.value }}</text></view></view>
            <view class="details-toggle" @tap="details = !details">{{ details ? '收起' : '查看' }}操作详情</view>
            <text v-if="details" class="operation-params">{{ approvalDetails(item) }}</text>
            <view class="buttons"><button size="mini" :disabled="state.submitting" @tap="controller.answer(item, { approved: false })">拒绝</button><button size="mini" :disabled="state.submitting" @tap="approve(item)">允许这一次</button></view>
          </template>
        </view>
      </scroll-view></view>
      <view v-if="adding" class="add-dismiss" @tap="adding = false" />
      <view v-if="adding" class="add-panel">
        <view class="add-heading"><text>添加</text><view role="button" aria-label="关闭添加面板" @tap="adding = false"><TIcon name="close" size="16px" /></view></view>
        <scroll-view class="add-scroll" scroll-y>

          <view v-for="type in fileTypes" :key="type.label" class="add-menu-row" role="button" @tap="addFile(type.accept, type.mime, type.supported)"><TIcon :name="type.icon" :color="type.color" size="19px" /><text>{{ type.label }}</text><TIcon name="chevron-right" size="14px" color="#a1a1a6" /></view>
          <text v-if="availableSkills.length" class="add-section-label">技能</text>
          <view v-for="item in availableSkills" :key="item.plugin.id + item.skill.name" class="add-menu-row capability-row" role="button" @tap="selectPlugin(item.plugin, item.skill.name)"><TIcon name="lightbulb" size="16px" color="#c89442" /><text>{{ item.skill.name }}</text><text class="capability-summary">{{ item.skill.description }}</text></view>
          <text v-if="availablePlugins.length" class="add-section-label">插件</text>
          <view v-for="plugin in availablePlugins" :key="plugin.id" class="add-menu-row capability-row" role="button" @tap="selectPlugin(plugin)"><TIcon name="app" size="16px" color="#9c77c9" /><text>{{ plugin.name }}</text><text class="capability-summary">{{ plugin.description }}</text><TIcon v-if="plugin.added" name="check" size="14px" /></view>
          <view v-if="state.pluginLoading" class="menu-status">加载能力…</view>
          <view v-if="pluginError" class="menu-status" role="button" @tap="loadPluginMenu">{{ pluginError }} · 重试</view>
          <view class="add-menu-row capability-row" role="button" @tap="openCapabilities"><TIcon name="setting" size="16px" color="#5885ce" /><text>能力中心</text><text class="capability-summary">管理技能与连接</text></view>
          <template v-if="availableResources.length"><view class="add-divider" /><text class="add-section-label">会话文件</text><view v-for="file in availableResources" :key="file.id" class="add-menu-row" role="button" @tap="selectResource(file.id)"><TIcon :name="fileAppearance(file.name).icon" :color="fileAppearance(file.name).color" size="19px" /><text class="menu-file-name">{{ file.name }}</text><TIcon name="add" color="#5885ce" size="15px" /></view></template>
        </scroll-view>
      </view>
      <slot name="mode" />
      <view v-if="pendingIncoming.length && incomingWorkFiles.error" class="work-error" role="button" @tap="retryIncoming">{{ incomingWorkFiles.error }} · 重试</view>
      <text v-if="state.uploading" class="work-note">正在上传文件…</text>
      <TChatSender v-if="!interactions.length" :value="state.draft" :loading="false" :disabled="state.session?.status === 'closed' || state.submitting || state.uploading || picking" :placeholder="busy ? '补充消息，当前一轮结束后继续处理…' : '交办工作，说明期望的结果…'"
        :textarea-props="{ autosize: { minHeight: '48px', maxHeight: '160px' } }" :render-presets="[{ name: 'send', type: 'icon' }]" :adjust-position="false" :auto-rise-with-keyboard="false"
        @update:value="state.draft = $event" @send="send" @stop="controller.interrupt()">
        <template #header><ComposerAttachments :resources="selectedResources" :capabilities="selectedCapabilities" :disabled="busy || state.submitting || state.uploading || picking" @remove-resource="removeResource" @remove-capability="removePlugin" /></template>
        <template #footer-prefix><view class="composer-actions"><view class="add-trigger" role="button" aria-label="添加资源" :aria-disabled="busy || state.submitting || state.uploading || picking" @tap="toggleAdding"><TIcon name="add" size="23px" color="#5885ce" /></view><text v-if="busy" role="button" @tap="controller.interrupt()">打断</text></view></template>
      </TChatSender>
    </view>
  </view>
</template>

<script setup lang="ts">
import { incomingWorkFiles, readIncomingWorkFile, discardIncomingWorkFile } from '@/services/incoming-work-files';
import { workReceipts, workSteps, workElapsed, approvalFields, workFileCategories, fileAppearance, acceptsWorkFile, supportedWorkFileExtensions } from '@/ui/work-presentation';
import ComposerAttachments from './ComposerAttachments.vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import TChatMarkdown from '@tdesign/uniapp-chat/chat-markdown/chat-markdown.vue';
import TChatSender from '@tdesign/uniapp-chat/chat-sender/chat-sender.vue';
import { createWorkController, type WorkInteraction, type WorkPlugin } from '@/services/work';
import { chooseWorkFile, openWorkArtifact } from '@/services/work-files';
import { mockEnabled } from '@/config';
import { hasUnfinishedCall } from '@/services/calls';
import { handleMarkdownClick, markdownHttpUrl } from '@/ui/chat-markdown';
import { toast } from '@/ui/format';

const props = defineProps<{ conversationId: string; visible: boolean }>();
const emit = defineEmits<{ (event: 'started'): void; (event: 'title', value: string): void }>();
const controller = createWorkController(), state = controller.state;
const pluginError = ref(''), picking = ref(false);
function messageResources(ids: string[] = []) { return ids.map(id => state.session?.resources.find(file => file.id === id) || { id, name: '已关联文件' }); }
const availablePlugins = computed(() => state.plugins.filter(p => p.installed && p.enabled && p.connected));
const availableSkills = computed(() => availablePlugins.value.flatMap(plugin => plugin.skills.filter(s => s.enabled && s.standalone === true).map(skill => ({ plugin, skill }))));
const answers = reactive<Record<string, Record<string, string>>>({});
const scrollTop = ref(0), followLatest = ref(true), adding = ref(false), details = ref(false), sourcesOpen = ref(false), downloading = ref('');
const expanded = reactive<Record<string, boolean>>({});
const fileTypes = workFileCategories;
const selectedCapabilities = computed(() => (state.session?.plugins || []).filter(plugin => plugin.added).map(plugin => ({ id: plugin.id, name: plugin.name || plugin.id, icon: 'app', color: '#9c77c9' })));
const pendingIncoming = computed(() => incomingWorkFiles.conversation === props.conversationId ? incomingWorkFiles.items : []);
const selectedResources = computed(() => [...(state.session?.resources.filter(file => state.selected.includes(file.id)) || []), ...pendingIncoming.value.map(file => ({ id: 'incoming:' + file.id, name: file.name }))]);
let importingIncoming = false;
const importedIncoming = new Set<string>();
async function importIncoming() {
  if (importingIncoming || !props.visible || !state.session || state.uploading || state.submitting || busy.value || !pendingIncoming.value.length || incomingWorkFiles.error) return;
  importingIncoming = true;
  const conversation = props.conversationId;
  try {
    for (const file of [...pendingIncoming.value]) {
      if (props.conversationId !== conversation || state.selected.length >= 20) break;
      if (!importedIncoming.has(file.id)) {
        const accepted = await controller.upload({ name: file.name, content_base64: readIncomingWorkFile(file.id) });
        if (!accepted) break;
        importedIncoming.add(file.id);
      }
      discardIncomingWorkFile(file.id);
    }
  } catch (e: any) { incomingWorkFiles.error = e.message || '外部文件添加失败'; }
  finally { importingIncoming = false; }
}
watch(() => [state.session?.id, props.visible, pendingIncoming.value.length, state.uploading, state.submitting], () => { void importIncoming(); });
function retryIncoming() { incomingWorkFiles.error = ''; void importIncoming(); }

const availableResources = computed(() => state.session?.resources.filter(file => !state.selected.includes(file.id)) || []);
const receiptOpen = reactive<Record<number, boolean>>({});
const sources = computed(() => { const links = new Map<string, { title: string; url: string; domain: string }>(); for (const event of state.events.filter(e => e.type === 'sources')) for (const source of event.data.items || []) { if (markdownHttpUrl(source.url)) links.set(source.url, { ...source, domain: source.url.split('/')[2] }); } return [...links.values()]; });
let seen = 0;
const now = ref(Date.now());
const clock = setInterval(() => { if (props.visible && busy.value) now.value = Date.now(); }, 1000);
function runFinished(run: string) { return state.events.some(e => e.run_id === run && ['result', 'error'].includes(e.type)) || (!!state.session && (state.session.run_id !== run || !busy.value)); }
function processOpen(run: string) { return expanded[run] ?? !runFinished(run); }
function processLabel(run: string) { const elapsed = workElapsed(state.events, run, now.value); const failed = state.events.some(e => e.run_id === run && (e.type === 'error' || (e.type === 'result' && e.data.success === false))); return `${runFinished(run) ? (failed ? '工作已结束' : '已完成') : '正在处理'}${elapsed ? ' · 用时 ' + elapsed : ''}`; }
watch(() => state.events.filter(e => ['result', 'error'].includes(e.type)).map(e => e.run_id).join('|'), () => { for (const e of state.events) if (['result', 'error'].includes(e.type)) expanded[e.run_id] = false; });
function fileKind(name: string) { return /\.(xlsx?|csv|tsv)$/i.test(name) ? 'sheet' : /\.pdf$/i.test(name) ? 'pdf' : 'document'; }
watch(() => state.session, session => {
  if (!session) return;
  if (session.messages.length) { emit('started'); emit('title', session.messages.find(m => m.role === 'user')?.content.slice(0, 60) || '工作'); }
  if (props.visible && session.status === 'idle' && session.messages.some(m => m.role === 'assistant') && session.sequence > seen) {
    seen = session.sequence; void controller.markSeen(seen).catch(() => { seen = 0; });
  }
}, { deep: true });
const busy = computed(() => ['running', 'waiting'].includes(state.session?.status || ''));
const interactions = computed(() => state.session?.interactions.filter(i => i.status === 'pending') || []);
const statusLabel = computed(() => ({ idle: '可以继续交办', running: '正在执行', waiting: interactions.value[0]?.kind === 'approval' ? '等待你的授权' : '等待你的答复', interrupted: '已打断，请核对后继续', failed: '未完成，请核对后继续', closed: '工作会话已关闭' }[state.session?.status || 'idle']));
watch(() => [props.conversationId, props.visible] as const, ([id, visible]) => { seen = 0; pluginError.value = ''; adding.value = false; details.value = false; if (!mockEnabled) void controller.attach(id, visible); else state.error = 'Work 需要连接真实服务'; }, { immediate: true });
watch(() => state.liveText.length + state.events.length, () => { if (followLatest.value) scrollTop.value += 100000; });
onUnmounted(() => { clearInterval(clock); controller.dispose(); });
function progressNotes(run: string) { return state.events.filter(e => e.run_id === run && e.type === 'assistant' && !e.data.parent_tool_use_id && e.data.content && e.data.content !== state.liveText && !state.session?.messages.some(m => m.role === 'assistant' && m.content === e.data.content)); }
function reload() { void controller.attach(props.conversationId, props.visible); }
function setAnswer(id: string, question: string, value: string) { (answers[id] ||= {})[question] = value; }
function answerInput(id: string, question: string, event: any) { setAnswer(id, question, String(event.detail.value)); }
function choose(id: string, question: string, value: string, multiple: boolean) {
  if (!multiple) return setAnswer(id, question, value);
  const values = (answers[id]?.[question] || '').split(', ').filter(Boolean);
  setAnswer(id, question, (values.includes(value) ? values.filter(v => v !== value) : [...values, value]).join(', '));
}
function removeResource(id: string) { if (id.startsWith('incoming:')) { if (!state.uploading) { try { discardIncomingWorkFile(id.slice(9)); } catch (e: any) { toast(e.message); } } return; } if (!busy.value && !state.submitting) state.selected = state.selected.filter(value => value !== id); }
function selectResource(id: string) { if (busy.value || state.submitting) return; if (state.selected.length >= 20) return toast('每次最多关联 20 个文件'); state.selected.push(id); adding.value = false; }
async function loadPluginMenu() {
  pluginError.value = '';
  try { await controller.loadPlugins(); } catch (e: any) { pluginError.value = e.message || '能力加载失败'; }
}
function openCapabilities() { adding.value = false; uni.navigateTo({ url: '/pages/capabilities/index' }); }
async function selectPlugin(plugin: WorkPlugin, skill?: string) {
  if (busy.value || state.submitting) return;
  try {
    if (!plugin.added) await controller.configurePlugin(plugin, 'add');
    if (skill) state.draft = `使用「${skill}」技能。${state.draft}`;
    adding.value = false;
  } catch (e: any) { toast(e.message || '能力选用失败'); }
}
async function removePlugin(id: string) {
  if (busy.value || state.submitting) return;
  try { await controller.configurePlugin({ id } as WorkPlugin, 'remove'); } catch (e: any) { toast(e.message || '移除失败'); }
}
function toggleAdding() { if (!busy.value && !state.submitting) { adding.value = !adding.value; if (adding.value) void loadPluginMenu(); } }
function allAnswered(item: WorkInteraction) { return (item.input.questions || []).every((q: any) => answers[item.id]?.[q.question]?.trim()); }

function approvalDetails(item: WorkInteraction) { return Object.entries(item.input).filter(([key]) => !key.startsWith('_')).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`).join('\n'); }
async function addFile(accept: string, mime = '*/*', supported = true) {
  if (busy.value || state.submitting || state.uploading || picking.value || !state.session || state.session.status === 'closed') return toast('请等待当前工作结束');
  if (state.selected.length >= 20) return toast('每次最多关联 20 个文件');
  const id = state.session.id;
  picking.value = true;
  try {
    adding.value = false;
    const file = await chooseWorkFile(accept, mime, supported, name => acceptsWorkFile(name, supportedWorkFileExtensions));
    if (!file) return;
    if (!supported || !acceptsWorkFile(file.name, supportedWorkFileExtensions)) {
      uni.showModal({ title: '暂未支持的文件类型', content: '当前可处理文档和表格，图片、视频处理稍后开放。', showCancel: false }); return;
    }
    if (state.session?.id !== id) return toast('会话已切换，请在当前会话重新选择文件');
    await controller.upload(file);
  } catch (e: any) { toast(e.message || '文件添加失败'); }
  finally { picking.value = false; }
}

function send() { if (hasUnfinishedCall()) return toast('请先完成当前通话并保存结果'); if (state.session?.status === 'closed') return toast('工作会话已关闭，请新建对话'); if (!state.uploading && !picking.value && !pendingIncoming.value.length && state.draft.trim()) { emit('started'); adding.value = false; followLatest.value = true; void controller.send(); } }
function approve(item: WorkInteraction) { if (hasUnfinishedCall()) return toast('请先完成当前通话并保存结果'); void controller.answer(item, { approved: true }); }

async function download(file: { id: string; name: string }) { if (downloading.value) return; downloading.value = file.id; try { if (state.session) await openWorkArtifact(state.session.id, file); } catch (e: any) { toast(e.message); } finally { downloading.value = ''; } }
</script>

<style scoped>
.sent-files { margin: 8px 0; width: 100%; white-space: nowrap; }.sent-files-track { display: inline-flex; gap: 8px; padding-left: 32px; }.sent-file { display: inline-flex; align-items: center; gap: 7px; background: #edf1f7; border-radius: 18px; padding: 8px 12px; font-size: 12px; max-width: 240px; }.sent-file text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plugin-receipt { margin-top: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 12px; display: flex; flex-direction: column; gap: 6px; color: #555; font-size: 13px; }
.receipt-title { font-weight: 600; color: #333; overflow-wrap: anywhere; }
.receipt-rows { max-height: 240px; }
.receipt-row { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-top: 1px solid #eee; }
.work { flex: 1; min-height: 0; display: flex; flex-direction: column; color: #303237; }
.work-scroll { flex: 1; min-height: 0; height: 0; }.work-content { padding: 12px 20px 24px; }
.work-welcome { text-align: center; font-size: 25px; font-weight: 600; margin-top: 17vh; }
.work-message { margin: 20px 0; }.work-message.user > .work-text { display: block; background: #eceef2; padding: 12px 16px; border-radius: 18px 5px 18px 18px; margin-left: 32px; white-space: pre-wrap; font-size: 14px; line-height: 1.6; }
.work-note { color: #96999e; font-size: 12px; padding: 10px 0; }.pulse { animation: pulse 1.6s infinite; }@keyframes pulse { 50% { opacity: .35; } }
.process { margin: 20px 0 0; color: #92959c; font-size: 12px; }.process-heading { display: flex; align-items: center; gap: 6px; min-height: 32px; }.process-list { margin: 4px 0 10px 6px; padding-left: 14px; border-left: 1px solid #e3e5e8; }.process-step { display: flex; align-items: center; gap: 9px; padding: 7px 0; }.step-status { margin-left: auto; font-size: 11px; color: #a1a4aa; }.process-note { padding: 6px 0; }.process-note :deep(.t-chat-markdown) { color: #8b8f96; font-size: 12px; }
.work-composer { flex-shrink: 0; position: relative; z-index: 4; padding: 8px 14px calc(8px + env(safe-area-inset-bottom)); background: #f7f8fc; }
.interaction-dock { background: #fff; border: 1px solid #dedfe2; border-radius: 20px; overflow: hidden; box-shadow: 0 3px 18px #20212408; margin-bottom: 3px; }.interaction-scroll { max-height: 49vh; }.interaction { padding: 18px 16px 14px; }
.interaction-eyebrow { display: flex; align-items: center; gap: 6px; color: #888b91; font-size: 11px; margin-bottom: 13px; }.risk-label { margin-left: auto; color: #a77249; }
.question { margin: 0 0 14px; }.question-title,.approval-title { display: block; font-size: 15px; font-weight: 600; line-height: 1.6; margin-bottom: 12px; }
.option { display: flex; align-items: center; gap: 10px; padding: 12px 10px; border: 1px solid transparent; border-radius: 11px; margin: 3px 0; }.option.selected { background: #f4f4f5; border-color: #dedfe2; }.option-number { color: #858890; border: 1px solid #e5e5e7; border-radius: 5px; width: 20px; height: 20px; line-height: 20px; text-align: center; font-size: 11px; background: #fff; }.option-copy { flex: 1; min-width: 0; }.option-title { font-size: 13px; color: #37393e; }.option-description { display: block; color: #989ba1; font-size: 11px; line-height: 1.6; margin-top: 3px; }.option-radio { width: 16px; height: 16px; border: 1px solid #d5d7dc; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: transparent; }.option.selected .option-radio { color: white; background: #34363b; border-color: #34363b; }.option-radio.multiple { border-radius: 4px; }
.answer-input { margin: 10px 0 0; border: 1px solid #e6e7e9; border-radius: 10px; padding: 10px 12px; font-size: 12px; background: #fff; }
.buttons { position: sticky; bottom: -14px; background: #fff; padding-bottom: 2px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid #eff0f2; padding-top: 12px; margin-top: 14px; }.buttons button { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0; min-width: 64px; padding: 0 14px; height: 34px; line-height: 34px; border-radius: 18px; background: #fff; color: #747780; font-size: 12px; }.buttons button::after { border: 0; }.buttons button:last-child { background: #2f3136; color: #fff; }.buttons button[disabled] { opacity: .35; }
.approval-fields { background: #f7f7f8; border-radius: 12px; padding: 6px 12px; }.approval-field { display: flex; gap: 14px; padding: 7px 0; font-size: 12px; line-height: 1.6; }.approval-field > text:first-child { flex: 0 0 56px; color: #92959c; }.approval-field > text:last-child { min-width: 0; overflow-wrap: anywhere; color: #4f535a; }.details-toggle { font-size: 11px; color: #9699a0; padding: 12px 0 0; }.operation-params { display: block; font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 150px; overflow: auto; padding-top: 10px; color: #7f838b; }
.add-dismiss { position: fixed; inset: 0; z-index: 1; }.add-panel { position: absolute; z-index: 2; bottom: calc(100% + 4px); left: 14px; right: 14px; width: auto; box-sizing: border-box;  padding: 8px; border: 1px solid #e5e5e7; border-radius: 16px; background: #fff; box-shadow: 0 8px 32px #181b251c, 0 1px 4px #181b2508; }.add-scroll { max-height: min(42vh, 320px); overflow-y: auto; }.add-section-label { display: block; padding: 6px 11px; font-size: 11px; color: #9399a5; }.menu-file-name { min-width: 0; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.add-heading { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px 10px; font-size: 11px; color: #93969d; }.add-menu-row { display: flex; align-items: center; gap: 12px; height: 42px; padding: 0 11px; border-radius: 9px; font-size: 13px; color: #464950; }.add-menu-row:active { background: #f3f4f5; }.add-menu-row > text { flex: 1; }.add-divider { height: 1px; margin: 6px 8px; background: #eceef0; }
.resources { display: flex; flex-wrap: wrap; gap: 6px; max-height: 90px; overflow: auto; margin-bottom: 6px; }.resources > view { font-size: 11px; color: #858991; border: 1px solid #e4e5e7; padding: 6px 9px; border-radius: 8px; overflow-wrap: anywhere; }.resources .selected { color: #484d56; background: #edeff2; }
.composer-actions { display: flex; align-items: center; gap: 12px; font-size: 12px; color: #848890; }.composer-actions > .add-trigger { font-size: 24px; color: #636870; padding: 0 5px; }.composer-actions > .add-trigger[aria-disabled=true] { opacity: .35; }
.artifacts { margin-top: 22px; }.artifact { display: flex; align-items: center; gap: 12px; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin: 8px 0; background: #fff; }.file-icon { display: flex; align-items: center; justify-content: center; width: 38px; height: 44px; border-radius: 8px; color: #5e81ba; background: #f0f4fb; flex-shrink: 0; }.file-icon.sheet { color: #4a9573; background: #eef6f1; }.file-icon.pdf { color: #bf7272; background: #faf0f0; }.file-copy { flex: 1; min-width: 0; }.file-name { font-size: 13px; font-weight: 500; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.file-size { display: block; font-size: 11px; color: #9a9da4; margin-top: 5px; }.file-download { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; color: #777d87; border-radius: 50%; background: #f7f8fa; }
.sources { margin-top: 15px; }.source-summary { display: inline-flex; align-items: center; gap: 8px; color: #8c9098; font-size: 11px; padding: 5px 0; }.source-marks { display: flex; padding-left: 4px; }.source-marks > text { display: block; width: 20px; height: 20px; line-height: 20px; text-align: center; font-size: 10px; border: 2px solid #f7f8fc; border-radius: 50%; margin-left: -4px; color: #6f7888; background: #e7ebf2; }.source-list { margin-top: 8px; border: 1px solid #e6e8ed; border-radius: 14px; background: #fff; padding: 4px 12px; }.source { padding: 12px 0; }.source + .source { border-top: 1px solid #f0f1f3; }.source-site { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #999da5; }.source-site > text:nth-child(2) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.source-number { color: #8d96a5; }.source-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; line-height: 1.6; color: #535861; margin-top: 6px; }
.work-error { font-size: 12px; color: #ad6666; }.work-error text { display: block; padding: 8px 0; }.back-latest { align-self: center; background: #fff; border: 1px solid #e5e6e8; color: #868a93; border-radius: 20px; font-size: 11px; padding: 7px 12px; }
:deep(.t-chat-sender) { margin: 0; border: 1px solid #dedfe3; border-radius: 22px; }:deep(.t-chat-markdown) { font-size: 14px; line-height: 1.8; }
:deep(.t-chat-sender__textarea--control) { box-sizing: border-box; padding-bottom: 0; max-height: 160px; overflow-y: auto !important; }:deep(.t-chat-sender__textarea) { max-height: 160px; overflow: hidden; }:deep(.uni-textarea-wrapper) { max-height: 160px !important; overflow: hidden; }:deep(.uni-textarea-textarea) { max-height: 160px !important; overflow-y: auto !important; }.file-download { color: #5885ce; }.source-site :deep(.t-icon) { color: #659baf; }
</style>

<style scoped>
.sent-files { margin: 8px 0; width: 100%; white-space: nowrap; }.sent-files-track { display: inline-flex; gap: 8px; padding-left: 32px; }.sent-file { display: inline-flex; align-items: center; gap: 7px; background: #edf1f7; border-radius: 18px; padding: 8px 12px; font-size: 12px; max-width: 240px; }.sent-file text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.capability-row { gap: 8px; }
.capability-row > text:first-of-type { flex: none; }
.capability-summary { color: #999; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-status { padding: 8px; color: #888; font-size: 12px; }
.plugin-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.plugin-chips > view { padding: 5px 9px; margin: 4px 0; border: 1px solid #dedfe2; border-radius: 7px; font-size: 12px; }
.add-menu-row { height: auto; min-height: 36px; padding: 6px 8px; border-radius: 16px; }
.add-menu-row:active { background: #eceef1; }
</style>
