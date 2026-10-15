<template>
  <view v-if="resources.length || capabilities.length" class="attachment-rows">
    <scroll-view v-if="resources.length" class="attachment-row" scroll-x :show-scrollbar="false">
      <view class="attachment-track"><view v-for="item in resources" :key="item.id" class="attachment-pill">
        <TIcon :name="fileAppearance(item.name).icon" :color="fileAppearance(item.name).color" size="16px" /><text class="attachment-name">{{ item.name }}</text>
        <view role="button" :aria-label="'移除 ' + item.name" :aria-disabled="disabled" class="attachment-remove" @tap="!disabled && $emit('removeResource', item.id)"><TIcon name="close" size="12px" /></view>
      </view></view>
    </scroll-view>
    <scroll-view v-if="capabilities.length" class="attachment-row" scroll-x :show-scrollbar="false">
      <view class="attachment-track"><view v-for="item in capabilities" :key="item.id" class="attachment-pill capability-pill">
        <TIcon :name="item.icon" :color="item.color" size="16px" /><text class="attachment-name">{{ item.name }}</text>
        <view role="button" :aria-label="'移除 ' + item.name" :aria-disabled="disabled" class="attachment-remove" @tap="!disabled && $emit('removeCapability', item.id)"><TIcon name="close" size="12px" /></view>
      </view></view>
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { fileAppearance } from '@/ui/work-presentation';
withDefaults(defineProps<{ resources: { id: string; name: string }[]; capabilities?: { id: string; name: string; icon: string; color: string }[]; disabled?: boolean }>(), { capabilities: () => [], disabled: false });
defineEmits<{ (event: 'removeResource', id: string): void; (event: 'removeCapability', id: string): void }>();
</script>
<style scoped>
.attachment-rows { padding: 0 12px 8px; display: flex; flex-direction: column; gap: 6px; }
.attachment-row { width: 100%; height: 34px; white-space: nowrap; }
.attachment-track { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding-right: 2px; }
.attachment-pill { display: inline-flex; flex-shrink: 0; align-items: center; gap: 7px; height: 32px; box-sizing: border-box; max-width: 238px; padding: 0 7px 0 11px; border-radius: 18px; background: #f0f3f8; color: #50596b; }
.capability-pill { background: #f3effa; }.attachment-name { min-width: 0; max-width: 176px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }.attachment-remove { display: flex; align-items: center; justify-content: center; width: 23px; height: 26px; color: #8b94a3; }.attachment-remove[aria-disabled=true] { opacity: .35; }
</style>
