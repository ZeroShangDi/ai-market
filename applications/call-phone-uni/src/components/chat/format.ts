/** 会话列表时间：今天 HH:mm / 昨天 / 星期X / 月-日 */
export function friendlyTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === now.toDateString()) return hm;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '昨天';

  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);
  if (days > 0 && days < 7) return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 聊天内时间分隔：下午 3:24 */
export function chatTime(ts: number): string {
  const date = new Date(ts);
  const hour = date.getHours();
  const prefix = hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 13 ? '中午' : hour < 18 ? '下午' : '晚上';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${prefix} ${hour12}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
