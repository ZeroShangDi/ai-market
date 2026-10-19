<template>
  <view class="page" :class="{ full: fullList }">
    <view class="wrap">
      <MobileHeader v-if="fullList" title="继续处理" back-icon-name="chevron-left" back-fallback="/pages/index/index" />
      <MobileHeader v-else title="工作台" action-icon-name="scan" action-label="扫码连接电脑" @action="scanComputer" />
      <PreviewBanner />
      <view class="content">
        <view v-if="!fullList" class="ai-entry" role="button" aria-label="打开 AI 对话" @tap="openMobileApp('ai-assistant')">
          <view class="ai-heading">
            <view class="ai-mark"><AppIcon name="brand-assistant" :size="44" /></view>
            <view class="ai-copy"><view class="ai-title">统子哥<text v-if="mockEnabled" class="preview-tag">预览</text></view></view>
          </view>
          <view class="ai-prompt"><text>有什么可以帮你？</text><AppIcon name="arrow-right" :size="23" color="#294fdb" /></view>
          <text class="ai-link">{{ recentConversations.length ? '继续上次对话' : '开始对话' }} <text aria-hidden="true">→</text></text>
        </view>
        <view v-if="!fullList" class="section">
          <view class="section-heading"><text class="section-title">常用应用</text><view class="section-link" role="button" aria-label="查看全部应用" @tap="openApps">全部应用 <AppIcon name="chevron-right" :size="14" color="#636e82" /></view></view>
          <view class="shortcuts">
            <view v-for="app in favoriteApps" :key="app.id" class="shortcut" role="button" :aria-label="'打开' + app.name" @tap="openMobileApp(app.id)">
              <view class="shortcut-icon"><AppAsset :name="app.iconAsset" class="shortcut-asset"><template #fallback><AppIcon :name="app.icon" :size="52" /></template></AppAsset></view>
              <text class="shortcut-name">{{ app.name }}</text>
            </view>
            <view v-if="!favoriteApps.length" class="shortcut-empty" role="button" @tap="openApps">去应用广场添加常用应用 <text aria-hidden="true">→</text></view>
          </view>
        </view>
        <view class="section" :class="{ 'full-section': fullList }">
          <view v-if="!fullList" class="section-heading">
            <text class="section-title">继续处理<text v-if="items.pending.length"> · {{ items.pending.length }}</text></text>
            <view v-if="hasMore" class="section-link" role="button" aria-label="查看全部继续处理内容" @tap="openAll">查看全部 <AppIcon name="chevron-right" :size="14" color="#636e82" /></view>
          </view>
          <view v-else class="list-tabs">
            <view class="list-tab" :class="{ selected: listTab === 'pending' }" role="button" @tap="listTab = 'pending'">待处理<text v-if="items.pending.length"> · {{ items.pending.length }}</text></view>
            <view class="list-tab" :class="{ selected: listTab === 'history' }" role="button" @tap="listTab = 'history'">历史记录</view>
          </view>
          <view class="recent-card">
            <view v-for="item in visibleItems" :key="item.id" class="recent-row" role="button" :aria-label="'打开：' + item.title" @tap="openConversation(item.id)">
              <view class="recent-icon"><AppIcon name="pending" :size="22" color="#5264a5" /></view>
              <view class="recent-copy">
                <view class="conversation-heading"><text class="recent-title">{{ item.title }}</text><text class="conversation-kind">{{ item.work ? '工作' : '聊天' }}</text></view>
                <text class="work-badge" :class="{ attention: item.work && (item.work.pending.length || item.work.unread) }">{{ item.work ? workStatus(item.work) : '最近对话' }}</text>
                <text class="recent-time">{{ when(item.updated_at) }}</text>
              </view>
              <AppIcon name="chevron-right" :size="18" color="#8994a8" />
            </view>
            <view v-if="!visibleItems.length" class="recent-empty"><text class="recent-title">{{ loadingRecent || workInbox.loading ? '正在加载…' : (workInbox.error || recentError ? '暂时无法加载' : (fullList && listTab === 'pending' ? '暂无待处理内容' : '暂无最近记录')) }}</text></view>
            <view v-if="workInbox.error" class="recent-error" role="button" @tap="refreshWorkInbox">工作状态暂不可用 · 重试</view>
            <view v-if="recentError" class="recent-error" role="button" @tap="loadRecent(failedMore)">{{ recentError }} · 重试</view>
            <view v-if="fullList && listTab === 'history' && nextCursor" class="load-more" role="button" @tap="loadRecent(true)">{{ loadingRecent ? '加载中…' : '加载更多' }}</view>
          </view>
        </view>
      </view>
    </view>
    <TabBar v-if="!fullList" current="workbench" />
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app';
import MobileHeader from '@/components/MobileHeader.vue';
import TabBar from '@/components/TabBar.vue';
import PreviewBanner from '@/components/PreviewBanner.vue';
import AppIcon from '@/components/AppIcon.vue';
import AppAsset from '@/modules/assets/AppAsset.vue';
import { openMobileApp } from '@/modules/app-registry';
import { favoriteApps, refreshFavorites } from '@/modules/app-registry/favorites';
import { scanAndPair } from '@/services/pairing-actions';
import { workInbox, refreshWorkInbox, workStatus } from '@/services/work';
import { aiChat } from '@/services/ai-chat';
import { remoteChatRepository } from '@/services/ai-chat-remote';
import { ensureSession } from '@/services/session';
import { hasUnfinishedCall } from '@/services/calls';
import { openRootTab } from '@/modules/root-navigation';
import { hasAccessToken, getSessionVersion, messageOf, onSessionChange, onDeviceChange } from '@/api/http';
import { mockEnabled } from '@/config';
import { continueItems } from '@/ui/work-presentation';
import { when, toast } from '@/ui/format';
import type { ConversationSummary } from '@/types/ai-chat';

const fullList = ref(false);
const listTab = ref<'pending' | 'history'>('pending');
onLoad(query => { fullList.value = query?.view === 'all'; });
const nextCursor = ref<string | null>(null);
const failedMore = ref(false);
const recent = ref<ConversationSummary[]>([]);
const recentError = ref('');
const loadingRecent = ref(false);
let recentGeneration = 0;
const recentConversations = computed(() => mockEnabled
  ? aiChat.state.conversations.filter(item => item.messages.length)
  : recent.value);
const items = computed(() => continueItems(workInbox.items, recentConversations.value));
const visibleItems = computed(() => fullList.value ? items.value[listTab.value] : items.value.preview);
const hasMore = computed(() => items.value.pending.length + items.value.history.length > 3 || !!nextCursor.value);

async function loadRecent(more = false) {
  if (more && (loadingRecent.value || !nextCursor.value)) return;
  const generation = ++recentGeneration;
  const session = getSessionVersion();
  recentError.value = '';
  failedMore.value = more;
  if (mockEnabled || !hasAccessToken()) { recent.value = []; nextCursor.value = null; loadingRecent.value = false; return; }
  loadingRecent.value = true;
  try {
    const result = await remoteChatRepository.list(more ? nextCursor.value! : undefined);
    if (generation === recentGeneration && session === getSessionVersion()) {
      recent.value = more ? [...recent.value, ...result.items] : result.items;
      nextCursor.value = result.next_cursor;
    }
  } catch (error) {
    if (generation === recentGeneration && session === getSessionVersion()) recentError.value = messageOf(error);
  } finally {
    if (generation === recentGeneration) loadingRecent.value = false;
  }
}
function openAll() {
  if (hasUnfinishedCall()) return toast('请先完成当前通话并保存结果');
  if (ensureSession()) uni.navigateTo({ url: '/pages/index/index?view=all' });
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
function resetRecent() {
  ++recentGeneration;
  recent.value = [];
  recentError.value = '';
  nextCursor.value = null;
  loadingRecent.value = false;
  if (visible) void loadRecent();
}
const stopSession = onSessionChange(resetRecent);
const stopDevice = onDeviceChange(resetRecent);
let workPoll: ReturnType<typeof setTimeout> | undefined;
let visible = false;
async function pollWork() { if (!visible || mockEnabled) return; if (hasAccessToken()) await refreshWorkInbox(); if (visible) workPoll = setTimeout(pollWork, 10000); }
onShow(() => { visible = true; refreshFavorites(); void loadRecent(); void pollWork(); });
onHide(() => { visible = false; clearTimeout(workPoll); });
onUnload(() => { visible = false; clearTimeout(workPoll); ++recentGeneration; stopSession(); stopDevice(); });
</script>
<style scoped lang="scss">
.page { min-height: 100vh; padding-bottom: calc(112px + env(safe-area-inset-bottom)); background: #f7f8fc; }
.page.full { padding-bottom: calc(24px + env(safe-area-inset-bottom)); }
.section.full-section { margin-top: 0; }
.list-tabs { display: flex; gap: 20px; }
.list-tab { padding: 8px 0; font-size: 14px; color: #8994a8; }
.list-tab.selected { color: #294fdb; border-bottom: 2px solid #294fdb; }
.load-more { text-align: center; padding: 16px; color: #294fdb; font-size: 13px; }
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
.work-badge { display: inline-block; font-size: 11px; color: #7b879b; margin-top: 7px; }.work-badge.attention { color: #294fdb; background: #edf2ff; border-radius: 8px; padding: 3px 7px; }
</style>

<style scoped>
.conversation-heading { display: flex; align-items: center; gap: 6px; min-width: 0; }
.conversation-heading > text:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conversation-kind { flex-shrink: 0; font-size: 10px; line-height: 16px; font-weight: 400; color: #9298a3; padding: 0 4px; border: 1px solid #e5e7eb; border-radius: 4px; }
</style>
