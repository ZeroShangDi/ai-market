<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { retryPendingCompletions } from '@/services/calls'
onShow(() => { void retryPendingCompletions() })
</script>
<style lang="scss">
page { background: #f7f8fc; color: #1a1f2e; font-family: Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; }
view, text { box-sizing: border-box; }
</style>
