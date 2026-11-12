<template>
  <view class="resources">
    <view class="heading"><text>选择角色</text><button size="mini" :disabled="!!state.busy" @tap="refreshPackages">刷新列表</button></view>
    <text v-if="state.error" class="error">{{ state.error }}</text>
    <view v-for="item in entries" :key="item.id+'-'+item.version" class="resource">
      <view><text>{{ item.name }}</text><text class="meta">{{ count(item) }} 个动作{{ 'bytes' in item ? ' · ' + (item.bytes / 1048576).toFixed(1) + ' MB' : '' }} · {{ loaded(item) ? '已下载' : '未下载' }}{{ state.active === item.id+'-'+item.version ? ' · 当前角色' : '' }}</text></view>
      <view class="buttons">
        <button size="mini" :disabled="!native || !!state.busy || state.active === item.id+'-'+item.version" @tap="changePackage(loaded(item) ? 'packageActivate' : 'packageInstall',item)">{{ state.busy === item.id ? '处理中…' : loaded(item) ? '使用' : '下载' }}</button>
        <button v-if="loaded(item)" size="mini" :disabled="!!state.busy" @tap="remove(item)">删除</button>
      </view>
    </view>
    <text v-if="!entries.length && !state.error" class="meta">暂无可用角色</text>
  </view>
</template>
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { petPackages as state, refreshPackages, changePackage, type AvailablePackage, type PetPackage } from './index';
const native=typeof plus!=='undefined'&&uni.getSystemInfoSync().platform==='android';
const entries = computed(() => [...state.available,...state.installed.filter(i => !state.available.some(a=>a.id===i.id && a.version===i.version))]);
const loaded = (item: AvailablePackage|PetPackage) => state.installed.some(p=>p.id===item.id && p.version===item.version);
const count = (item: AvailablePackage|PetPackage) => 'actionCount' in item ? item.actionCount : item.actions.length;
function remove(item: AvailablePackage|PetPackage) { uni.showModal({title:'删除选择角色',content:'删除后可以重新加载。正在使用的角色将关闭。',success:r=>{if(r.confirm) void changePackage('packageDelete',item);}}); }
onMounted(refreshPackages);
</script>
<style scoped>
.resources{margin-top:30px}.heading{display:flex;align-items:center;justify-content:space-between;margin:0 4px 14px;font-size:13px;color:#818b9e}.heading button{font-size:12px;color:#7483a8;background:transparent;margin:0;padding:0;line-height:30px}.heading button::after{border:0}.resource{background:#fff;border-radius:16px;padding:18px;margin-bottom:12px;font-size:15px;color:#283349}.meta{display:block;color:#959eb0;font-size:12px;line-height:1.7;margin-top:8px}.buttons{display:flex;gap:10px;margin-top:18px}.buttons button{margin:0;font-size:12px;line-height:32px;padding:0 18px;border-radius:16px;background:#edf1fc;color:#4964d8}.buttons button::after{border:0}.buttons button+button{background:transparent;color:#9aa2b1}.buttons button[disabled]{background:#f5f6fa;color:#a4adbd}.error{display:block;font-size:12px;color:#b44343;line-height:1.6;margin:12px 4px}
</style>