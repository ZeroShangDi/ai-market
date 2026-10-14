<template>
  <view class="chat-page" :style="pageStyle">
    <MobileHeader title="AI 对话" back-icon="/static/figma/2-71-imgFrame.svg" back-fallback="/pages/index/index"
      action-icon="/static/ai-chat/history.svg" action-label="会话历史" @action="openHistory" />
    <view class="chat-shell">
      <view class="conversation-bar">
        <text class="conversation-title">{{ active?.messages.length ? active.title : '一起理清思路' }}</text>
        <view class="new-chat" role="button" aria-label="新建会话" @tap="newChat"><TIcon name="add" size="16px" />新会话</view>
      </view>
      <scroll-view class="message-scroll" scroll-y :scroll-top="scrollTop" :scroll-with-animation="false"
        @scroll="onScroll" @touchmove="followLatest = false" @wheel="followLatest = false" @scrolltolower="followLatest = true">
        <AgentTaskPanel :conversation-id="state.activeId" :visible="pageVisible" />
        <view v-if="state.error" class="error-note">{{ state.error }}<view role="button" @tap="aiChat.initialize()">刷新会话</view></view>
        <view v-if="state.loading" class="conversation-note">正在加载会话…</view>
        <view v-if="state.messageCursor && !state.generating && !state.recovering" class="latest-row"><view role="button" @tap="aiChat.loadOlderMessages()">查看更早消息</view></view>
        <view v-if="!active?.messages.length" class="welcome">
          <view class="welcome-mark">✦</view>
          <text class="welcome-eyebrow">你的私人助理</text>
          <view class="welcome-title"><text>有问题，有想法，</text><text>一起找到下一步</text></view>
          <view class="welcome-description"><text>写作、梳理、日常规划，</text><text>把事情理清，把工作推进。</text></view>
          <view class="suggestions">
            <view v-for="suggestion in suggestions" :key="suggestion.prompt" class="suggestion" role="button"
              :aria-label="suggestion.prompt" @tap="send(suggestion.prompt)">
              <view class="suggestion-icon" :class="suggestion.tone"><TIcon :name="suggestion.icon" size="21px" /></view>
              <view class="suggestion-copy"><text>{{ suggestion.title }}</text><text class="suggestion-description">{{ suggestion.description }}</text></view>
              <TIcon name="chevron-right" size="18px" color="#a0aabd" />
            </view>
          </view>
        </view>
        <view v-else class="messages">
          <text class="conversation-note">{{ mockEnabled ? '统子哥 · 演示对话' : '统子哥' }}</text>
          <view v-for="message in active.messages" :key="message.id" class="message-item">
            <TChatMessage :chat-id="message.id" :role="message.role" :placement="message.role === 'user' ? 'right' : 'left'"
              :name="message.role === 'assistant' ? '统子哥' : undefined" :status="message.status" animation="dots" variant="base"
              :content="message.role === 'user' ? [{ type: 'text', data: message.content }] : undefined">
              <template #content>
                <text v-if="message.role === 'user'" class="user-message-text">{{ message.content }}</text>
                <TChatMarkdown v-else-if="message.content" :content="message.content"
                  :streaming="{ hasNextChunk: message.status === 'streaming', tail: true }" />
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
      <view v-if="!followLatest && active?.messages.length" class="latest-row"><view role="button" @tap="jumpToLatest">↓ 回到最新消息</view></view>
      <view class="composer" :class="{ 'keyboard-open': keyboardOpen }">
        <TChatSender :value="active?.draft || ''" :loading="state.generating || state.recovering" placeholder="输入问题，聊聊你的想法…"
          :render-presets="[{ name: 'send', type: 'icon' }]" :textarea-props="{ autosize: { minHeight: 48, maxHeight: 176 } }"
          :adjust-position="false" :auto-rise-with-keyboard="false" @update:value="updateDraft" @send="onSend"
          @stop="stop" @keyboardheightchange="keyboardChanged">
          <template #footer-prefix><text class="composer-label">✦ 统子哥</text></template>
        </TChatSender>
        <text class="preview-note">{{ mockEnabled ? '演示模式 · 回复为模拟内容' : 'AI 回复仅供参考 · 不会自动读取客户资料' }}</text>
      </view>
    </view>
    <TPopup :visible="historyVisible" placement="bottom" :close-btn="true" :z-index="28" :overlay-props="{ zIndex: 27 }"
      @visible-change="historyVisible = $event.visible">
      <view class="history-panel">
        <text class="history-title">会话历史</text>
        <text class="history-subtitle">{{ mockEnabled ? '本次预览期间保留，关闭应用后清空' : '会话保存在当前工作区，仅本人可见' }}</text>
        <view class="history-new" role="button" @tap="newChat"><TIcon name="add" size="18px" />开始新会话</view>
        <scroll-view class="history-list" scroll-y>
          <view v-if="!history.length" class="history-empty">还没有会话，先聊一个问题吧</view>
          <view v-for="item in history" :key="item.id" class="history-item" :class="{ selected: item.id === state.activeId }">
            <view class="history-item-copy" role="button" :aria-label="item.title" @tap="selectChat(item.id)">
              <text class="history-item-title">{{ item.title }}</text><text class="history-item-date">{{ when(item.updated_at) }}</text>
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
import { computed, nextTick, ref, watch } from 'vue';
import { onBackPress, onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import TChatMessage from '@tdesign/uniapp-chat/chat-message/chat-message.vue';
import TChatMarkdown from '@tdesign/uniapp-chat/chat-markdown/chat-markdown.vue';
import TChatSender from '@tdesign/uniapp-chat/chat-sender/chat-sender.vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import TPopup from '@tdesign/uniapp/popup/popup.vue';
import '@tdesign/uniapp/theme.css';
import MobileHeader from '@/components/MobileHeader.vue';
import AgentTaskPanel from '@/components/AgentTaskPanel.vue';
import { aiChat } from '@/services/ai-chat';
import { mockEnabled } from '@/config';
import { ensureSession } from '@/services/session';
import { automaticCall } from '@/services/automatic-call';
import { hasUnfinishedCall } from '@/services/calls';
import { toast, when } from '@/ui/format';

const { state, active, stop } = aiChat;
const pageVisible = ref(false);
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
const history = computed(() => state.conversations.filter(item => !mockEnabled || item.messages.length).slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
const suggestions = [
  { title: '起草一封邮件', description: '说清目的，表达得体', prompt: '帮我起草一封工作邮件，先问我收件人和邮件目的', icon: 'chat', tone: 'blue' },
  { title: '整理一段内容', description: '提炼重点，理清结构', prompt: '帮我整理一段内容，提炼重点，先让我提供原文', icon: 'user', tone: 'purple' },
  { title: '安排今天的工作', description: '排好优先级，从容推进', prompt: '帮我安排今天的工作，先问我需要处理哪些事情', icon: 'calendar', tone: 'green' },
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
async function newChat() { await aiChat.newConversation(true); historyVisible.value = false; followLatest.value = true; scrollTop.value = 0; lastScrollTop = 0; uni.hideKeyboard(); }
function openHistory() { uni.hideKeyboard(); historyVisible.value = true; }
async function selectChat(id: string) { await aiChat.select(id); historyVisible.value = false; void jumpToLatest(); }
function deleteChat(id: string) {
  uni.showModal({ title: '删除会话', content: '删除后无法恢复，确认删除这段对话？', success: result => { if (result.confirm) void aiChat.remove(id); } });
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
  void aiChat.resume().then(async () => {
    if (!state.initialized || !state.visible) return;
    if (requestedConversation.value) {
      const id = requestedConversation.value;
      requestedConversation.value = '';
      if (state.conversations.some(item => item.id === id)) await aiChat.select(id);
      else toast('这段对话已不可访问，请从会话历史选择');
    }
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
  pageVisible.value = false;
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
</style>
