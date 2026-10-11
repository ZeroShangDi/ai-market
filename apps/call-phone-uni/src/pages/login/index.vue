<template><view /></template>
<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
// Compatibility route for older stored navigation; no separate login screen.
onLoad(() => uni.reLaunch({ url: '/pages/index/index' }));
</script>
