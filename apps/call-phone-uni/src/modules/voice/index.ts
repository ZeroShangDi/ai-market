/** Optional host adapter: no microphone/playback state leaks into business pages. */
import { reactive } from 'vue';
import * as native from '@/uni_modules/portable-voice';
import * as petNative from '@/uni_modules/portable-pet-overlay';
import { request, onDeviceChange, onSessionChange } from '@/api/http';
import type { VoiceTranscript } from './transcript';
import { activePackage } from '@/modules/pet-packages';
import { rememberProposal, rejectProposal, submitConfirmedTask, type TaskNotice } from '@/services/voice-work';
import { logger } from '@/services/logger';
import { handleVoicePluginRequest } from '@/services/voice-plugin-host';

export const voice = reactive({ opening: false, active: false, desktop: false });
let revision = 0;
const confirming = new Set<string>();
const notices = new Map<string, (value:boolean)=>void>();
export function notifyVoiceTask(notice:TaskNotice): Promise<boolean> {
  if (!voice.active) return Promise.resolve(false);
  return new Promise(resolve => {
    if (notices.has(notice.id)) { resolve(false);return; }
    const timeout=setTimeout(()=>{
      try { native.deliverTask(JSON.stringify({type:'task_notice_cancel',id:notice.id})); } catch {}
      finish(false);
    },45000);
    function finish(value:boolean) { clearTimeout(timeout);notices.delete(notice.id);resolve(value); }
    notices.set(notice.id,finish);
    try { native.deliverTask(JSON.stringify({type:'task_notice',...notice,text:notice.text.length>200 ? Array.from(notice.text).slice(0,160).join('')+'。完整结果请在工作台查看。' : notice.text})); } catch { finish(false); }
  });
}
function settleNotices() { for(const finish of [...notices.values()]) finish(false); }
async function confirmProposal(value:any, current:number, retry=false) {
  if (confirming.has(value?.id)) return;
  const proposal=rememberProposal(value); if(!proposal) return;
  confirming.add(proposal.id);
  const accepted=await new Promise<boolean>(resolve=>native.confirmTask((retry ? '上次提交未确认。重试使用同一请求编号，不会重复创建；也可以取消并到工作台核对。\n\n' : '')+proposal.prompt,resolve)).catch(()=>false);
  confirming.delete(proposal.id);
  if(!accepted || current!==revision) { rejectProposal(proposal.id);return; }
  // From this point audio close/interruption must never cancel the submission.
  try {
    await submitConfirmedTask(proposal.id);
    if(current===revision) void notifyVoiceTask({id:proposal.id,text:'后台任务已创建，你可以继续和我聊天。完成后会通知你，结果也会保存在工作台。'});
  } catch {
    if(current!==revision) return;
    void confirmProposal(value,current,true);
  }
}
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
function menuState(active: boolean) {
  try { petNative.execute('voiceState', JSON.stringify({ active }), () => {}); } catch { /* Pet is optional. */ }
}
function scene(state: string) {
  const id = activePackage()?.scenes?.[state] || '';
  try { petNative.execute('scene', JSON.stringify({ id }), () => {}); } catch { /* Optional presentation. */ }
}
export function closeAppVoice() { if (!voice.desktop) closeVoice(); }
export function toggleDesktopVoice() {
  if (voice.active || voice.opening) closeVoice(); else void openVoice(true);
}
export function closeVoice() {
  revision++; settleNotices(); voice.opening = false; voice.active = false;
  native.closeVoice(); menuState(false); scene('idle'); voice.desktop = false; transcript(null);
}
onDeviceChange(closeVoice);
onSessionChange(closeVoice);
export async function openVoice(desktop = false) {
  if (voice.opening || voice.active) return;
  const current = ++revision;
  voice.opening = true; voice.desktop = desktop; menuState(true);
  try {
    if (!desktop) await microphone();
    if (current !== revision) return;
    const session = await request<{ url: string; ticket: string }>('POST', '/api/v1/mobile/ai/voice/session', { character: activePackage() ? activePackage()!.id + '-' + activePackage()!.version : '' });
    if (current !== revision) return;
    if (!/^https:\/\/[^\s?#@]+\/$/.test(session.url) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.ticket))
      throw new Error('语音服务配置无效');
    const open = desktop ? native.openDesktopVoice : native.openVoice;
    open(session.url + '#' + session.ticket, event => {
      if (current !== revision) return;
      if (event.startsWith('{')) {
        try {
          const value = JSON.parse(event);
          if (value.type === 'plugin_host_request') {
            void handleVoicePluginRequest(value, () => current === revision).then(result => {
              if (result && current === revision) native.deliverTask(JSON.stringify(result));
            }).catch(() => { /* Host error is retried with the same plugin request ID. */ });
            return;
          }
          if (value.type === 'task_proposal') { void confirmProposal(value,current); return; }
          if (value.type === 'task_notice_ack' && typeof value.id === 'string') { notices.get(value.id)?.(true);return; }
          if (value.type === 'activity' && ['listening','thinking','speaking','working'].includes(value.state)) scene(value.state);
          if (value.type === 'transcript' && ['user', 'assistant'].includes(value.role) && typeof value.text === 'string' && value.text.length <= 6000) transcript(value);
        } catch { /* Ignore invalid native events. */ }
        return;
      }
      voice.opening = false;
      if (event === 'closed' || event === 'error') { revision++; settleNotices(); transcript(null); scene('idle'); }
      voice.active = event === 'opened';
      menuState(voice.active);
      if (!voice.active) voice.desktop = false;
      if (event === 'error') {
        logger.warn('voice', 'surface.failed');
        uni.showToast({ title: '语音窗口未能打开，请检查安装包与权限', icon: 'none' });
      }
    });
  } catch (error) {
    if (current !== revision) return;
    voice.opening = false; voice.desktop = false; menuState(false);
    logger.warn('voice', 'session.failed', { code: (error as any)?.code || 'VOICE_UNAVAILABLE' });
    uni.showToast({ title: (error as Error)?.message || '语音暂时不可用', icon: 'none' });
  }
}
