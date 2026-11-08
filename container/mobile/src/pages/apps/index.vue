<template><view class="page"><view class="wrap"><MobileHeader title="应用广场"/><view class="content"><view class="search-box"><AppIcon name="search" :size="20" color="#8791a4"/><input v-model="query" class="search-input" placeholder="搜索应用" aria-label="搜索应用"/><view v-if="query" class="clear-search" @tap="query=''">清除</view></view><view class="all-section"><view class="section-heading"><text class="section-title">全部应用</text><text class="section-note">{{filtered.length}} 个应用</text></view><view v-if="filtered.length" class="app-grid"><view v-for="app in filtered" :key="app.id" class="app-card" role="button" @tap="open(app.id)"><view class="app-icon"><AppIcon name="apps" :size="36" color="#294fdb"/></view><view class="app-copy"><text class="app-name">{{app.title}}</text></view></view></view><view v-else class="empty-state"><view class="empty-icon"><AppIcon name="apps" :size="30" color="#a4afc4"/></view><text class="empty-title">{{query?'没有找到相关应用':'暂无已接入应用'}}</text></view></view></view></view><TabBar current="apps"/></view></template>
<script setup lang="ts">import {ref,computed} from 'vue';import MobileHeader from '@/components/MobileHeader.vue';import TabBar from '@/components/TabBar.vue';import AppIcon from '@/components/AppIcon.vue';import {entriesFor} from '../../../../shared/entries';import {visibleEntries} from '../../../../shared/client';import {client,session,requireSession,openEntry} from '@/platform';const query=ref('');const filtered=computed(()=>{session.identity;return visibleEntries(entriesFor(session.identity),p=>client.can(p)).filter(e=>e.title.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()));});function open(id:string){if(requireSession())openEntry(id);}</script>
<style scoped lang="scss">
.page { min-height: 100vh; background: #f7f8fc; }
.wrap { max-width: 500px; margin: auto; }
.content { padding: 12px 19px calc(110px + env(safe-area-inset-bottom)); }
.search-box { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 15px; border: 1px solid #eef0f5; border-radius: 16px; background: #fff; }
.search-input { flex: 1; min-width: 0; height: 48px; color: #263248; font-size: 14px; }
.search-placeholder { color: #9ca5b5; }
.clear-search { flex-shrink: 0; display: flex; align-items: center; height: 44px; padding: 0 2px 0 6px; color: #294fdb; font-size: 12px; }
.favorites-section { margin-top: 26px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.section-title { color: #20283a; font-size: 17px; font-weight: 600; }
.section-note { color: #929bac; font-size: 12px; }
.manage-entry { padding: 7px 0 7px 12px; color: #294fdb; font-size: 12px; }
.favorites-empty { width: 100%; padding: 20px 0; text-align: center; font-size: 13px; color: #294fdb; }
.favorites-card { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 20px 12px; padding: 19px 14px 17px; border-radius: 22px; background: #fff; box-shadow: 0 4px 18px rgba(31, 53, 96, .025); }
.favorite { width: 74px; display: flex; flex-direction: column; align-items: center; gap: 10px; border-radius: 14px; }
.favorite-icon { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: 16px; overflow: hidden; }
.favorite-asset { width: 52px; height: 52px; }
.app-asset { width: 42px; height: 42px; }
.favorite-name { color: #44516a; font-size: 12px; line-height: 1.5; }
.favorite-pressed { opacity: .7; }
.all-section { margin-top: 26px; }
.app-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
.app-card { min-width: 0; min-height: 88px; display: flex; align-items: center; gap: 12px; padding: 18px 14px; border: 1px solid #edf0f6; border-radius: 18px; background: #fff; box-shadow: 0 4px 18px rgba(31, 53, 96, .025); }
.app-card-pressed { background: #f3f6ff; }
.app-icon { width: 42px; height: 42px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 12px; overflow: hidden; }
.app-name { color: #20283a; font-size: 14px; font-weight: 600; line-height: 1.5; }
.app-copy { flex: 1; min-width: 0; }
.app-description { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; text-overflow: ellipsis; overflow-wrap: anywhere; max-height: 3em; margin-top: 5px; color: #68758b; font-size: 11px; line-height: 1.5; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 40px 15px; border-radius: 22px; background: #fff; }
.empty-icon { display: flex; align-items: center; justify-content: center; width: 62px; height: 62px; border-radius: 20px; background: #f4f6fb; }
.empty-title { margin-top: 18px; color: #44516a; font-size: 15px; font-weight: 500; }
.empty-description { margin-top: 8px; color: #929bac; font-size: 12px; }
.reset-search { display: flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 16px; padding: 0 16px; border-radius: 12px; background: #eef2ff; color: #294fdb; font-size: 13px; }
@media (max-width: 350px) {
  .content { padding-left: 15px; padding-right: 15px; }
  .app-grid { gap: 10px; }
  .app-card { gap: 9px; padding: 18px 11px; }
}
</style>
