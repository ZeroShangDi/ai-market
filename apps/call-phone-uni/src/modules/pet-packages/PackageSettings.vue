<template>
  <view class="resources">
    <view class="heading"><text>角色资源</text><button size="mini" :disabled="!!state.busy" @tap="refreshPackages">刷新</button></view>
    <text v-if="state.error" class="error">{{ state.error }}</text>
    <view v-for="item in entries" :key="item.id+'-'+item.version" class="resource">
      <view><text>{{ item.name }}</text><text class="meta">{{ count(item) }} 个动作{{ 'bytes' in item ? ' · ' + (item.bytes / 1048576).toFixed(1) + ' MB' : '' }} · {{ loaded(item) ? '已加载' : '未加载' }}{{ state.active === item.id+'-'+item.version ? ' · 使用中' : '' }}</text></view>
      <view class="buttons">
        <button size="mini" :disabled="!!state.busy || state.active === item.id+'-'+item.version" @tap="changePackage(loaded(item) ? 'packageActivate' : 'packageInstall',item)">{{ state.busy === item.id ? '处理中…' : loaded(item) ? '应用' : '加载' }}</button>
        <button v-if="loaded(item)" size="mini" :disabled="!!state.busy" @tap="remove(item)">删除</button>
      </view>
    </view>
    <text v-if="!entries.length && !state.error" class="meta">暂无可加载资源</text>
  </view>
</template>
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { petPackages as state, refreshPackages, changePackage, type AvailablePackage, type PetPackage } from './index';
const entries = computed(() => [...state.available,...state.installed.filter(i => !state.available.some(a=>a.id===i.id && a.version===i.version))]);
const loaded = (item: AvailablePackage|PetPackage) => state.installed.some(p=>p.id===item.id && p.version===item.version);
const count = (item: AvailablePackage|PetPackage) => 'actionCount' in item ? item.actionCount : item.actions.length;
function remove(item: AvailablePackage|PetPackage) { uni.showModal({title:'删除角色资源',content:'删除后可以重新加载。正在使用的角色将关闭。',success:r=>{if(r.confirm) void changePackage('packageDelete',item);}}); }
onMounted(refreshPackages);
</script>
<style scoped>
.resources{margin-top:24rpx}.heading,.resource,.buttons{display:flex;align-items:center;justify-content:space-between;gap:12rpx}.resource{padding:20rpx 0;border-bottom:1px solid #eef0f5}.meta{display:block;color:#7a8190;font-size:24rpx;margin-top:8rpx}.error{color:#b44343}.buttons button{margin:0}.heading button{margin:0}
</style>
