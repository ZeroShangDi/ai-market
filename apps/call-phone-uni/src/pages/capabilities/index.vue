<template><view class="page"><MobileHeader title="能力中心" back-icon-name="chevron-left" back-fallback="/pages/apps/index" /><CapabilityCenter v-bind="capabilities" @reload="loadCapabilities" @configure="configure" /></view></template>
<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import MobileHeader from '@/components/MobileHeader.vue';
import CapabilityCenter from '@/components/CapabilityCenter.vue';
import { capabilities, loadCapabilities, configureCapability } from '@/services/capabilities';
import { ensureSession } from '@/services/session';
import { toast } from '@/ui/format';
onShow(async () => { if (await ensureSession()) await loadCapabilities(); });
async function configure(id: string, action: string, skill?: string) { try { await configureCapability(id, action, skill); } catch (e: any) { toast(e.message || '能力配置失败'); } }
</script>
<style scoped>.page { height: 100vh; display: flex; flex-direction: column; background: #fff; }</style>
