<script setup lang="ts">
import * as ConfigApi from '@/api/infra/config'
import { safeEntryUrl } from '../../../../shared/client'

const props = defineProps<{ kind: 'server' | 'druid' | 'skywalking' }>()
const frameUrl = ref('')
const loading = ref(true)
const failed = ref(false)
onMounted(async () => {
  try {
    const keys = { server: 'url.spring-boot-admin', druid: 'url.druid', skywalking: 'url.skywalking' }
    const configured = await ConfigApi.getConfigKey(keys[props.kind])
    if (configured) {
      const url = new URL(safeEntryUrl(configured))
      // 同源只允许代码中固定的监控路径，不允许配置借此载入任意壳子页面。
      const internal = props.kind === 'server' ? '/admin/' : props.kind === 'druid' ? '/druid/' : ''
      if (url.origin === location.origin && (!internal || !url.pathname.startsWith(internal))) throw new Error('invalid monitoring route')
      frameUrl.value = url.href
    } else if (props.kind !== 'skywalking') {
      frameUrl.value = props.kind === 'server' ? '/admin/applications' : '/druid/index.html'
    }
  } catch { failed.value = true }
  finally { loading.value = false }
})
</script>
<template>
  <ContentWrap :body-style="{ padding: '0px' }" class="!mb-0">
    <div v-loading="loading" class="h-[calc(100vh-160px)]">
      <el-result v-if="!loading && !frameUrl" icon="warning" :title="failed ? '监控配置不可用' : '尚未配置链路追踪地址'" />
      <iframe v-if="frameUrl" :src="frameUrl" title="监控中心" class="w-full h-full border-none" sandbox="allow-scripts allow-forms allow-same-origin allow-downloads" referrerpolicy="no-referrer" />
    </div>
  </ContentWrap>
</template>
