<template>
  <view class="work">
    <scroll-view class="work-scroll" scroll-y :scroll-top="scrollTop">
      <view class="work-content">
        <view class="work-note">{{ statusLabel }} · 离页后继续执行</view>
        <view v-if="state.loading">正在读取工作会话…</view>
        <view v-if="!state.session?.messages.length" class="work-welcome">直接交办工作，也可以先点“＋”添加原始文件。<text>例如：生成一份今天的工作清单，保存为文件。</text></view>
        <view v-for="message in state.session?.messages" :key="message.id" class="work-message" :class="message.role">
          <text class="work-author">{{ message.role === 'user' ? '我' : '工作助理' }}</text>
          <text v-if="message.role === 'user'" class="work-text">{{ message.content }}</text>
          <TChatMarkdown v-else :content="message.content" @click="handleMarkdownClick" />
        </view>
        <view v-if="state.liveText && busy" class="work-message"><text class="work-author">工作助理 · 处理中</text><TChatMarkdown :content="state.liveText" :streaming="{ hasNextChunk: true, tail: true }" @click="handleMarkdownClick" /></view>
        <view v-if="state.activity && busy" class="work-note">{{ state.activity }}</view>
        <view v-for="item in interactions" :key="item.id" class="interaction" :class="{ red: item.input._risk === 3 }">
          <template v-if="item.kind === 'question'">
            <text class="interaction-title">需要补充信息</text>
            <view v-for="question in item.input.questions" :key="question.question" class="question">
              <text>{{ question.question }}</text>
              <view v-for="option in question.options" :key="option.label" class="option" :class="{ selected: answers[item.id]?.[question.question] === option.label }" @tap="choose(item.id, question.question, option.label, question.multiSelect)">
                <text>{{ option.label }}</text><text class="option-description">{{ option.description }}</text>
              </view>
              <input class="answer-input" :value="answers[item.id]?.[question.question] || ''" placeholder="也可以直接填写答复" @input="answerInput(item.id, question.question, $event)" />
            </view>
            <view class="buttons"><button size="mini" :disabled="state.submitting" @tap="controller.answer(item, { answers: answers[item.id] || {} })">答复并继续</button><button size="mini" @tap="controller.interrupt()">取消本次工作</button></view>
          </template>
          <template v-else>
            <text class="interaction-title">{{ item.input._risk === 3 ? '高风险操作 · 需要逐次确认' : '不可恢复操作 · 需要批准' }}</text>
            <text class="work-author">{{ item.tool }}</text>
            <text class="operation-params">{{ JSON.stringify(item.input, null, 2) }}</text>
            <view class="buttons"><button size="mini" :disabled="state.submitting" @tap="controller.answer(item, { approved: false })">拒绝</button><button size="mini" :disabled="state.submitting" @tap="approve(item)">批准本次操作</button></view>
          </template>
        </view>
        <view v-if="state.session?.artifacts.length" class="artifacts">
          <text class="interaction-title">工作产物</text>
          <view v-for="file in state.session.artifacts" :key="file.id" class="artifact" @tap="download(file)"><text>{{ file.name }}</text><text>{{ Math.ceil(file.size / 1024) }} KiB · 查看 / 下载</text></view>
        </view>
        <view v-if="state.error" class="work-error">{{ state.error }}<text @tap="reload">重新读取状态</text></view>
        <view class="work-note" @tap="logs = !logs">{{ logs ? '收起' : '查看' }}操作记录</view>
        <view v-if="logs" class="logs"><view v-for="event in visibleLogs" :key="event.sequence"><text>#{{ event.sequence }} {{ event.type }}</text><text>{{ JSON.stringify(event.data) }}</text></view></view>
      </view>
    </scroll-view>
    <view class="work-composer">
      <view class="resources"><view v-for="file in state.session?.resources" :key="file.id" :class="{ selected: state.selected.includes(file.id) }" @tap="toggleResource(file.id)">{{ state.selected.includes(file.id) ? '✓ ' : '' }}{{ file.name }}</view></view>
      <TChatSender :value="state.draft" :loading="busy || state.submitting" :disabled="state.session?.status === 'closed'" placeholder="交办工作，说明期望的结果…"
        :render-presets="[{ name: 'send', type: 'icon' }]" :adjust-position="false" :auto-rise-with-keyboard="false"
        @update:value="state.draft = $event" @send="send" @stop="controller.interrupt()">
        <template #footer-prefix><view class="composer-actions"><view role="button" aria-label="添加资源" @tap="addFile">＋</view><text>Work</text><text v-if="busy" role="button" @tap="controller.interrupt()">打断</text><text v-else-if="state.session && state.session.status !== 'closed'" @tap="close">关闭工作会话</text></view></template>
      </TChatSender>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import TChatMarkdown from '@tdesign/uniapp-chat/chat-markdown/chat-markdown.vue';
import TChatSender from '@tdesign/uniapp-chat/chat-sender/chat-sender.vue';
import { createWorkController, type WorkInteraction } from '@/services/work';
import { chooseWorkFile, openWorkArtifact } from '@/services/work-files';
import { mockEnabled } from '@/config';
import { hasUnfinishedCall } from '@/services/calls';
import { handleMarkdownClick } from '@/ui/chat-markdown';
import { toast } from '@/ui/format';

const props = defineProps<{ conversationId: string; visible: boolean }>();
const controller = createWorkController(), state = controller.state;
const answers = reactive<Record<string, Record<string, string>>>({});
const logs = ref(false), scrollTop = ref(0);
const busy = computed(() => ['running', 'waiting'].includes(state.session?.status || ''));
const interactions = computed(() => state.session?.interactions.filter(i => i.status === 'pending') || []);
const visibleLogs = computed(() => state.events.filter(e => !['text_delta', 'tool_delta'].includes(e.type)));
const statusLabel = computed(() => ({ idle: '可以继续交办', running: '正在执行', waiting: '等待你的答复', interrupted: '已打断，请核对后继续', failed: '未完成，请核对后继续', closed: '工作会话已关闭' }[state.session?.status || 'idle']));
watch(() => [props.conversationId, props.visible] as const, ([id, visible]) => { if (!mockEnabled) void controller.attach(id, visible); else state.error = 'Work 需要连接真实服务'; }, { immediate: true });
watch(() => state.liveText.length + state.events.length, () => { if (busy.value) scrollTop.value += 100000; });
onUnmounted(() => controller.dispose());
function reload() { void controller.attach(props.conversationId, props.visible); }
function setAnswer(id: string, question: string, value: string) { (answers[id] ||= {})[question] = value; }
function answerInput(id: string, question: string, event: any) { setAnswer(id, question, String(event.detail.value)); }
function choose(id: string, question: string, value: string, multiple: boolean) {
  if (!multiple) return setAnswer(id, question, value);
  const values = (answers[id]?.[question] || '').split(', ').filter(Boolean);
  setAnswer(id, question, (values.includes(value) ? values.filter(v => v !== value) : [...values, value]).join(', '));
}
function toggleResource(id: string) { if (!busy.value) state.selected = state.selected.includes(id) ? state.selected.filter(v => v !== id) : [...state.selected, id]; }
async function addFile() {
  if (busy.value || state.submitting || !state.session || state.session.status === 'closed') return toast('请等待当前工作结束');
  const id = state.session.id;
  try { const file = await chooseWorkFile(); if (file && props.visible && state.session?.id === id) await controller.upload(file); }
  catch (e: any) { toast(e.message || '文件添加失败'); }
}
function send() { if (hasUnfinishedCall()) return toast('请先完成当前通话并保存结果'); if (state.session?.status === 'closed') return toast('工作会话已关闭，请新建对话'); if (!busy.value) void controller.send(); }
function approve(item: WorkInteraction) { if (hasUnfinishedCall()) return toast('请先完成当前通话并保存结果'); void controller.answer(item, { approved: true }); }
function close() { uni.showModal({ title: '关闭工作会话', content: '关闭后保留记录和产物，后续请新建对话交办工作。', success: r => { if (r.confirm) void controller.interrupt(true); } }); }
async function download(file: { id: string; name: string }) { try { if (state.session) await openWorkArtifact(state.session.id, file); } catch (e: any) { toast(e.message); } }
</script>

<style scoped>
.work { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.work-scroll { flex: 1; min-height: 0; height: 0; }
.work-content { padding: 12px 20px 30px; }
.work-note { color: #7b879b; font-size: 12px; padding: 10px 0; }
.work-welcome { line-height: 1.8; margin: 28px 0; color: #53617d; }
.work-welcome text,.work-text { display: block; white-space: pre-wrap; }
.work-message { padding: 14px; background: #fff; border-radius: 12px; margin: 12px 0; }
.work-message.user { background: #e9efff; }
.work-author { display: block; color: #7b879b; font-size: 12px; margin-bottom: 8px; }
.interaction { border: 1px solid #e0a64d; background: #fff9ee; padding: 14px; border-radius: 12px; margin: 14px 0; }
.interaction.red { border-color: #c45151; background: #fff2f2; }
.interaction-title { display: block; font-weight: 600; font-size: 14px; margin-bottom: 10px; }
.question { margin: 12px 0; }
.option { padding: 9px; border: 1px solid #e0e6f2; border-radius: 8px; margin-top: 8px; }
.option.selected { border-color: #294fdb; background: #eef2ff; }
.option-description { display: block; color: #7b879b; font-size: 12px; }
.answer-input { background: #fff; margin: 10px 0; padding: 10px; font-size: 14px; border-radius: 6px; }
.operation-params { display: block; white-space: pre-wrap; word-break: break-all; font-size: 12px; max-height: 240px; overflow: auto; }
.buttons { display: flex; gap: 10px; margin-top: 12px; }
.buttons button { margin: 0; }
.artifact { display: flex; justify-content: space-between; gap: 10px; padding: 12px 0; color: #294fdb; font-size: 13px; }
.work-error { color: #b33b3b; font-size: 13px; white-space: pre-wrap; }.work-error text { display: block; padding: 10px 0; }
.logs { font-size: 11px; color: #637086; word-break: break-all; }.logs text { display: block; margin: 6px 0; white-space: pre-wrap; }
.work-composer { padding: 8px 14px calc(8px + env(safe-area-inset-bottom)); }
.resources { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }.resources view { border: 1px solid #dce3f2; border-radius: 8px; padding: 6px; }.resources .selected { color: #294fdb; background: #e9efff; }
.composer-actions { display: flex; align-items: center; gap: 14px; color: #637086; font-size: 12px; }.composer-actions view { font-size: 26px; color: #294fdb; }
</style>
