<template><view v-if="mockEnabled" class="preview">开发模拟数据 · 未连接生产接口</view></template>
<script setup lang="ts">import { mockEnabled } from '@/config'</script>
<style scoped>.preview { margin: 4px 19px 0; color: #a96812; font-size: 11px; }</style>
