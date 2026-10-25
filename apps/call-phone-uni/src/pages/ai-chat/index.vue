<template>
  <view class="chat-page" :style="pageStyle">
    <MobileHeader :title="pageTitle" back-icon="/static/figma/2-71-imgFrame.svg" back-fallback="/pages/index/index">
      <template #actions><view class="header-tools">
        <view role="button" aria-label="新建会话" @tap="newChat"><TIcon name="add" size="21px" /></view>
        <view role="button" aria-label="会话历史" @tap="openHistory"><TIcon name="history" size="21px" /></view>
      </view></template>
    </MobileHeader>
    <view class="chat-shell">
      <WorkConversation v-if="mode === 'work'" :conversation-id="state.activeId" :visible="pageVisible" @started="workStarted = true" @title="workTitle = $event">
        <template #mode><view v-if="!modeLocked" class="composer-mode"><ConversationModeToggle mode="work" :locked="false" @change="setMode" /></view></template>
      </WorkConversation>
      <scroll-view v-else class="message-scroll" scroll-y :scroll-top="scrollTop" :scroll-with-animation="false"
        @scroll="onScroll" @touchmove="followLatest = false" @wheel="followLatest = false" @scrolltolower="followLatest = true">
        <view v-if="state.error" class="error-note">{{ state.error }}<view role="button" @tap="aiChat.initialize()">刷新会话</view></view>
        <view v-if="state.loading" class="conversation-note">正在加载会话…</view>
        <view v-if="state.messageCursor && !state.generating && !state.recovering" class="latest-row"><view role="button" @tap="aiChat.loadOlderMessages()">查看更早消息</view></view>
        <view v-if="!active?.messages.length" class="welcome">
          <view class="welcome-title">有什么可以帮你？</view>
        </view>
        <view v-else class="messages">
          <view v-for="message in active.messages" :key="message.id" class="message-item">
            <TChatMessage :chat-id="message.id" :role="message.role" :placement="message.role === 'user' ? 'right' : 'left'"
              :name="message.role === 'assistant' ? '统子哥' : undefined" :status="message.status" animation="dots" variant="base"
              :content="message.role === 'user' ? [{ type: 'text', data: message.content }] : undefined">
              <template #content>
                <text v-if="message.role === 'user'" class="user-message-text">{{ message.content }}</text>
                <TChatMarkdown v-else-if="message.content" :content="message.content"
                  :streaming="{ hasNextChunk: message.status === 'streaming', tail: true }" @click="handleMarkdownClick" />
                <text v-if="message.status === 'error'" class="error-note">{{ message.error_message }}</text>
                <text v-if="message.status === 'stop' && !message.content" class="stopped-empty">已停止生成</text>
              </template>
              <template #actionbar>
                <view v-if="message.status !== 'pending' && message.status !== 'streaming'" class="message-actions">
                  <view v-if="message.content" role="button" aria-label="复制回复" @tap="copy(message.content)"><TIcon name="copy" size="16px" />复制</view>
                  <view v-if="message.id === lastMessageId && !state.generating && !state.recovering" role="button" aria-label="重新生成" @tap="retry(message.id)"><TIcon name="refresh" size="16px" />重新生成</view>
                  <text v-if="message.status === 'stop' && message.content" class="stopped-note">已停止</text>
                </view>
              </template>
            </TChatMessage>
          </view>
          <view id="chat-bottom" class="chat-bottom" />
        </view>
      </scroll-view>
      <text v-if="mode === 'chat' && state.generating && state.activity" class="stream-activity">{{ state.activity }}</text>
      <view v-if="mode === 'chat' && !followLatest && active?.messages.length" class="latest-row"><view role="button" @tap="jumpToLatest">↓ 回到最新消息</view></view>
      <view v-if="mode === 'chat'" class="composer" :class="{ 'keyboard-open': keyboardOpen }">
          <view v-if="!active?.messages.length" class="suggestions">
            <view v-for="suggestion in suggestions" :key="suggestion.prompt" class="suggestion" role="button"
              :aria-label="suggestion.prompt" @tap="send(suggestion.prompt)">
              <view class="suggestion-icon" :class="suggestion.tone"><TIcon :name="suggestion.icon" size="21px" /></view>
              <view class="suggestion-copy"><text>{{ suggestion.title }}</text></view>

            </view>
          </view>

        <view v-if="!modeLocked" class="composer-mode"><ConversationModeToggle mode="chat" :locked="false" @change="setMode" /></view>
        <TChatSender :value="active?.draft || ''" :loading="state.generating || state.recovering" placeholder="输入问题，聊聊你的想法…"
          :render-presets="[{ name: 'send', type: 'icon' }]" :textarea-props="{ autosize: { minHeight: '48px', maxHeight: '160px' } }"
          :adjust-position="false" :auto-rise-with-keyboard="false" @update:value="updateDraft" @send="onSend"
          @stop="stop" @keyboardheightchange="keyboardChanged">
          <template #footer-prefix>
            <view class="composer-tools">
              <view v-if="!mockEnabled" class="web-toggle" :class="{ active: state.webSearch }" role="button"
                :aria-label="state.webSearch ? '关闭联网搜索' : '开启联网搜索'" :aria-pressed="state.webSearch"
                @tap="!state.generating && !state.recovering && (state.webSearch = !state.webSearch)">联网</view>
            </view>
          </template>
        </TChatSender>
        <text v-if="mockEnabled" class="preview-note">演示模式</text>
      </view>
    </view>
    <TPopup :visible="historyVisible" placement="bottom" :close-btn="true" :z-index="28" :overlay-props="{ zIndex: 27 }"
      @visible-change="historyVisible = $event.visible">
      <view class="history-panel">
        <text class="history-title">会话历史</text>
        <input v-model="historyQuery" class="history-search" placeholder="搜索会话标题" confirm-type="search" />
        <text v-if="workInbox.error" class="error-note" @tap="refreshWorkInbox">{{ workInbox.error }} · 重试</text>
        <view class="history-new" role="button" @tap="newChat"><TIcon name="add" size="18px" />开始新会话</view>
        <scroll-view class="history-list" scroll-y>
          <view v-if="!history.length" class="history-empty">{{ historyQuery ? '没有匹配的会话' : '还没有会话' }}</view>
          <view v-for="item in history" :key="item.id" class="history-item" :class="{ selected: item.id === state.activeId }">
            <view class="history-item-copy" role="button" :aria-label="item.title" @tap="selectChat(item.id)">
              <view class="conversation-heading"><text class="history-item-title">{{ item.title }}</text><text class="conversation-kind">{{ item.work ? '工作' : '聊天' }}</text></view><text class="history-item-date">{{ item.work ? workStatus(item.work) + ' · ' : '' }}{{ when(item.updated_at) }}</text>
            </view>
            <view class="history-delete" role="button" aria-label="删除会话" @tap="deleteChat(item.id)"><TIcon name="delete" size="18px" /></view>
          </view>
          <view v-if="state.nextCursor" class="history-new" role="button" @tap="aiChat.loadMoreConversations()">加载更多会话</view>
        </scroll-view>
      </view>
    </TPopup>
  </view>
</template>

<script setup lang="ts">
import { incomingWorkFiles } from '@/services/incoming-work-files';
import ConversationModeToggle from '@/components/ConversationModeToggle.vue';
import { workInbox, refreshWorkInbox, workStatus } from '@/services/work';
import { computed, nextTick, ref, watch } from 'vue';
import { onBackPress, onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import TChatMessage from '@tdesign/uniapp-chat/chat-message/chat-message.vue';
import TChatMarkdown from '@tdesign/uniapp-chat/chat-markdown/chat-markdown.vue';
import TChatSender from '@tdesign/uniapp-chat/chat-sender/chat-sender.vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import TPopup from '@tdesign/uniapp/popup/popup.vue';
import '@tdesign/uniapp/theme.css';
import MobileHeader from '@/components/MobileHeader.vue';
import WorkConversation from '@/components/WorkConversation.vue';
import { aiChat } from '@/services/ai-chat';
import { mockEnabled } from '@/config';
import { ensureSession } from '@/services/session';
import { automaticCall } from '@/services/automatic-call';
import { hasUnfinishedCall } from '@/services/calls';
import { toast, when } from '@/ui/format';
import { handleMarkdownClick } from '@/ui/chat-markdown';

const { state, active, stop } = aiChat;
const mode = ref<'chat' | 'work'>('chat');
const pageVisible = ref(false), workStarted = ref(false), workTitle = ref(''), historyQuery = ref('');
const summary = computed(() => workInbox.items.find(item => item.conversation_id === state.activeId));
const modeLocked = computed(() => incomingWorkFiles.conversation === state.activeId && incomingWorkFiles.items.length > 0 || workInbox.loading || workStarted.value || !!summary.value?.started || !!active.value?.messages.length || state.generating || state.recovering);
const pageTitle = computed(() => mode.value === 'work' ? (workTitle.value || summary.value?.title || '新工作') : (active.value?.messages.length ? active.value.title : '新会话'));
function setMode(value: 'chat' | 'work') { if (!modeLocked.value) mode.value = value; }
watch(() => state.activeId, () => { workStarted.value = false; workTitle.value = ''; mode.value = summary.value?.started ? 'work' : 'chat'; });
watch(() => summary.value?.started, started => { if (started) mode.value = 'work'; });
let preparingIncoming = false;
let failedIncomingBatch = '';
async function openIncomingConversation() {
  if (preparingIncoming || state.loading || failedIncomingBatch === incomingWorkFiles.batch || !pageVisible.value || !state.initialized || !state.visible || !incomingWorkFiles.items.length || incomingWorkFiles.conversation || hasUnfinishedCall()) return;
  preparingIncoming = true;
  try {
    if (!await aiChat.newConversation(true)) throw new Error("会话创建失败");
    await nextTick();
    if (!state.activeId || !pageVisible.value) return;
    incomingWorkFiles.conversation = state.activeId;
    mode.value = 'work';
  } catch { failedIncomingBatch = incomingWorkFiles.batch; toast('创建工作会话失败，文件已保留，返回页面可重试'); } finally { preparingIncoming = false; }
}
watch(pageVisible, visible => { if (!visible) failedIncomingBatch = ''; });
watch(() => [incomingWorkFiles.batch, pageVisible.value, state.initialized, state.loading], () => { void openIncomingConversation(); });
const requestedConversation = ref('');
onLoad(query => { requestedConversation.value = String(query?.conversation || ''); });
const historyVisible = ref(false), scrollTop = ref(0), followLatest = ref(true);
const keyboardHeight = ref(0), webHeight = ref(0);
const keyboardOpen = computed(() => keyboardHeight.value > 0);
const pageStyle = computed(() => {
  // App's adjustResize already removes the keyboard from the viewport height.
  // Subtracting it again leaves a keyboard-sized gap below the composer.
  // #ifdef APP-PLUS
  return { height: '100vh' };
  // #endif
  // #ifndef APP-PLUS
  return { height: webHeight.value ? `${webHeight.value}px` : `calc(100vh - ${keyboardHeight.value}px)` };
  // #endif
});
const lastMessageId = computed(() => active.value?.messages.at(-1)?.id);
const history = computed(() => {
  const items = state.conversations.filter(item => !mockEnabled || item.messages.length).map(item => {
    const work = workInbox.items.find(w => w.conversation_id === item.id && w.started);
    return { ...item, title: work?.title || item.title, updated_at: work?.updated_at || item.updated_at, work };
  });
  for (const work of workInbox.items.filter(w => w.started)) if (!items.some(i => i.id === work.conversation_id)) items.push({ id: work.conversation_id, title: work.title, updated_at: work.updated_at, messages: [], draft: '', work });
  return items.filter(item => item.title.toLowerCase().includes(historyQuery.value.trim().toLowerCase())).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
});
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(historyQuery, query => {
  clearTimeout(searchTimer);
  if (!query.trim()) return;
  searchTimer = setTimeout(async () => {
    while (historyVisible.value && historyQuery.value === query && state.nextCursor) {
      const cursor = state.nextCursor;
      await aiChat.loadMoreConversations();
      if (state.nextCursor === cursor) break;
    }
  }, 250);
});
const suggestions = [
  { title: '起草邮件', description: '说清目的，表达得体', prompt: '帮我起草一封工作邮件，先问我收件人和邮件目的', icon: 'chat', tone: 'blue' },
  { title: '整理内容', description: '提炼重点，理清结构', prompt: '帮我整理内容，提炼重点，先让我提供原文', icon: 'user', tone: 'purple' },
  { title: '安排工作', description: '排好优先级，从容推进', prompt: '帮我安排工作，先问我需要处理哪些事情', icon: 'calendar', tone: 'green' },
];


let lastScrollTop = 0;
async function jumpToLatest() {
  followLatest.value = true;
  await nextTick();
  // Query after Markdown layout rather than assuming a fixed message height.
  uni.createSelectorQuery().select('.messages').boundingClientRect(rect => {
    if (rect && !Array.isArray(rect)) scrollTop.value = Math.max(lastScrollTop + 1, rect.height || 0);
  }).exec();
}
let scrollTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => active.value?.messages.map(item => `${item.id}:${item.content.length}:${item.status}`).join('|'), () => {
  if (!followLatest.value) return;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { if (followLatest.value) void jumpToLatest(); }, 65);
});
function onScroll(event: { detail: { scrollTop: number; scrollHeight: number } }) {
  lastScrollTop = event.detail.scrollTop;
  // User gestures pause following; scrolltolower restores it at the end.
}
function updateDraft(value: string) { if (active.value) active.value.draft = value; }
async function send(value: string) {
  if (hasUnfinishedCall()) return toast('请先完成当前通话并保存结果');
  if (Array.from(value.trim()).length > 2000) return toast('单条问题最多 2000 字');
  if (await aiChat.send(value)) { followLatest.value = true; void jumpToLatest(); }
}
function onSend(event: { value: string }) { send(event.value); }
async function retry(id: string) {
  if (hasUnfinishedCall()) return toast('请先完成当前通话并保存结果');
  if (await aiChat.retry(id)) { followLatest.value = true; void jumpToLatest(); }
}
function copy(content: string) { uni.setClipboardData({ data: content, fail: () => toast('复制失败，请重试') }); }
async function newChat() { await aiChat.newConversation(true); mode.value = 'chat'; workStarted.value = false; workTitle.value = ''; historyVisible.value = false; followLatest.value = true; scrollTop.value = 0; lastScrollTop = 0; uni.hideKeyboard(); }
function openHistory() { uni.hideKeyboard(); historyVisible.value = true; if (!mockEnabled) void refreshWorkInbox(); }
function includeWorkConversation(id: string) { const work = workInbox.items.find(w => w.conversation_id === id); if (work && !state.conversations.some(c => c.id === id)) state.conversations.push({ id, title: work.title, updated_at: work.updated_at, messages: [], draft: '' }); }
async function selectChat(id: string) { includeWorkConversation(id); await aiChat.select(id); mode.value = summary.value?.started ? 'work' : 'chat'; historyVisible.value = false; void jumpToLatest(); }
function deleteChat(id: string) {
  uni.showModal({ title: '删除会话', content: '删除后无法恢复，确认删除这段对话？', success: async result => { if (result.confirm) { await aiChat.remove(id); if (!mockEnabled) await refreshWorkInbox(); } } });
}
function keyboardChanged(event: { height: number }) {
  keyboardHeight.value = Math.max(0, event.height);
  if (followLatest.value) setTimeout(() => void jumpToLatest(), 100);
}
// H5 follows the visible viewport; App lets adjustResize resize the viewport.
// #ifdef H5
function resizeWebViewport() {
  webHeight.value = window.visualViewport?.height || window.innerHeight;
  keyboardHeight.value = Math.max(0, window.innerHeight - webHeight.value);
}
window.visualViewport?.addEventListener('resize', resizeWebViewport);
window.addEventListener('resize', resizeWebViewport);
resizeWebViewport();
// #endif
watch(automaticCall, call => { if (call) { historyVisible.value = false; stop(); uni.hideKeyboard(); } });
onShow(() => {
  if (!ensureSession()) return;
  pageVisible.value = true;
  void Promise.all([aiChat.resume(), mockEnabled ? Promise.resolve() : refreshWorkInbox()]).then(async () => {
    if (!state.initialized || !state.visible) return;
    if (requestedConversation.value) {
      const id = requestedConversation.value;
      requestedConversation.value = '';
      if (state.conversations.some(item => item.id === id) || workInbox.items.some(item => item.conversation_id === id)) { includeWorkConversation(id); await aiChat.select(id); }
      else toast('这段对话已不可访问，请从会话历史选择');
    }
    await openIncomingConversation();
    if (summary.value?.started || incomingWorkFiles.conversation === state.activeId) mode.value = 'work';
    if (active.value?.messages.length) void jumpToLatest();
  });
});
onHide(() => { pageVisible.value = false; aiChat.suspend(); historyVisible.value = false; keyboardHeight.value = 0; clearTimeout(scrollTimer); });
onBackPress(() => {
  if (hasUnfinishedCall()) { toast('请先完成当前通话并保存结果'); return true; }
  if (historyVisible.value) { historyVisible.value = false; return true; }
  return false;
});
onUnload(() => {
  pageVisible.value = false; clearTimeout(searchTimer);
  aiChat.suspend(); clearTimeout(scrollTimer);
  // #ifdef H5
  window.visualViewport?.removeEventListener('resize', resizeWebViewport);
  window.removeEventListener('resize', resizeWebViewport);
  // #endif
});
</script>

<style scoped lang="scss">
.chat-page {
  display: flex; flex-direction: column; overflow: hidden; background: #f7f8fc;
  --td-brand-color: #294fdb; --td-primary-color-7: #294fdb;
  --td-font-size-m: 30rpx; --td-bg-color-secondarycontainer: #e9efff;
  // The existing app uses a light theme even when the system requests dark mode.
  --td-text-color-primary: #374259; --td-text-color-secondary: #637086;
  --td-text-color-placeholder: #8e99aa; --td-text-color-disabled: #9ca6b9; --td-text-color-anti: #fff;
  --td-bg-color-container: #fff; --td-bg-color-specialcomponent: #fff; --td-bg-color-secondarycomponent: #dce3f2;
  --td-component-border: #e0e6f2; --td-popup-bg-color: #fff; --td-popup-close-btn-color: #637086;
}
.chat-shell { width: 100%; max-width: 500px; margin: 0 auto; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.conversation-bar { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 20px 12px; }
.conversation-title { color: #929bad; font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.new-chat { flex-shrink: 0; display: flex; align-items: center; gap: 4px; color: #53617d; font-size: 12px; background: #fff; padding: 8px 10px; border-radius: 10px; }
.composer-mode { display: flex; justify-content: flex-end; padding: 0 4px 8px; }
.mode-switch { display: flex; gap: 10px; flex-shrink: 0; font-size: 13px; color: #929bad; }.mode-switch .selected { color: #294fdb; font-weight: 600; }
.message-scroll { flex: 1; min-height: 0; height: 0; }
.welcome { padding: 38px 24px 24px; }
.welcome-mark { width: 64px; height: 64px; border-radius: 21px; display: flex; align-items: center; justify-content: center; font-size: 41px; color: #fff; background: #294fdb; box-shadow: 0 9px 24px rgba(41,79,219,.17); margin-bottom: 26px; }
.welcome-eyebrow { display: block; font-size: 12px; letter-spacing: 2px; color: #7887a6; margin-bottom: 10px; }
.welcome-title { display: block; font-size: 28px; font-weight: 600; letter-spacing: -.5px; line-height: 1.45; white-space: pre-line; }
.welcome-title text, .welcome-description text { display: block; }
.welcome-description { display: block; margin-top: 13px; font-size: 13px; color: #8992a3; line-height: 1.8; white-space: pre-line; }
.suggestions { display: flex; flex-direction: column; gap: 10px; margin-top: 30px; }
.suggestion { padding: 15px 14px; display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid #edf0f6; border-radius: 16px; }
.suggestion-icon { width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.blue { color: #4770dd; background: #edf2ff; }.purple { color: #8572cc; background: #f3effd; }.green { color: #479d8b; background: #edf8f4; }
.suggestion-copy { display: flex; flex: 1; flex-direction: column; gap: 5px; font-size: 14px; font-weight: 500; }
.suggestion-description { font-size: 11px; color: #98a0af; font-weight: 400; }
.messages { padding: 14px 20px 0; }
.conversation-note { display: block; text-align: center; color: #a2aabb; font-size: 11px; padding: 0 0 24px; }
.message-item { margin-bottom: 24px; }
.message-actions { display: flex; gap: 16px; align-items: center; padding-top: 12px; color: #929bad; font-size: 11px; }
.message-actions view { display: flex; gap: 5px; align-items: center; min-height: 30px; }
.user-message-text { white-space: pre-wrap; word-break: break-word; }
.error-note { display: block; color: #c45050; font-size: 13px; margin-top: 8px; }.stopped-empty { color: #929bad; font-size: 13px; }.stopped-note { color: #a3aaba; font-size: 11px; }
.chat-bottom { height: 12px; }
.latest-row { height: 0; position: relative; display: flex; justify-content: center; z-index: 2; }
.latest-row view { position: absolute; bottom: 8px; border: 1px solid #e8ecf6; background: #fff; border-radius: 20px; padding: 8px 14px; color: #536aaf; font-size: 12px; box-shadow: 0 2px 10px rgba(20,31,51,.06); }
.composer { flex-shrink: 0; padding: 8px 16px calc(10px + env(safe-area-inset-bottom)); background: #f7f8fc; }
.composer.keyboard-open { padding-bottom: 8px; }
.composer-label { font-size: 11px; color: #8290b2; }
.composer-tools { display: flex; align-items: center; gap: 10px; }
.web-toggle { padding: 5px 9px; border: 1px solid #e0e6f2; border-radius: 12px; color: #8290b2; font-size: 11px; }
.web-toggle.active { color: #365ccc; background: #edf2ff; border-color: #cbd8fc; }
.stream-activity { padding: 0 20px 4px; color: #7181a6; font-size: 11px; }
.preview-note { display: block; font-size: 10px; text-align: center; color: #9aa3b5; margin-top: 10px; }
:deep(.t-chat-sender) { margin: 0; border: 1px solid #e0e6f2; border-radius: 20px; box-shadow: 0 4px 16px rgba(31,52,99,.035); padding: 14px 0 10px; }
:deep(.t-chat-message) { margin-bottom: 0; }
:deep(.t-chat-message__base) { padding-left: 0 !important; font-size: 12px; color: #7787a5; }
:deep(.t-chat-message--base.user .t-chat-content) { padding: 12px 16px; border-radius: 16px 4px 16px 16px; color: #263e82; max-width: 90%; }
:deep(.t-chat-markdown) { font-size: 14px; line-height: 1.8; color: #374259; }
.history-panel { max-width: 500px; margin: auto; padding: 26px 20px calc(24px + env(safe-area-inset-bottom)); }
.history-title { display: block; font-size: 20px; font-weight: 600; }.history-subtitle { display: block; font-size: 11px; color: #929bad; margin-top: 7px; }
.history-new { display: flex; align-items: center; justify-content: center; gap: 6px; background: #edf2ff; color: #294fdb; font-size: 14px; padding: 13px; border-radius: 12px; margin: 22px 0 16px; }
.history-list { height: 40vh; }.history-empty { text-align: center; padding: 50px 0; color: #a0a8b7; font-size: 13px; }
.history-item { display: flex; align-items: center; padding: 14px 12px; border-radius: 12px; margin-bottom: 6px; }.history-item.selected { background: #f5f7fc; }
.history-item-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 7px; }.history-item-title { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.history-item-date { font-size: 11px; color: #98a1b1; }.history-delete { padding: 10px; color: #9ba4b4; }
.header-tools { display: flex; gap: 6px; flex-shrink: 0; }.header-tools > view { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
.history-search { margin-top: 18px; background: #f3f5f9; border-radius: 12px; padding: 12px 14px; font-size: 14px; }
.welcome { padding: 17vh 24px 24px; }.welcome-title { text-align: center; font-size: 25px; }
.suggestions { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 26px; }.suggestion { padding: 8px 10px; border-radius: 18px; gap: 5px; }.suggestion-icon { width: 23px; height: 23px; background: transparent; }.suggestion-copy { font-size: 11px; }
.mode-switch text { padding: 6px 8px; }.mode-switch .selected { background: #edf2ff; border-radius: 12px; }
.suggestions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 0 0 12px; }
.suggestion { padding: 11px 4px; justify-content: center; gap: 5px; background: #fff; border: 1px solid #e7e8eb; border-radius: 12px; min-width: 0; }
.suggestion-copy { flex: initial; font-size: 12px; color: #5d6169; white-space: nowrap; }.suggestion-icon { width: 18px; height: 18px; color: #80858e; }.suggestion-icon :deep(.t-icon) { font-size: 16px !important; }
@media (max-width: 340px) { .suggestions { grid-template-columns: 1fr; gap: 5px; }.suggestion { justify-content: flex-start; padding: 9px 13px; } }
.suggestion-icon.blue { color: #5885ce; }.suggestion-icon.purple { color: #9876c9; }.suggestion-icon.green { color: #3c9a79; }
.header-tools > view:first-child { color: #5885ce; }.header-tools > view:last-child { color: #8e75c9; }
:deep(.t-chat-sender__textarea--control) { box-sizing: border-box; padding-bottom: 0; max-height: 160px; overflow-y: auto !important; }:deep(.t-chat-sender__textarea) { max-height: 160px; overflow: hidden; }:deep(.uni-textarea-wrapper) { max-height: 160px !important; overflow: hidden; }:deep(.uni-textarea-textarea) { max-height: 160px !important; overflow-y: auto !important; }
</style>

<style scoped>
.conversation-heading { display: flex; align-items: center; gap: 6px; min-width: 0; }
.conversation-heading > text:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conversation-kind { flex-shrink: 0; font-size: 10px; line-height: 16px; font-weight: 400; color: #9298a3; padding: 0 4px; border: 1px solid #e5e7eb; border-radius: 4px; }
</style>
