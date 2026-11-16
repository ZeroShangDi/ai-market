<template>
  <view class="chat-page"><PromptHost />
    <view class="chat-head">
      <view class="status-space" />
      <view class="head-row">
        <view class="back" role="button" aria-label="返回" @tap="back">
          <AppIcon name="chevron-left" :size="20" color="#1a1f2e" />
        </view>

        <view class="peer">
          <ChatAvatar :name="peer.name" :color="peer.color" :src="peer.avatar" :size="34" :radius="10" />
          <view class="peer-copy">
            <text class="peer-name">{{ peer.name }}</text>
            <view class="peer-meta">
              <view class="dot" :class="peer.status" />
              <text>{{ peer.typeLabel }} · {{ statusText(peer.status) }}</text>
            </view>
          </view>
        </view>

        <view class="actions">
          <view class="action" role="button" aria-label="语音通话" @tap="startCall('voice')">
            <AppIcon name="phone" :size="18" color="#1a1f2e" />
          </view>
          <view class="action" role="button" aria-label="更多" @tap="openMenu">
            <ChatIcon name="more" :size="20" color="#1a1f2e" />
          </view>
        </view>
      </view>
    </view>

    <scroll-view
      class="messages"
      scroll-y
      :scroll-into-view="anchor"
      :scroll-with-animation="true"
      :show-scrollbar="false"
      @tap="closePanels"
    >
      <view v-for="message in messages" :key="message.id" :id="`msg-${message.id}`">
        <ChatMessage
          :message="message"
          :peer="peer"
          @longpress="onLongPress"
          @preview="previewImage"
          @play-voice="playVoice"
          @play-video="playVideo"
          @open-file="openFile"
        />
      </view>
      <view id="msg-bottom" class="bottom-pad" />
    </scroll-view>

    <view class="composer">
      <view class="input-bar">
        <view class="bar-btn" role="button" :aria-label="voiceMode ? '切换键盘' : '切换语音'" @tap="toggleVoice">
          <ChatIcon :name="voiceMode ? 'keyboard' : 'mic'" :size="24" color="#1a1f2e" />
        </view>

        <view class="field">
          <textarea
            v-if="!voiceMode"
            v-model="draft"
            class="input"
            :maxlength="500"
            :auto-height="true"
            :show-confirm-bar="false"
            :cursor-spacing="16"
            confirm-type="send"
            @focus="onInputFocus"
            @confirm="sendText"
          />
          <view
            v-else
            class="hold"
            :class="{ holding }"
            @touchstart.prevent="onHoldStart"
            @touchmove.prevent="onHoldMove"
            @touchend.prevent="onHoldEnd"
            @touchcancel.prevent="onHoldEnd"
          >
            <text>{{ holding ? '松开发送' : '按住 说话' }}</text>
          </view>
        </view>

        <view class="bar-btn" role="button" aria-label="表情" @tap="togglePanel('emoji')">
          <ChatIcon name="smile" :size="24" color="#1a1f2e" />
        </view>

        <view v-if="canSend" class="send" role="button" @tap="sendText">发送</view>
        <view v-else class="bar-btn" role="button" aria-label="更多功能" @tap="togglePanel('more')">
          <ChatIcon name="plus" :size="24" color="#1a1f2e" />
        </view>
      </view>

      <ChatEmojiPanel v-if="panel === 'emoji'" @select="insertEmoji" @delete="deleteEmoji" />
      <ChatMorePanel v-if="panel === 'more'" @action="onMoreAction" />
    </view>

    <ChatVoiceOverlay :visible="recording" :seconds="recordSeconds" />
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import AppIcon from '@/components/AppIcon.vue';
import ChatAvatar from '@/components/chat/ChatAvatar.vue';
import ChatIcon from '@/components/chat/ChatIcon.vue';
import ChatMessage from '@/components/chat/ChatMessage.vue';
import ChatEmojiPanel from '@/components/chat/ChatEmojiPanel.vue';
import ChatMorePanel from '@/components/chat/ChatMorePanel.vue';
import ChatVoiceOverlay from '@/components/chat/ChatVoiceOverlay.vue';
import PromptHost from '@/components/prompt/PromptHost.vue';
import { statusText, type AgentStatus, type ChatMessage as ChatMessageItem } from '@/types/chat';
import {
  AgentLinkError,
  fetchMessages,
  findBinding,
  removeBinding,
  sendMessage,
  unbindAgent,
  updateBinding,
  waitMessages,
  type AgentLinkBinding
} from '@/services/agent-link';

const peer = ref({
  id: '1',
  name: '研究 Agent',
  color: '#5b7cfa',
  typeLabel: '桌面 Agent',
  status: 'online' as AgentStatus,
  avatar: ''
});

const remote = ref<AgentLinkBinding | null>(null);
const messages = ref<ChatMessageItem[]>([]);
const draft = ref('');
const voiceMode = ref(false);
const panel = ref('');
const anchor = ref('');
const recording = ref(false);
const recordSeconds = ref(0);
const holding = ref(false);

let recordTimer: ReturnType<typeof setInterval> | undefined;
let remoteTimer: ReturnType<typeof setTimeout> | undefined;
let remoteAfter = 0;
let remoteVisible = false;
let remotePolling = false;
let remoteReady = false;
let startY = 0;
let recordCancelled = false;
let uid = 1000;
let keyboardHandler: ((result: { height: number }) => void) | undefined;
let keyboardTimer: ReturnType<typeof setTimeout> | undefined;

const canSend = computed(() => draft.value.trim().length > 0);

onLoad((options = {}) => {
  keyboardHandler = (result) => {
    if (result.height <= 0) return;
    keepLatestVisible();
  };
  (uni as any).onKeyboardHeightChange?.(keyboardHandler);

  if (options.remote === '1') {
    const binding = findBinding(options.agentId || '');
    if (!binding) {
      uni.showToast({ title: '配对不存在，请重新扫码', icon: 'none' });
      setTimeout(() => uni.navigateBack(), 600);
      return;
    }
    remote.value = binding;
    peer.value = {
      id: binding.agentId,
      name: binding.name,
      color: binding.icon === 'dsh' ? '#e8eeff' : '#294fdb',
      typeLabel: '远程 Agent',
      status: 'online',
      avatar: binding.icon === 'dsh' ? '/static/agent-icons/dsh.png' : ''
    };
    void loadRemote();
    return;
  }

  messages.value = [{ id: 'system', type: 'system', text: '请从 Agent 列表打开会话', time: Date.now() }];
});

onShow(() => {
  if (remote.value) startRemotePolling();
});

onHide(() => {
  stopRemotePolling();
});

onUnmounted(() => {
  if (keyboardHandler) (uni as any).offKeyboardHeightChange?.(keyboardHandler);
  clearTimeout(keyboardTimer);
  stopRecordTimer();
  stopRemotePolling();
});

function toChatMessages(rows: { id: string; direction: 'in' | 'out'; text: string; at: number }[]): ChatMessageItem[] {
  return rows.map((row) => ({
    id: row.id,
    type: 'text',
    side: row.direction === 'in' ? 'me' : 'other',
    text: row.text,
    time: row.at,
    read: true
  }));
}

async function loadRemote() {
  const binding = remote.value;
  if (!binding) return;
  try {
    const page = await fetchMessages(binding, 0);
    remoteAfter = page.cursor || 0;
    remoteReady = true;
    const allRows = page.messages || [];
    const rows = allRows.filter((item) => !item.type || item.type === 'text');
    if (rows.length) {
      messages.value = [{ id: 'remote-time', type: 'time', time: rows[0].at }, ...toChatMessages(rows)];
      const last = rows[rows.length - 1];
      updateBinding(binding.agentId, { lastMessage: last.text, lastAt: last.at, unread: 0 });
    } else {
      messages.value = [{ id: 'remote-system', type: 'system', text: '已连接到桌面 Agent，可以开始聊天了', time: Date.now() }];
    }
    scrollToBottom(120);
    startRemotePolling();
  } catch (error) {
    peer.value.status = 'offline';
    const message = error instanceof AgentLinkError ? `连接失败：${error.code}` : '连接失败';
    uni.showToast({ title: message, icon: 'none' });
    messages.value = [{ id: 'remote-system', type: 'system', text: '暂时连不上桌面 Agent，请确认同一 Wi-Fi 后重进', time: Date.now() }];
  }
}

function startRemotePolling() {
  remoteVisible = true;
  if (!remoteReady) return;
  if (!remotePolling) void pollRemote();
}

function stopRemotePolling() {
  remoteVisible = false;
  clearTimeout(remoteTimer);
  remoteTimer = undefined;
}

async function pollRemote() {
  const binding = remote.value;
  if (!binding || !remoteVisible || remotePolling) return;
  remotePolling = true;
  try {
    const page = await waitMessages(binding, remoteAfter, 20000);
    if (!remoteVisible) return;
    remoteAfter = Math.max(remoteAfter, page.cursor || 0);
    peer.value.status = 'online';
    const incoming = page.messages || [];
    const known = new Set(messages.value.map((item) => item.id));
    const rows = incoming.filter(
      (item) => item.direction === 'out' && (!item.type || item.type === 'text') && !known.has(item.id)
    );
    if (rows.length) {
      for (const row of rows) {
        messages.value.push({ id: row.id, type: 'text', side: 'other', text: row.text, time: row.at });
      }
      const last = rows[rows.length - 1];
      updateBinding(binding.agentId, { lastMessage: last.text, lastAt: last.at });
      scrollToBottom();
    }
  } catch (error) {
    if (!remoteVisible) return;
    peer.value.status = 'offline';
    if (error instanceof AgentLinkError && error.status === 401) {
      stopRemotePolling();
      uni.showModal({
        title: '配对已失效',
        content: '请返回列表重新扫码连接桌面 Agent。',
        showCancel: false,
        success: () => uni.navigateBack()
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } finally {
    remotePolling = false;
    if (remoteVisible) remoteTimer = setTimeout(() => void pollRemote(), 200);
  }
}


function scrollToBottom(delay = 60) {
  anchor.value = '';
  setTimeout(() => {
    anchor.value = 'msg-bottom';
  }, delay);
}

// 键盘或底部面板改变可用高度后，让最后一条消息保持在可视区域。
function keepLatestVisible() {
  clearTimeout(keyboardTimer);
  scrollToBottom(120);
  keyboardTimer = setTimeout(() => scrollToBottom(0), 360);
}

function onInputFocus() {
  panel.value = '';
  keepLatestVisible();
}

function pushMessage(payload: Omit<ChatMessageItem, 'id' | 'time'>) {
  messages.value.push({ id: `m${uid++}`, time: Date.now(), ...payload });
  scrollToBottom();
}

async function sendText() {
  const text = draft.value.trim();
  if (!text) return;

  if (remote.value) {
    const binding = remote.value;
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pushMessage({ type: 'text', side: 'me', text, read: true });
    draft.value = '';
    panel.value = '';
    try {
      const result = await sendMessage(binding, text, clientId);
      remoteAfter = Math.max(remoteAfter, result.seq || 0);
      updateBinding(binding.agentId, { lastMessage: text, lastAt: Date.now() });
      peer.value.status = 'online';
    } catch {
      peer.value.status = 'offline';
      uni.showToast({ title: '发送失败，请检查局域网连接', icon: 'none' });
    }
    return;
  }

  pushMessage({ type: 'text', side: 'me', text, read: true });
  draft.value = '';
  panel.value = '';
}

function insertEmoji(emoji: string) {
  draft.value += emoji;
}

function deleteEmoji() {
  draft.value = draft.value.slice(0, -1);
}

function toggleVoice() {
  voiceMode.value = !voiceMode.value;
  panel.value = '';
  keepLatestVisible();
}

function togglePanel(name: string) {
  panel.value = panel.value === name ? '' : name;
  if (panel.value) voiceMode.value = false;
  keepLatestVisible();
}

function closePanels() {
  if (panel.value) panel.value = '';
}

function startRecordTimer() {
  stopRecordTimer();
  recordSeconds.value = 0;
  recordCancelled = false;
  recordTimer = setInterval(() => {
    recordSeconds.value += 1;
    if (recordSeconds.value >= 60) stopRecordTimer();
  }, 1000);
}

function stopRecordTimer() {
  if (recordTimer) {
    clearInterval(recordTimer);
    recordTimer = undefined;
  }
}

function onHoldStart(event: any) {
  holding.value = true;
  recording.value = true;
  startY = event.touches?.[0]?.clientY || 0;
  startRecordTimer();
}

function onHoldMove(event: any) {
  if (!holding.value) return;
  const currentY = event.touches?.[0]?.clientY || startY;
  if (startY - currentY > 50) {
    holding.value = false;
    recording.value = false;
    recordCancelled = true;
    stopRecordTimer();
  }
}

function onHoldEnd() {
  const wasHolding = holding.value;
  holding.value = false;
  recording.value = false;
  stopRecordTimer();
  if (!wasHolding || recordCancelled) return;
  if (remote.value) {
    uni.showToast({ title: '远程 Agent 暂只支持文字', icon: 'none' });
    return;
  }
  const duration = Math.max(1, recordSeconds.value);
  // TODO: 接入 uni.getRecorderManager()，把录音临时文件地址写入 message.src。
  pushMessage({ type: 'voice', side: 'me', duration, read: true });
}

function onMoreAction(key: string) {
  if (key === 'voice-call') return startCall('voice');
  if (remote.value && key !== 'video-call') {
    uni.showToast({ title: '远程 Agent 暂只支持文字', icon: 'none' });
    return;
  }
  if (key === 'video-call') return startCall('video');
  if (key === 'album') return pickImage('album');
  if (key === 'camera') return pickImage('camera');
  if (key === 'file') return pickFile();
  uni.showToast({ title: '位置功能待接入', icon: 'none' });
}

function pickImage(source: 'album' | 'camera') {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: [source],
    success: (result) => {
      const path = result.tempFilePaths?.[0];
      if (path) {
        pushMessage({ type: 'image', side: 'me', src: path, read: true });
        panel.value = '';
      }
    }
  });
}

function pickFile() {
  // #ifdef H5
  (uni as any).chooseFile({
    count: 1,
    success: (result: any) => {
      const file = result.tempFiles?.[0];
      if (!file) return;
      pushMessage({
        type: 'file',
        side: 'me',
        name: file.name || '未命名文件',
        size: file.size || 0,
        read: true
      });
      panel.value = '';
    }
  });
  // #endif
  // #ifndef H5
  uni.showToast({ title: '文件选择待接入', icon: 'none' });
  // #endif
}

function startCall(type: 'voice' | 'video') {
  const params = [
    `name=${encodeURIComponent(peer.value.name)}`,
    `color=${encodeURIComponent(peer.value.color)}`,
    'mode=outgoing'
  ].join('&');
  uni.navigateTo({ url: `/pages/call/${type}?${params}` });
}

function openMenu() {
  const itemList = remote.value
    ? ['语音通话', '视频通话', '解绑设备']
    : ['语音通话', '视频通话', '查看 Agent 资料'];
  uni.showActionSheet({
    itemList,
    success: ({ tapIndex }) => {
      if (tapIndex === 0) startCall('voice');
      if (tapIndex === 1) startCall('video');
      if (tapIndex === 2) {
        if (remote.value) void unbindRemote();
        else uni.showToast({ title: '资料页待接入', icon: 'none' });
      }
    }
  });
}

async function unbindRemote() {
  const binding = remote.value;
  if (!binding) return;
  uni.showModal({
    title: '解绑设备',
    content: `解绑 ${binding.name} 后，需要重新扫码才能继续聊天。`,
    confirmText: '解绑',
    confirmColor: '#d92d20',
    success: async (result) => {
      if (!result.confirm) return;
      try {
        await unbindAgent(binding);
      } catch {
        /* 桌面端可能已先解绑，本地仍然清理 */
      }
      removeBinding(binding.agentId);
      uni.navigateBack();
    }
  });
}

function onLongPress(message: ChatMessageItem) {
  if (message.type === 'time' || message.type === 'system') return;
  uni.showActionSheet({
    itemList: ['复制', '删除'],
    success: ({ tapIndex }) => {
      if (tapIndex === 0) {
        const text = message.type === 'text' ? message.text || '' : `[${message.type}]`;
        uni.setClipboardData({ data: text });
      }
      if (tapIndex === 1) {
        messages.value = messages.value.filter((item) => item.id !== message.id);
      }
    }
  });
}

function previewImage(message: ChatMessageItem) {
  if (message.src) uni.previewImage({ urls: [message.src] });
}

function playVoice(message: ChatMessageItem) {
  uni.showToast({ title: `播放 ${message.duration}" 语音（待接入）`, icon: 'none' });
}

function playVideo() {
  uni.showToast({ title: '视频播放待接入', icon: 'none' });
}

function openFile(message: ChatMessageItem) {
  uni.showToast({ title: `打开 ${message.name}（待接入）`, icon: 'none' });
}

function back() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/agent/index' }) });
}
</script>

<style scoped lang="scss">
.chat-page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #f2f4f8;
  overflow: hidden;
}
.chat-head {
  flex-shrink: 0;
  background: #f7f8fc;
  border-bottom: 1px solid #e9edf4;
  padding-top: max(var(--status-bar-height, 0px), env(safe-area-inset-top, 0px));
}
.status-space {
  height: 0;
}
.head-row {
  max-width: 500px;
  margin: auto;
  height: 56px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.back {
  width: 32px;
  height: 32px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.peer {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}
.peer-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.peer-name {
  font-size: 16px;
  font-weight: 500;
  color: #1a1f2e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.peer-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #8b95a8;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #98a2b3;
}
.dot.online {
  background: #12b76a;
}
.dot.busy {
  background: #f79009;
}
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.action {
  width: 34px;
  height: 34px;
  border-radius: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.action:active {
  background: #eef1f6;
}
.messages {
  flex: 1;
  height: 0;
  min-height: 0;
}
.bottom-pad {
  height: 12px;
}
.composer {
  flex-shrink: 0;
  background: #fff;
  border-top: 1px solid #e9edf4;
  padding-bottom: env(safe-area-inset-bottom);
}
.input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px;
}
.bar-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.field {
  flex: 1;
  min-width: 0;
  background: #f3f5fa;
  border-radius: 10px;
  min-height: 36px;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.input {
  width: 100%;
  min-height: 36px;
  max-height: 80px;
  box-sizing: border-box;
  padding: 7px 12px;
  font-size: 15px;
  line-height: 22px;
  color: #1a1f2e;
}
/* auto-height 会写死内部高度，限制在三行内并让原生输入区自己滚动。 */
.input :deep(.uni-textarea-wrapper) {
  min-height: 0;
  max-height: 66px;
  overflow: hidden;
}
.input :deep(.uni-textarea-textarea) {
  overflow-y: auto !important;
}
.input :deep(.uni-textarea-textarea)::-webkit-scrollbar {
  width: 0;
  height: 0;
}
.hold {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  color: #3d4a63;
}
.hold.holding {
  background: #e6eaf2;
  color: #667085;
}
.send {
  height: 36px;
  padding: 0 15px;
  border-radius: 9px;
  background: #294fdb;
  color: #fff;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
