<template><web-view v-if="url" :src="url" /></template>
<script setup lang="ts">
import {ref} from 'vue';
import {onLoad} from '@dcloudio/uni-app';
import {entriesFor} from '../../../../shared/entries';
import {safeEntryUrl} from '../../../../shared/client';
import {client} from '../../platform';
const url=ref('');
onLoad(query=>{try{
  const entry=entriesFor(client.identity).find(value=>value.enabled!==false&&value.id===query?.id);
  if(!entry||entry.permission&&!client.can(entry.permission))throw new Error('拒绝访问');
  const target=safeEntryUrl(entry.url);
  if(typeof location!=='undefined'&&typeof URL==='function'&&new URL(target).origin===location.origin)throw new Error('模块须独立来源');
  url.value=target;
}catch{uni.showToast({title:'入口不可用',icon:'none'});}});
</script>
