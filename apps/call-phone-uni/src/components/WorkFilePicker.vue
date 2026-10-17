<template>
  <view v-if="visible" class="file-picker-mask" @tap.self="$emit('close')">
    <view class="file-picker-sheet">
      <view class="file-picker-heading"><text>添加文件</text><view role="button" aria-label="关闭文件选择" @tap="$emit('close')"><TIcon name="close" size="20px" /></view></view>
      <view class="file-picker-search"><TIcon name="search" color="#969da8" size="17px" /><input v-model="query" placeholder="搜索文件" /></view>
      <view class="file-picker-tabs"><view v-for="item in tabs" :key="item.id" :class="{ active: tab === item.id }" @tap="tab = item.id">{{ item.label }}</view></view>
      <scroll-view scroll-y class="file-picker-list">
        <view v-for="file in filtered" :key="file.id" class="file-picker-row" role="button" @tap="$emit('select', file)">
          <view class="file-picker-icon"><TIcon :name="fileAppearance(file.name).icon" :color="fileAppearance(file.name).color" size="25px" /></view>
          <view class="file-picker-copy"><text>{{ file.name }}</text><text>{{ file.source === 'received' ? '其他应用接收' : file.source === 'recent' ? '最近添加' : '当前会话' }}</text></view><TIcon name="add" color="#6d7eaa" size="18px" />
        </view>
        <view v-if="!filtered.length" class="file-picker-empty"><TIcon name="folder" color="#aeb9cf" size="36px" /><text>{{ query ? '没有找到文件' : tab === 'recent' ? '暂无最近添加的文件' : tab === 'received' ? '暂无已接收的文件' : '暂无可添加的会话文件' }}</text></view>
      </scroll-view>
      <view class="file-picker-footer"><button @tap="$emit('browse')"><TIcon name="folder-open" size="19px" color="#5c78b3" /><text>从手机选择文件</text><TIcon name="chevron-right" size="17px" color="#9ca6b6" /></button></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { fileAppearance } from '@/ui/work-presentation';
export interface PickerFile { id: string; name: string; source: 'recent' | 'session' | 'received' }
const props = defineProps<{ visible: boolean; files: PickerFile[] }>();
defineEmits<{ (event: 'close'): void; (event: 'browse'): void; (event: 'select', file: PickerFile): void }>();
const query = ref(''), tab = ref('recent');
const tabs = [{ id: 'recent', label: '最近使用' }, { id: 'received', label: '已接收' }, { id: 'session', label: '会话文件' }];
watch(() => props.visible, visible => { if (visible) { query.value = ''; tab.value = 'recent'; } });
const filtered = computed(() => props.files.filter(file => (tab.value === 'recent' ? file.source !== 'session' : file.source === tab.value) && file.name.toLowerCase().includes(query.value.trim().toLowerCase())));
</script>
<style scoped>
.file-picker-mask { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: flex-end; background: #17203355; }
.file-picker-sheet { width: 100%; max-width: 720px; margin: 0 auto; background: #fff; border-radius: 24px 24px 0 0; padding: 22px 20px calc(14px + env(safe-area-inset-bottom)); box-sizing: border-box; }
.file-picker-heading { display: flex; align-items: center; justify-content: space-between; font-size: 18px; font-weight: 600; color: #343c4d; margin-bottom: 19px; }.file-picker-heading > view { padding: 5px; color: #8c95a5; }
.file-picker-search { display: flex; align-items: center; gap: 10px; border-radius: 12px; background: #f4f6f9; padding: 11px 13px; }.file-picker-search input { flex: 1; min-width: 0; font-size: 14px; }
.file-picker-tabs { display: flex; gap: 24px; margin-top: 14px; border-bottom: 1px solid #eef0f5; }.file-picker-tabs > view { font-size: 13px; color: #919baa; padding: 13px 1px; border-bottom: 2px solid transparent; }.file-picker-tabs > .active { color: #5272ac; border-color: #6682b9; }
.file-picker-list { height: 36vh; max-height: 340px; }.file-picker-row { display: flex; gap: 12px; align-items: center; padding: 15px 0; border-bottom: 1px solid #f0f2f6; }.file-picker-icon { width: 42px; height: 46px; display: flex; align-items: center; justify-content: center; background: #f2f5fa; border-radius: 10px; }.file-picker-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }.file-picker-copy > text:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: #424b5e; }.file-picker-copy > text:last-child { font-size: 11px; color: #a1a9b6; }
.file-picker-empty { height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; font-size: 13px; color: #a1a9b6; }.file-picker-footer { padding-top: 15px; }.file-picker-footer button { display: flex; align-items: center; gap: 10px; padding: 13px; border: 1px solid #e8edf5; border-radius: 12px; background: #f7f9fc; font-size: 14px; color: #536886; line-height: 1.5; }.file-picker-footer button text { flex: 1; text-align: left; }.file-picker-footer button::after { border: 0; }
</style>
