<template>
  <view class="page"><PromptHost />
    <view class="wrap">
      <MobileHeader title="Agent 消息" action-icon-name="add" action-label="添加 Agent" @action="addAgent" />

      <view class="search">
        <AppIcon name="search" :size="17" color="#8b95a8" />
        <input v-model="query" placeholder="搜索 Agent 或消息" placeholder-class="placeholder" confirm-type="search" />
        <view v-if="query" class="clear" role="button" aria-label="清空搜索" @tap="query = ''">
          <AppIcon name="close" :size="14" color="#8b95a8" />
        </view>
      </view>

      <view class="list">
        <view
          v-for="item in filtered"
          :key="item.id"
          class="row"
          role="button"
          :aria-label="`打开与${item.name}的会话`"
          @tap="openChat(item)"
        >
          <ChatAvatar
            :name="item.name"
            :color="item.color"
            :src="item.avatar"
            :size="48"
            :radius="15"
            :badge="item.unread"
          />
          <view class="main">
            <view class="line-1">
              <text class="name">{{ item.name }}</text>
              <text class="time">{{ friendlyTime(item.time) }}</text>
            </view>
            <view class="line-2">
              <view class="dot" :class="item.status" />
              <text class="type">{{ item.typeLabel }}</text>
              <text class="sep">·</text>
              <text class="status">{{ statusText(item.status) }}</text>
            </view>
            <text class="preview">{{ item.lastMessage }}</text>
          </view>
        </view>

        <view v-if="!filtered.length" class="empty">
          <text>{{ query ? '没有匹配的 Agent' : '还没有连接的 Agent，点右上角 + 扫码' }}</text>
        </view>
      </view>
    </view>

    <TabBar current="agent" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import MobileHeader from '@/components/MobileHeader.vue';
import TabBar from '@/components/TabBar.vue';
import AppIcon from '@/components/AppIcon.vue';
import ChatAvatar from '@/components/chat/ChatAvatar.vue';
import PromptHost from '@/components/prompt/PromptHost.vue';
import { friendlyTime } from '@/components/chat/format';
import { statusText, type AgentConversation } from '@/types/chat';
import {
  AgentLinkError,
  claimPair,
  loadBindings,
  pairErrorText,
  parsePairPayload,
  upsertBinding,
  type AgentLinkBinding
} from '@/services/agent-link';

const query = ref('');

const bindings = ref<AgentLinkBinding[]>(loadBindings());

onShow(() => {
  bindings.value = loadBindings();
});

const conversations = computed<AgentConversation[]>(() =>
  bindings.value.map((binding) => ({
    id: `remote-${binding.agentId}`,
    name: binding.name,
    color: '#e8eeff',
    avatar: binding.icon === 'dsh' ? '/static/agent-icons/dsh.png' : '',
    typeLabel: '远程 Agent',
    status: 'online' as const,
    lastMessage: binding.lastMessage || '已连接，点击开始聊天',
    time: binding.lastAt || binding.pairedAt,
    unread: binding.unread || 0,
    remote: true
  }))
);

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return conversations.value;
  return conversations.value.filter((item) =>
    `${item.name}${item.typeLabel}${item.lastMessage}`.toLowerCase().includes(keyword)
  );
});

function openChat(item: AgentConversation) {
  if (item.remote) {
    const agentId = item.id.startsWith('remote-') ? item.id.slice(7) : '';
    if (agentId) uni.navigateTo({ url: `/pages/agent/chat?remote=1&agentId=${encodeURIComponent(agentId)}` });
    return;
  }
  item.unread = 0;
  const params = [
    `id=${encodeURIComponent(item.id)}`,
    `name=${encodeURIComponent(item.name)}`,
    `color=${encodeURIComponent(item.color)}`,
    `type=${encodeURIComponent(item.typeLabel)}`,
    `status=${encodeURIComponent(item.status)}`
  ].join('&');
  uni.navigateTo({ url: `/pages/agent/chat?${params}` });
}

function addAgent() {
  uni.showActionSheet({
    itemList: ['扫码连接桌面 Agent', '粘贴配对链接'],
    success: ({ tapIndex }) => {
      if (tapIndex === 0) scanAgent();
      if (tapIndex === 1) pastePairLink();
    }
  });
}

function scanAgent() {
  // #ifdef H5
  pastePairLink();
  return;
  // #endif
  // #ifndef H5
  uni.scanCode({
    scanType: ['qrCode'],
    success: (result) => {
      const raw = result.result || '';
      if (!raw) {
        uni.showModal({ title: '没有读到二维码内容', content: '请对准二维码再试一次', showCancel: false });
        return;
      }
      void pairAgent(raw);
    },
    fail: () => uni.showToast({ title: '没有识别到二维码', icon: 'none' })
  });
  // #endif
}

function pastePairLink() {
  uni.showModal({
    title: '粘贴配对链接',
    editable: true,
    placeholderText: 'agentlink://pair?...',
    success: (result) => {
      if (result.confirm && result.content) void pairAgent(result.content);
    }
  });
}

async function pairAgent(raw: string) {
  try {
    const payload = parsePairPayload(raw);
    if (!payload) {
      uni.showModal({
        title: '二维码内容不对',
        content: `扫到：${String(raw || '(空)').slice(0, 120)}`,
        showCancel: false
      });
      return;
    }
    uni.showLoading({ title: '正在连接…', mask: true });
    const deviceName = uni.getSystemInfoSync().deviceModel || '手机';
    const claimed = await claimPair(payload, deviceName);
    upsertBinding({
      agentId: claimed.agent.id,
      name: claimed.agent.name || payload.name,
      icon: claimed.agent.icon || payload.icon,
      baseUrl: payload.baseUrl,
      token: claimed.token,
      pairedAt: Date.now(),
      lastMessage: '已连接，点击开始聊天',
      lastAt: Date.now()
    });
    bindings.value = loadBindings();
    uni.hideLoading();
    uni.showToast({ title: `已连接 ${claimed.agent.name || payload.name}`, icon: 'none' });
  } catch (error) {
    uni.hideLoading();
    const message = error instanceof AgentLinkError
      ? pairErrorText(error)
      : `连接失败：${(error as Error)?.message || String(error)}`;
    uni.showModal({ title: '连接失败', content: message, showCancel: false });
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: #f7f8fc;
  padding-bottom: calc(112px + env(safe-area-inset-bottom));
}
.wrap {
  max-width: 500px;
  margin: auto;
  padding: 0 15px;
}
.search {
  height: 38px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 12px;
  background: #eef1f6;
}
.search input {
  flex: 1;
  min-width: 0;
  height: 38px;
  font-size: 14px;
  color: #1a1f2e;
}
.placeholder {
  color: #9aa4b5;
}
.clear {
  width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.list {
  margin-top: 12px;
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 15px;
  position: relative;
}
.row::after {
  content: '';
  position: absolute;
  left: 75px;
  right: 0;
  bottom: 0;
  height: 1px;
  background: #f0f2f6;
}
.row:last-child::after {
  display: none;
}
.row:active {
  background: #fafbfd;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.line-1 {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.name {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 500;
  color: #1a1f2e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  flex-shrink: 0;
  font-size: 11px;
  color: #a2abbb;
}
.line-2 {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  line-height: 14px;
  color: #7b8598;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #98a2b3;
  flex-shrink: 0;
}
.dot.online {
  background: #12b76a;
}
.dot.busy {
  background: #f79009;
}
.type {
  color: #5d6a80;
}
.sep {
  color: #c2c9d6;
}
.status {
  color: #8b95a8;
}
.preview {
  font-size: 13px;
  line-height: 17px;
  color: #8b95a8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  padding: 40px 0;
  text-align: center;
  color: #98a2b3;
  font-size: 13px;
}
</style>
