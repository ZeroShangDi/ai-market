<template>
  <view class="page">
    <view class="wrap">
      <MobileHeader title="工作台" action-icon-name="scan" action-label="扫码连接电脑" @action="scanComputer" />
      <PreviewBanner />
      <view class="content">
        <view class="ai-entry" role="button" aria-label="打开 AI 对话" @tap="openMobileApp('ai-assistant')">
          <view class="ai-heading">
            <view class="ai-mark"><AppIcon name="brand-assistant" :size="44" /></view>
            <view class="ai-copy"><view class="ai-title">统子哥<text v-if="mockEnabled" class="preview-tag">预览</text></view></view>
          </view>
          <view class="ai-prompt"><text>有什么可以帮你？</text><AppIcon name="arrow-right" :size="23" color="#294fdb" /></view>
          <text class="ai-link">{{ recentConversations.length ? '继续上次对话' : '开始对话' }} <text aria-hidden="true">→</text></text>
        </view>
        <view class="section">
          <view class="section-heading"><text class="section-title">常用应用</text><view class="section-link" role="button" aria-label="查看全部应用" @tap="openApps">全部应用 <AppIcon name="chevron-right" :size="14" color="#636e82" /></view></view>
          <view class="shortcuts">
            <view v-for="app in favoriteApps" :key="app.id" class="shortcut" role="button" :aria-label="'打开' + app.name" @tap="openMobileApp(app.id)">
              <view class="shortcut-icon"><AppAsset :name="app.iconAsset" class="shortcut-asset"><template #fallback><AppIcon :name="app.icon" :size="52" /></template></AppAsset></view>
              <text class="shortcut-name">{{ app.name }}</text>
            </view>
            <view v-if="!favoriteApps.length" class="shortcut-empty" role="button" @tap="openApps">去应用广场添加常用应用 <text aria-hidden="true">→</text></view>
          </view>
        </view>
        <view class="section">
          <view class="section-heading"><text class="section-title">继续处理</text><text v-if="loadingRecent" class="section-caption">加载中…</text></view>
          <view class="recent-card">
            <view v-for="conversation in recentConversations" :key="conversation.id" class="recent-row" role="button" :aria-label="'继续对话：' + conversation.title" @tap="openConversation(conversation.id)">
              <view class="recent-icon"><AppIcon name="pending" :size="22" color="#5264a5" /></view>
              <view class="recent-copy"><text class="recent-title">{{ conversation.title }}</text><text class="recent-time">{{ when(conversation.updated_at) }}</text></view>
              <AppIcon name="chevron-right" :size="18" color="#8994a8" />
            </view>
            <view v-if="!recentConversations.length" class="recent-empty">
              <view class="recent-icon"><AppIcon name="pending" :size="22" color="#5264a5" /></view>
              <view class="recent-copy"><text class="recent-title">{{ recentError ? '暂时无法加载最近对话' : (loadingRecent ? '正在加载…' : '暂无最近对话') }}</text><text v-if="recentError" class="recent-time">{{ recentError }}</text></view>
              <view v-if="recentError" class="retry" role="button" aria-label="重新加载最近对话" @tap="loadRecent">重试</view>
            </view>
            <view v-else-if="recentError" class="recent-error" role="button" @tap="loadRecent">{{ recentError }} · 重试</view>
          </view>
        </view>
      </view>
    </view>
    <TabBar current="workbench" />
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import MobileHeader from '@/components/MobileHeader.vue';
import TabBar from '@/components/TabBar.vue';
import PreviewBanner from '@/components/PreviewBanner.vue';
import AppIcon from '@/components/AppIcon.vue';
import AppAsset from '@/modules/assets/AppAsset.vue';
import { openMobileApp } from '@/modules/app-registry';
import { favoriteApps, refreshFavorites } from '@/modules/app-registry/favorites';
import { scanAndPair } from '@/services/pairing-actions';
import { aiChat } from '@/services/ai-chat';
import { remoteChatRepository } from '@/services/ai-chat-remote';
import { ensureSession } from '@/services/session';
import { hasUnfinishedCall } from '@/services/calls';
import { openRootTab } from '@/modules/root-navigation';
import { hasAccessToken, getSessionVersion, messageOf, onSessionChange } from '@/api/http';
import { mockEnabled } from '@/config';
import { when, toast } from '@/ui/format';
import type { ConversationSummary } from '@/types/ai-chat';

const recent = ref<ConversationSummary[]>([]);
const recentError = ref('');
const loadingRecent = ref(false);
let recentGeneration = 0;
const recentConversations = computed(() => (mockEnabled
  ? aiChat.state.conversations.filter(item => item.messages.length)
  : recent.value).slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3));

async function loadRecent() {
  const generation = ++recentGeneration;
  const session = getSessionVersion();
  recentError.value = '';
  if (mockEnabled || !hasAccessToken()) { recent.value = []; loadingRecent.value = false; return; }
  loadingRecent.value = true;
  try {
    const result = await remoteChatRepository.list();
    if (generation === recentGeneration && session === getSessionVersion()) recent.value = result.items;
  } catch (error) {
    if (generation === recentGeneration && session === getSessionVersion()) recentError.value = messageOf(error);
  } finally {
    if (generation === recentGeneration) loadingRecent.value = false;
  }
}
function openApps() {
  openRootTab('apps');
}
function openConversation(id: string) {
  if (hasUnfinishedCall()) return toast('请先完成当前通话并保存结果');
  if (ensureSession()) uni.navigateTo({ url: '/pages/ai-chat/index?conversation=' + encodeURIComponent(id) });
}
async function scanComputer() {
  if (hasUnfinishedCall()) return toast('请先完成当前通话并保存结果');
  try { if (await scanAndPair()) { toast('手机已配对，电脑外呼将自动拨打'); void loadRecent(); } }
  catch (error) { toast(messageOf(error)); }
}
const stopSession = onSessionChange(() => {
  ++recentGeneration;
  recent.value = [];
  recentError.value = '';
  loadingRecent.value = false;
  void loadRecent();
});
onShow(() => { refreshFavorites(); void loadRecent(); });
onUnload(() => { ++recentGeneration; stopSession(); });
</script>
<style scoped lang="scss">
.page { min-height: 100vh; padding-bottom: calc(112px + env(safe-area-inset-bottom)); background: #f7f8fc; }
.wrap { max-width: 500px; margin: auto; }
.content { padding: 22px 20px 24px; }
.ai-entry { padding: 21px 20px 19px; border: 1px solid #e5eafa; border-radius: 22px; background: linear-gradient(120deg, #eaf0ff, #f9fbff); box-shadow: 0 6px 18px rgba(41, 79, 219, .04); }
.ai-heading { display: flex; align-items: center; gap: 13px; }
.ai-mark { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 14px; overflow: hidden; }
.ai-copy { min-width: 0; }
.ai-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 600; }
.preview-tag { padding: 2px 6px; border-radius: 5px; background: #e5ebff; font-size: 10px; color: #6173b7; font-weight: 400; }
.ai-prompt { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 20px; padding: 13px 14px; border-radius: 16px; background: #fff; color: #78849b; font-size: 14px; }
.ai-link { display: block; margin-top: 17px; font-size: 12px; color: #294fdb; font-weight: 500; }
.ai-link text { margin-left: 5px; }
.section { margin-top: 27px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-title { font-size: 17px; font-weight: 600; }
.section-link { display: flex; align-items: center; gap: 2px; padding: 6px 0 6px 6px; color: #636e82; font-size: 12px; }
.section-caption { color: #8994a8; font-size: 11px; }
.shortcuts { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 14px; margin-top: 16px; }
.shortcut { display: flex; flex-direction: column; align-items: center; gap: 9px; width: 78px; padding: 2px 0 4px; }
.shortcut-icon { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px; overflow: hidden; }
.shortcut-asset { width: 52px; height: 52px; }
.shortcut-name { color: #1a1f2e; font-size: 12px; font-weight: 500; }
.shortcut-empty { padding: 18px 0; color: #294fdb; font-size: 13px; }
.recent-card { margin-top: 14px; padding: 0 16px; border-radius: 22px; background: white; box-shadow: 0 6px 18px rgba(20,31,51,.035); }
.recent-row, .recent-empty { display: flex; align-items: center; gap: 12px; min-height: 76px; padding: 14px 0; }
.recent-row + .recent-row { border-top: 1px solid #f1f3f8; }
.recent-icon { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 12px; background: #f1f3fa; }
.recent-copy { flex: 1; min-width: 0; }
.recent-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; }
.recent-time { display: block; margin-top: 5px; font-size: 11px; line-height: 1.6; color: #8994a8; }
.retry { padding: 8px 0 8px 6px; flex-shrink: 0; color: #294fdb; font-size: 12px; }
.recent-error { padding: 0 0 14px; color: #a96812; font-size: 11px; }
@media (max-width: 350px) { .content { padding-left: 16px; padding-right: 16px; } .ai-entry { padding-left: 16px; padding-right: 16px; } .recent-card { padding: 0 12px; } }
</style>
