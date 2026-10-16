import { reactive } from 'vue';
import * as receiver from '@/uni_modules/work-file-receiver';
import { hasAccessToken, onSessionChange, onDeviceChange } from '@/api/http';
import { hasUnfinishedCall } from './calls';
import { logger } from './logger';

export const incomingWorkFiles = reactive({ items: [] as { id: string; name: string; size: number }[], batch: '', conversation: '', error: '' });
function clearBinding() { incomingWorkFiles.conversation = ''; incomingWorkFiles.error = ''; }
onSessionChange(clearBinding); onDeviceChange(clearBinding);
let navigating = false;
export function receiveIncomingWorkFiles() {
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') return;
  try {
    const items = JSON.parse(receiver.pendingFiles());
    if (!Array.isArray(items) || !items.length) return;
    incomingWorkFiles.items = items;
    const batch = items.map(item => item.id).join(',');
    if (batch !== incomingWorkFiles.batch) { incomingWorkFiles.batch = batch; incomingWorkFiles.conversation = ''; incomingWorkFiles.error = ''; }
    if (!hasAccessToken()) { uni.showToast({ title: '文件已接收，请先连接电脑', icon: 'none' }); return; }
    if (hasUnfinishedCall()) { uni.showToast({ title: '文件已接收，完成通话后返回应用继续', icon: 'none' }); return; }
    const pages = getCurrentPages();
    if (pages.at(-1)?.route !== 'pages/ai-chat/index' && !navigating) {
      navigating = true;
      uni.navigateTo({ url: '/pages/ai-chat/index', complete: () => { navigating = false; } });
    }
  } catch { logger.warn('work-files', 'incoming.receive_failed'); uni.showToast({ title: '接收的文件暂不可用，请重新打开文件', icon: 'none' }); }
  // #endif
}
export function readIncomingWorkFile(id: string) { return receiver.readPendingFile(id); }
export function discardIncomingWorkFile(id: string) {
  if (!receiver.discardPendingFile(id)) throw new Error('临时文件清理失败，请重试');
  incomingWorkFiles.items = incomingWorkFiles.items.filter(item => item.id !== id);
  incomingWorkFiles.batch = incomingWorkFiles.items.map(item => item.id).join(',');
}
