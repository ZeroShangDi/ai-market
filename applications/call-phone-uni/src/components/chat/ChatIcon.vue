<template>
  <image class="chat-icon" :src="src" mode="aspectFit" :style="{ width: `${size}px`, height: `${size}px` }" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

const RAW: Record<string, string> = {
  mic: '<rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M5 10.5v.8a7 7 0 0 0 14 0v-.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><line x1="12" y1="18.3" x2="12" y2="21.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="6" cy="10" r="1" fill="currentColor"/><circle cx="10" cy="10" r="1" fill="currentColor"/><circle cx="14" cy="10" r="1" fill="currentColor"/><circle cx="18" cy="10" r="1" fill="currentColor"/><line x1="7" y1="14.4" x2="17" y2="14.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  smile: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="10" r="1.1" fill="currentColor"/><circle cx="15.5" cy="10" r="1.1" fill="currentColor"/><path d="M8 14.5s1.5 2 4 2 4-2 4-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  plus: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor"/><path d="M4 17l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  camera: '<path d="M22 18.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5L9 3.5h6L16.5 6H20a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  video: '<rect x="2" y="5" width="14" height="14" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 10l6-3.5v11L16 14z" fill="currentColor"/>',
  phone: '<path d="M21.5 16.9v2.6a2 2 0 0 1-2.2 2 19.6 19.6 0 0 1-8.5-3 19.3 19.3 0 0 1-6-6 19.6 19.6 0 0 1-3-8.6A2 2 0 0 1 3.8 2h2.6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.5 9.7a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  location: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  play: '<polygon points="7 4 20 12 7 20" fill="currentColor"/>',
  mute: '<rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M5 10.5v.8a7 7 0 0 0 14 0v-.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><line x1="12" y1="18.3" x2="12" y2="21.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  speaker: '<path d="M11 5L6 9H2v6h4l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  switchCamera: '<path d="M4 8a8 8 0 0 1 13.5-3L21 8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><polyline points="21 3 21 8 16 8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 16a8 8 0 0 1-13.5 3L3 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><polyline points="3 21 3 16 8 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  hangup: '<g transform="rotate(135 12 12)"><path d="M21.5 16.9v2.6a2 2 0 0 1-2.2 2 19.6 19.6 0 0 1-8.5-3 19.3 19.3 0 0 1-6-6 19.6 19.6 0 0 1-3-8.6A2 2 0 0 1 3.8 2h2.6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.5 9.7a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" fill="currentColor" stroke="none"/></g>',
  more: '<circle cx="5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="19" cy="12" r="1.9" fill="currentColor"/>',
  back: '<polyline points="15 18 9 12 15 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<polyline points="4 12 9 17 20 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
};

const props = withDefaults(defineProps<{ name: string; size?: number; color?: string }>(), {
  size: 22,
  color: '#1a1f2e'
});

const src = computed(() => {
  const body = RAW[props.name] || RAW.more;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body.split('currentColor').join(props.color)}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});
</script>

<style scoped>
.chat-icon {
  display: block;
  flex-shrink: 0;
}
</style>
