<template>
  <view class="capability-center">
    <view class="tabs"><view v-for="item in tabs" :key="item.id" class="tab" :class="{ active: tab === item.id }" role="button" @tap="changeTab(item.id)">{{ item.label }}</view></view>
    <scroll-view scroll-y class="capability-scroll">
      <view v-if="detail" class="detail">
        <view class="return" role="button" @tap="detailId = ''">‹ 返回{{ tabLabel }}</view>
        <view class="hero"><CapabilityIcon :kind="detail.type" /><view class="hero-copy"><text class="detail-title">{{ detail.name }}</text><text class="eyebrow">{{ typeLabel(detail.type) }}{{ detail.parentId ? ` · ${detail.plugin.name}` : '' }}</text></view></view>
        <view class="detail-tags badges"><text v-for="tag in capabilityTags(detail)" :key="tag.text" class="badge" :class="tag.tone">{{ tag.text }}</text></view>
        <text class="detail-description">{{ detail.description || '暂无描述' }}</text>
        <view v-if="detail.type === 'connections' && detail.plugin.connected" class="account-line"><text>当前账号</text><text>{{ detail.plugin.account }}</text></view>
        <view v-if="detail.parentId" class="belongs" role="button" @tap="detailId = `${detail.plugin.id}:plugin`"><text>所属插件</text><text>{{ detail.plugin.name }} ›</text></view>
        <view v-if="detail.type === 'plugins' && children.length" class="contents"><text class="section">包含的能力</text><view v-for="child in children" :key="child.key" class="child" role="button" @tap="detailId = child.key"><CapabilityIcon :kind="child.type" /><view class="child-copy"><text>{{ child.name }}</text><view class="badges"><text v-for="tag in capabilityTags(child)" :key="tag.text" class="badge" :class="tag.tone">{{ tag.text }}</text></view></view><text class="chevron">›</text></view></view>
        <view v-if="detail.type === 'mcp'" class="contents"><text class="section">提供的工具</text><view v-for="tool in detail.plugin.tools" :key="tool.id" class="tool-row"><text>{{ tool.label }}</text><text class="eyebrow">{{ tool.id }}</text></view></view>
        <view v-if="!detail.plugin.builtin || detail.plugin.selectable" class="detail-actions">
          <template v-if="!detail.parentId && ['plugins', 'skills'].includes(detail.type)">
            <button v-if="!detail.installed" class="primary" :disabled="saving" @tap="act(detail.plugin, 'install')">{{ detail.type === 'skills' ? '安装技能' : '安装插件' }}</button>
            <template v-else>
              <button :class="detail.enabled ? 'secondary' : 'primary'" :disabled="saving" @tap="toggle(detail)">{{ toggleLabel(detail) }}</button>
              <button v-if="!detail.plugin.builtin" class="uninstall" :disabled="saving" @tap="uninstall(detail)">{{ detail.type === 'skills' ? '卸载技能' : '卸载插件' }}</button>
            </template>
          </template>
          <button v-else-if="detail.parentId && (!detail.installed || !detail.plugin.enabled)" class="primary" @tap="detailId = `${detail.plugin.id}:plugin`">管理所属插件</button>
          <button v-else-if="detail.type === 'skills'" :class="detail.enabled ? 'secondary' : 'primary'" :disabled="saving" @tap="toggle(detail)">{{ toggleLabel(detail) }}</button>
          <button v-else-if="detail.type === 'connections'" :class="detail.plugin.connected ? 'secondary' : 'primary'" :disabled="saving" @tap="act(detail.plugin, detail.plugin.connected ? 'disconnect' : 'connect')">{{ detail.plugin.connected ? '断开连接' : (detail.plugin.connection.actionLabel || '连接账号') }}</button>
        </view>
      </view>
      <view v-else class="catalog">
        <view class="search"><text class="search-symbol">⌕</text><input v-model="query" :placeholder="`搜索${tabLabel}`" :aria-label="`搜索${tabLabel}`" maxlength="80" /><text v-if="query" role="button" aria-label="清除搜索" @tap="query = ''">×</text></view>
        <view class="filter-row"><view class="filters"><view v-for="f in filters" :key="f" :class="{ selected: filter === f }" role="button" @tap="filter = f">{{ f }}</view></view><text class="count">{{ filtered.length }} 项{{ tabLabel }}</text></view>
        <view v-if="loading" class="empty">正在加载…</view>
        <view v-else-if="error" class="empty" role="button" @tap="$emit('reload')">{{ error }} · 重试</view>
        <template v-else>
          <view v-for="entry in filtered" :key="entry.key" class="entry" role="button" :aria-label="`查看${entry.name}详情`" @tap="detailId = entry.key">
            <view class="entry-heading"><CapabilityIcon :kind="entry.type" /><view class="entry-copy"><text class="name">{{ entry.name }}</text><text class="eyebrow">{{ typeLabel(entry.type) }}</text></view><text class="chevron">›</text></view>
            <text class="description">{{ entry.description || '暂无描述' }}</text>
            <view class="entry-footer"><view class="badges"><text v-for="tag in capabilityTags(entry)" :key="tag.text" class="badge" :class="tag.tone">{{ tag.text }}</text></view><button v-if="!entry.installed && ['plugins', 'skills'].includes(entry.type)" class="install" :disabled="saving" @tap.stop="act(entry.plugin, 'install')">安装</button></view>
          </view>
          <view v-if="!filtered.length" class="empty">{{ query ? '未找到匹配的能力' : '暂无可用内容' }}</view>
        </template>
      </view>
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import CapabilityIcon from './CapabilityIcon.vue';
import { capabilityTags, capabilityEntries, type CapabilityEntry } from '@/ui/capability-catalog';
import type { WorkPlugin } from '@/services/work';
const props = defineProps<{ items: WorkPlugin[]; loading: boolean; saving: boolean; error: string }>();
const emit = defineEmits<{ (e: 'reload'): void; (e: 'configure', id: string, action: string, skill?: string): void }>();
const tabs = [{ id: 'plugins', label: '插件' }, { id: 'skills', label: '技能' }, { id: 'connections', label: '连接器' }, { id: 'mcp', label: 'MCP' }];
const tab = ref('plugins'), filter = ref('已安装'), query = ref(''), detailId = ref('');
function typeLabel(type: string) { return tabs.find(t => t.id === type)?.label || 'MCP 服务'; }
const filters = computed(() => tab.value === 'connections' ? ['已连接', '发现'] : ['已安装', '发现']);
const tabLabel = computed(() => typeLabel(tab.value));
const entries = computed(() => capabilityEntries(props.items));
const detail = computed(() => entries.value.find(e => e.key === detailId.value));
const children = computed(() => entries.value.filter(e => e.plugin.id === detail.value?.plugin.id && e.type !== 'plugins'));
const filtered = computed(() => entries.value.filter(e => !e.parentId && e.type === tab.value && (filter.value === '发现' || (e.type === 'connections' ? e.plugin.connected : e.installed)) && `${e.name} ${e.description} ${e.plugin.name}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));
function changeTab(id: string) { tab.value = id; filter.value = id === 'connections' ? '已连接' : '已安装'; query.value = ''; detailId.value = ''; }
function act(plugin: WorkPlugin, action: string, skill?: string) { emit('configure', plugin.id, action, skill); }
function toggleLabel(entry: CapabilityEntry) { return `${entry.enabled ? '停用' : '启用'}${entry.type === 'plugins' ? '插件' : entry.type === 'skills' ? '技能' : '所属插件'}`; }
function toggle(entry: CapabilityEntry) { if (entry.type === 'skills' && entry.parentId && entry.plugin.enabled) act(entry.plugin, entry.enabled ? 'disable_skill' : 'enable_skill', entry.skill); else act(entry.plugin, entry.plugin.enabled ? 'disable' : 'enable'); }
function uninstall(entry: CapabilityEntry) { uni.showModal({ title: entry.type === 'skills' ? '卸载技能' : '卸载插件', content: entry.type === 'skills' ? `卸载「${entry.name}」？已有会话将不能继续使用此技能。` : `卸载「${entry.plugin.name}」及其附带能力，并断开账号连接？已有会话将不能继续调用。`, success: r => { if (r.confirm) act(entry.plugin, 'uninstall'); } }); }
</script>
<style scoped>
.capability-center { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #f7f8fa; color: #262b35; font-size: 14px; }
.tabs { display: flex; flex-shrink: 0; gap: 28px; padding: 0 22px; background: #fff; border-bottom: 1px solid #edf0f4; }.tab { position: relative; padding: 15px 0 16px; color: #8b909b; }.tab.active,.more.active { color: #30394e; font-weight: 600; }.tab.active::after { content: ''; position: absolute; bottom: 0; height: 3px; border-radius: 3px; width: 18px; left: calc(50% - 9px); background: #5968bd; }.more { margin-left: auto; padding: 13px 0; color: #8b909b; }
.capability-scroll { flex: 1; height: 0; }.catalog { padding: 20px 18px 32px; }.search { display: flex; gap: 10px; align-items: center; min-height: 44px; border: 1px solid #e9ecf1; background: #fff; border-radius: 13px; padding: 0 13px; color: #969da9; }.search-symbol { font-size: 24px; }.search input { flex: 1; min-width: 0; font-size: 14px; color: #313744; }.filter-row { display: flex; align-items: center; justify-content: space-between; margin: 18px 0; }.filters { display: flex; gap: 3px; padding: 3px; background: transparent; }.filters > view { padding: 6px 12px; border-radius: 8px; color: #9096a1; font-size: 12px; }.filters .selected { background: #e9edf6; color: #4c5e94; font-weight: 500; }.count { color: #a0a6b1; font-size: 11px; }
.entry { padding: 17px; margin-bottom: 12px; background: #fff; border: 1px solid #e8ecf2; border-radius: 18px; box-shadow: 0 3px 10px #24365804; }.entry:active { border-color: #cdd5e8; }.entry-heading,.hero { display: flex; align-items: center; gap: 13px; }.entry-copy,.hero-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }.name { font-weight: 600; font-size: 15px; overflow-wrap: anywhere; }.eyebrow { display: block; font-size: 11px; color: #9aA1ad; line-height: 1.5; }.chevron { color: #adb5c2; font-size: 21px; }.description { display: block; font-size: 12px; color: #848c9a; line-height: 1.8; margin: 15px 0 16px; overflow-wrap: anywhere; }.entry-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 12px; border-top: 1px solid #f0f2f6; }.badges { display: flex; flex-wrap: wrap; gap: 6px; }.badge { font-size: 11px; line-height: 1.6; padding: 3px 7px; border-radius: 6px; background: #f1f3f6; color: #929aa7; }.badge.on { background: #edf6f1; color: #4b9374; }.badge.connected { background: #edf6f1; color: #4b9374; }.badge.pending { background: #fcf4e8; color: #ac8a55; }
button { margin: 0; font-size: 13px; font-weight: 500; border: 0; line-height: 1.5; }button::after { border: 0; }button[disabled] { opacity: .5; }.install { border-radius: 8px; padding: 6px 12px; color: #fff; background: #5968bd; flex-shrink: 0; }.empty { padding: 40px 0; text-align: center; color: #969eaa; font-size: 13px; }
.detail { padding: 18px 22px 30px; }.return { color: #9099a8; font-size: 12px; padding: 0 0 24px; }.hero { align-items: center; }.detail-title { font-weight: 600; font-size: 21px; line-height: 1.4; overflow-wrap: anywhere; }.detail-description { display: block; color: #7f8998; font-size: 13px; line-height: 1.8; margin: 20px 0; }.status-panel { background: #fff; border: 1px solid #e8ecf2; border-radius: 15px; padding: 5px 16px; }.status-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 0; font-size: 12px; border-bottom: 1px solid #f1f3f6; }.status-row:last-child { border: 0; }.status-row > text:first-child { color: #949dab; flex-shrink: 0; }.status-row > text:last-child { text-align: right; overflow-wrap: anywhere; }.positive { color: #4b9374; }.belongs { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: #818b9b; padding: 18px 0; }.section { display: block; color: #929cab; font-size: 11px; margin: 25px 0 10px; }.child { display: flex; align-items: center; gap: 12px; padding: 13px 0; border-bottom: 1px solid #e9edf3; }.child-copy { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; font-size: 13px; }.tool-row { display: flex; flex-direction: column; gap: 6px; padding: 14px 0; border-bottom: 1px solid #e9edf3; font-size: 13px; }.detail-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 28px; }.primary,.secondary { width: 100%; padding: 12px; border-radius: 12px; }.primary { background: #5968bd; color: #fff; }.secondary { background: #fff; border: 1px solid #dfe5ef; color: #5f6f8c; }.uninstall { background: transparent; color: #a18a8a; padding: 10px; font-size: 12px; }
.detail-tags { margin-top: 15px; }.account-line { display:flex; justify-content:space-between; gap:16px; font-size:12px; padding:14px 0; border-bottom:1px solid #e9edf3; }.account-line > text:first-child { color:#949dab; }
</style>
