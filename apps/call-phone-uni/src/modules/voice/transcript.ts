export type VoiceTranscript = { role: 'user' | 'assistant'; text: string };
/** Pet text is transient, bounded and never written to diagnostics/storage. */
export function voiceBubble(value: VoiceTranscript): string {
  const text = value.text.replace(/\s+/g, ' ').trim();
  const prefix = value.role === 'user' ? '你：' : '她：';
  if (prefix.length + text.length <= 80) return prefix + text;
  let tail = '';
  for (const char of Array.from(text).reverse()) {
    if (prefix.length + 1 + char.length + tail.length > 80) break;
    tail = char + tail;
  }
  return prefix + '…' + tail;
}
