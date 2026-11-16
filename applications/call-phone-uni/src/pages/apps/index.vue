<template><view class="page" /></template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';

// 应用入口暂时下线，保留路由以避免旧链接落到空白页。
onLoad(() => {
  uni.reLaunch({ url: '/pages/agent/index' });
});
</script>

<style scoped>
.page {
  height: 100vh;
  height: 100dvh;
  background: #f7f8fc;
}
</style>
