import { toast } from './format';

export function markdownHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000 || /[\x00-\x20\x7f]/.test(value)) return;
  const match = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(value);
  if (!match || match[1].includes('@') || /[<>"'\\]/.test(value)) return;
  return value;
}

export function handleMarkdownClick(context: { node?: { type?: string; href?: string } }) {
  const node = context?.node;
  if (!node || !['link', 'image'].includes(node.type || '')) return;
  const url = markdownHttpUrl(node.href);
  if (!url) { toast('仅支持打开有效的网页链接'); return; }
  if (node.type === 'image') { uni.previewImage({ urls: [url], current: url }); return; }
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.runtime?.openURL) {
    plus.runtime.openURL(url, () => toast('链接无法打开，请稍后重试')); return;
  }
  // #endif
  // #ifdef H5
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer'); return;
  }
  // #endif
  uni.setClipboardData({ data: url, success: () => toast('链接已复制，可在浏览器打开') });
}
