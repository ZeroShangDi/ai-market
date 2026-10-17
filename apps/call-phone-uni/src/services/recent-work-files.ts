import { reactive } from 'vue';
import { onSessionChange, onDeviceChange } from '@/api/http';
import type { WorkUpload } from './work-files';

// In-memory only: do not leave business attachment bytes in web storage or logs.
export const recentWorkFiles = reactive<{ id: string; name: string; received: boolean }[]>([]);
const files = new Map<string, WorkUpload>();
let serial = 0;
export function clearRecentWorkFiles() { files.clear(); recentWorkFiles.splice(0); }
onSessionChange(clearRecentWorkFiles); onDeviceChange(clearRecentWorkFiles);
export function rememberWorkFile(file: WorkUpload, received = false) {
  const existing = [...files].find(([, item]) => item.name === file.name && item.content_base64 === file.content_base64);
  if (existing) { const index = recentWorkFiles.findIndex(item => item.id === existing[0]); if (index >= 0) recentWorkFiles.splice(index, 1); }
  const id = existing?.[0] || `recent-${++serial}`;
  files.set(id, { ...file }); recentWorkFiles.unshift({ id, name: file.name, received });
  while (recentWorkFiles.length > 10 || [...files.values()].reduce((size, item) => size + item.content_base64.length, 0) > 24 * 1024 * 1024) {
    const removed = recentWorkFiles.pop(); if (removed) files.delete(removed.id); else break;
  }
}
export function readRecentWorkFile(id: string) { const file = files.get(id); if (!file) throw new Error('文件已失效，请重新选择'); return { ...file }; }
