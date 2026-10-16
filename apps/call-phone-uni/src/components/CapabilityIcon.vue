<template><view class="capability-icon" :class="kind"><view class="glyph" :style="{ backgroundImage: `url(&quot;${source}&quot;)` }" /></view></template>
<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ kind: string }>();
const shapes: Record<string, string> = {
  plugins: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  skills: '<path d="m13 3-8 11h6l-1 7 9-12h-7z"/>',
  connections: '<path d="m9 15 6-6m-7 4-2 2a3 3 0 0 0 4 4l3-3m-2-8 3-3a3 3 0 0 1 4 4l-2 2"/>',
  mcp: '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01m4-10h4m-4 10h4"/>',
};
const source = computed(() => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${({plugins:'#5865c9',skills:'#9a6b30',connections:'#338576',mcp:'#5a718d'} as Record<string,string>)[props.kind] || '#5865c9'}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shapes[props.kind] || shapes.plugins}</svg>`));
</script>
<style scoped>
.capability-icon { width: 46px; height: 46px; flex-shrink: 0; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: #eeeffb; }.skills { background: #fbf3e7; }.connections { background: #eaf5f1; }.mcp { background: #edf2f8; }.glyph { width: 24px; height: 24px; background-position: center; background-repeat: no-repeat; background-size: contain; }
</style>
