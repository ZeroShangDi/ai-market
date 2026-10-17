/** Optional host adapter: no microphone/playback state leaks into business pages. */
import { reactive } from 'vue';
import * as native from '@/uni_modules/portable-voice';
import { request, onDeviceChange, onSessionChange } from '@/api/http';
import type { VoiceTranscript } from './transcript';
import { logger } from '@/services/logger';

export const voice = reactive({ opening: false, active: false });
let revision = 0;
const transcriptListeners = new Set<(value: VoiceTranscript | null) => void>();
export function onVoiceTranscript(listener: (value: VoiceTranscript | null) => void) {
  transcriptListeners.add(listener);
  return () => { transcriptListeners.delete(listener); };
}
function transcript(value: VoiceTranscript | null) {
  transcriptListeners.forEach(listener => { try { listener(value); } catch { /* Isolate host presentation. */ } });
}
function microphone(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof plus === 'undefined' || uni.getSystemInfoSync().platform !== 'android') {
      reject(new Error('语音对话目前仅支持 Android App')); return;
    }
    plus.android.requestPermissions(['android.permission.RECORD_AUDIO'], result => {
      if (result.granted.includes('android.permission.RECORD_AUDIO')) resolve();
      else reject(new Error('请允许麦克风权限后再开启语音'));
    }, () => reject(new Error('无法申请麦克风权限，请在系统设置中检查')));
  });
}
export function closeVoice() {
  revision++; voice.opening = false; voice.active = false;
  native.closeVoice(); transcript(null);
}
onDeviceChange(closeVoice);
onSessionChange(closeVoice);
export async function openVoice() {
  if (voice.opening || voice.active) return;
  const current = ++revision;
  voice.opening = true;
  try {
    await microphone();
    if (current !== revision) return;
    const session = await request<{ url: string; ticket: string }>('POST', '/api/v1/mobile/ai/voice/session', {});
    if (current !== revision) return;
    if (!/^https:\/\/[^\s?#@]+\/$/.test(session.url) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.ticket))
      throw new Error('语音服务配置无效');
    native.openVoice(session.url + '#' + session.ticket, event => {
      if (current !== revision) return;
      if (event.startsWith('{')) {
        try {
          const value = JSON.parse(event);
          if (value.type === 'transcript' && ['user', 'assistant'].includes(value.role) && typeof value.text === 'string' && value.text.length <= 6000) transcript(value);
        } catch { /* Ignore invalid native events. */ }
        return;
      }
      voice.opening = false;
      if (event === 'closed' || event === 'error') transcript(null);
      voice.active = event === 'opened';
      if (event === 'error') {
        logger.warn('voice', 'surface.failed');
        uni.showToast({ title: '语音窗口未能打开，请检查安装包与权限', icon: 'none' });
      }
    });
  } catch (error) {
    if (current !== revision) return;
    voice.opening = false;
    logger.warn('voice', 'session.failed', { code: (error as any)?.code || 'VOICE_UNAVAILABLE' });
    uni.showToast({ title: (error as Error)?.message || '语音暂时不可用', icon: 'none' });
  }
}
