import type { UpdateState } from './core';

const fallbackNotes = ['优化使用体验，修复已知问题'];
/** Old signed feeds may still contain the full changelog. Never display a wall of text. */
export function updateHighlights(notes: string): string[] {
  const lines = notes.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    .filter(line => !/^#{1,6}\s/.test(line))
    .map(line => line.replace(/^(?:[-*•]\s+|\d+[.、]\s*)/, '').trim());
  if (!lines.length || lines.length > 3 || lines.some(line => Array.from(line).length > 32) ||
      lines.reduce((sum, line) => sum + Array.from(line).length, 0) > 90) return fallbackNotes;
  return lines;
}

export function updateProgress(state: UpdateState) {
  return state.status === 'downloading' ? Math.min(100, Math.max(0, Math.round(state.progress || 0))) : 100;
}

export function updatePresentation(state: UpdateState) {
  switch (state.status) {
    case 'downloading': return { title: '正在下载更新', detail: '下载完成后将自动打开系统安装', action: '', icon: 'arrow-down' };
    case 'verifying': return { title: '正在校验安装包', detail: '即将进入系统安装', action: '', icon: 'shield' };
    case 'installing': return { title: '正在打开安装', detail: '请稍候', action: '', icon: 'shield' };
    case 'installationRequested': return { title: '请完成系统安装', detail: '安装结果将在返回应用后确认', action: '', icon: 'check' };
    case 'readyToInstall': return { title: '安装包已就绪', detail: '点击下方按钮继续安装', action: '继续安装', icon: 'check' };
    case 'failed': return { title: state.stage === 'install' ? '暂时无法安装' : '更新暂未完成', detail: state.message || '请稍后重试', action: state.retryable === false ? '' : (state.stage === 'install' ? '重新安装' : '重试下载'), icon: 'info' };
    case 'cancelled': return { title: '已取消更新', detail: '可以随时重新下载', action: '重新下载', icon: 'arrow-down' };
    case 'upToDate': return { title: '已更新至最新版本', detail: '', action: '', icon: 'check' };
    default: return { title: '准备更新', detail: '', action: '立即更新', icon: 'arrow-down' };
  }
}
