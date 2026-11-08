<script lang="ts" setup>
import { propTypes } from '@/utils/propTypes'
import {safeEntryUrl} from '../../../../../shared/client'

defineOptions({ name: 'IFrame' })

const props = defineProps({
  src: propTypes.string.def('')
})
const frameUrl = computed(() => {
  try {
    const url = new URL(safeEntryUrl(props.src))
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin === location.origin) return ''
    return url.href
  } catch { return '' }
})
const loading = ref(true)
const frameRef = ref<HTMLIFrameElement | null>(null)
const init = () => {
  nextTick(() => {
    loading.value = !!frameUrl.value
    if (!frameRef.value) return
    frameRef.value.onload = () => {
      loading.value = false
    }
  })
}
onMounted(() => {
  init()
})
onBeforeUnmount(() => {
  if (!frameRef.value) return
  frameRef.value.onload = null
  frameRef.value.src = 'about:blank'
})
watch(
  () => props.src,
  () => {
    init()
  }
)
</script>
<template>
  <div
    v-loading="loading"
    class="w-full h-[calc(100vh-var(--top-tool-height)-var(--tags-view-height)-var(--app-content-padding)-var(--app-content-padding)-2px)]"
  >
    <el-result v-if="!frameUrl" icon="warning" title="暂时无法打开此页面" sub-title="请联系管理员检查模块入口" />
    <iframe v-else
      ref="frameRef"
      :src="frameUrl"
      sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"
      referrerpolicy="no-referrer"
      frameborder="0"
      scrolling="auto"
      height="100%"
      width="100%"
      allowfullscreen="true"
      webkitallowfullscreen="true"
      mozallowfullscreen="true"
    ></iframe>
  </div>
</template>
