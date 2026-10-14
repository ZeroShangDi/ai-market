<template>
  <image
    class="app-icon"
    :src="resolved.src"
    mode="aspectFit"
    :style="{ width: `${pixelSize}px`, height: `${pixelSize}px` }"
    :aria-label="label || undefined"
    :aria-hidden="!label"
    @error="failed = true"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fallbackIcon, normalizeIconSize, resolveIcon } from '@/modules/icons';

const props = withDefaults(defineProps<{
  name: string;
  size?: number | string;
  color?: string;
  label?: string;
}>(), { size: 24 });

const failed = ref(false);
watch(() => [props.name, props.color], () => { failed.value = false; });
const pixelSize = computed(() => normalizeIconSize(props.size));
const resolved = computed(() => resolveIcon(failed.value ? fallbackIcon : props.name, props.color));
</script>

<style scoped>
.app-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
