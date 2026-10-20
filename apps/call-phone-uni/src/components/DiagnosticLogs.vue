<template>
  <view class="logs-card">
    <view class="logs-row">
      <text class="logs-title">诊断日志</text>
      <button class="logs-action" :disabled="exporting" @tap="download">{{ exporting ? '准备中…' : '分享日志' }}</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { logger, diagnosticEnvironment } from '@/services/logger';
import { shareLog } from '@/modules/diagnostics/export';
const exporting = ref(false);
async function download() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    logger.info('diagnostics', 'export.requested');
    const content = logger.export(diagnosticEnvironment());
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const saved = await shareLog(`tongzige-diagnostics-${stamp}.jsonl`, content);
    if (saved === 'downloaded') uni.showToast({ title: '日志已导出', icon: 'success' });
    logger.info('diagnostics', saved === 'shared' ? 'share.opened' : 'export.completed');
  } catch (error) {
    logger.error('diagnostics', 'export.failed', { error });
    uni.showToast({ title: error instanceof Error ? error.message : '日志导出失败，请重试', icon: 'none' });
  } finally { exporting.value = false; logger.flush(); }
}
</script>
<style scoped>
.logs-card { margin-top: 12px; padding: 14px; border-radius: 18px; background: white; box-shadow: 0 6px 16px rgba(20,31,51,.06); }
.logs-row { display: flex; align-items: center; gap: 12px; min-height: 40px; }
.logs-title { flex: 1; color: #1a1f2e; font-size: 14px; font-weight: 500; }
.logs-action { flex-shrink: 0; margin: 0; padding: 0 14px; min-width: 92px; height: 34px; line-height: 34px; background: #edf1ff; color: #294fdb; border-radius: 10px; font-size: 12px; }
.logs-action::after { border: 0; }
</style>
