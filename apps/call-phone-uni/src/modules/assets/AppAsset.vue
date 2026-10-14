<template>
  <image v-if="source" v-bind="$attrs" :src="source" :mode="mode" @error="onError" />
  <slot v-else name="fallback" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { resolveAsset } from './index'
const props = withDefaults(defineProps<{
  name: string
  variant?: string
  fallback?: string
  mode?: 'scaleToFill' | 'aspectFit' | 'aspectFill' | 'widthFix' | 'heightFix'
}>(), { variant: 'original', fallback: '', mode: 'aspectFit' })
const emit = defineEmits<{ (event: 'error', detail: unknown): void }>()
const failed = ref(false)
const source = computed(() => failed.value ? props.fallback : resolveAsset(props.name, { variant: props.variant, fallback: props.fallback }))
watch(() => [props.name, props.variant, props.fallback], () => { failed.value = false })
function onError(event: unknown) {
  failed.value = true
  emit('error', event)
}
</script>
