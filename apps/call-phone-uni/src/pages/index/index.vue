<template><view class="page">
  <view class="wrap"><view class="head"><text>工作台</text><view class="action" @tap="openMine"><image src="/static/figma/2-2-imgFrame.svg" /></view></view><PreviewBanner /></view>
  <TabBar current="workbench" />
</view></template>
<script setup lang="ts">
import TabBar from '@/components/TabBar.vue'
import PreviewBanner from '@/components/PreviewBanner.vue'
function openMine() { uni.showToast({ title: '工作台快捷入口尚未配置', icon: 'none' }) }
</script>
<style scoped lang="scss">
.page { min-height: 100vh; background: #f7f8fc; }.wrap { max-width: 500px; margin: auto; padding-top: calc(19px + var(--status-bar-height) + env(safe-area-inset-top)); }.head { height: 46px; margin: 0 19px; display: flex; align-items: center; justify-content: space-between; font-size: 25px; font-weight: 500; }.action { width: 36px; height: 36px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: white; box-shadow: 0 6px 16px rgba(20,31,51,.06); }.action image { width: 20px; height: 20px; }
</style>
