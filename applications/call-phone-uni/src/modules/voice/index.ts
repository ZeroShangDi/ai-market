import {reactive} from 'vue';
import * as native from '@/uni_modules/portable-voice';
import * as petNative from '@/uni_modules/portable-pet-overlay';
import {applicationUrl,client} from '@/platform';
import {activePackage} from '@/modules/pet-packages';
import {requestRuntimePermissions} from '@/modules/device-readiness';
import type {VoiceTranscript} from './transcript';
import {logger} from '@/services/logger';
export const voice=reactive({opening:false,active:false,desktop:false});let revision=0;
const listeners=new Set<(v:VoiceTranscript|null)=>void>();
export function onVoiceTranscript(fn:(v:VoiceTranscript|null)=>void){listeners.add(fn);return()=>listeners.delete(fn);}
function report(v:VoiceTranscript|null){for(const fn of listeners)fn(v);}
function scene(state:string){try{petNative.execute('scene',JSON.stringify({id:activePackage()?.scenes?.[state]||''}),()=>{});}catch{}}
function menu(active:boolean){try{petNative.execute('voiceState',JSON.stringify({active}),()=>{});}catch{}}
export function closeVoice(){revision++;native.closeVoice();voice.opening=false;voice.active=false;voice.desktop=false;menu(false);scene('idle');report(null);}
export function closeAppVoice(){if(!voice.desktop)closeVoice();}
export function toggleDesktopVoice(){if(voice.opening||voice.active)closeVoice();else void openVoice(true);}
client.subscribe(value=>{if(!value)closeVoice();});
export async function openVoice(desktop=false){if(voice.opening||voice.active)return;const rev=++revision;voice.opening=true;voice.desktop=desktop;try{
 await requestRuntimePermissions(['android.permission.RECORD_AUDIO']);const url=await applicationUrl('voice');if(!/^https:\/\//.test(url))throw Error('宠物语音需要 HTTPS 应用服务地址');if(rev!==revision)return;
 (desktop?native.openDesktopVoice:native.openVoice)(url,event=>{if(rev!==revision)return;if(event==='connected'){voice.active=true;voice.opening=false;menu(true);}else if(event==='closed'||event==='error'){closeVoice();if(event==='error')uni.showToast({title:'语音连接失败，请检查服务',icon:'none'});}else try{const v=JSON.parse(event);if(v.type==='activity')scene(v.state);if(v.type==='transcript'&&['user','assistant'].includes(v.role))report({role:v.role,text:v.text} as VoiceTranscript);}catch{}});
 }catch{if(rev===revision){closeVoice();logger.warn('voice','connection.failed');uni.showToast({title:'语音未连接，请检查权限和 HTTPS 服务',icon:'none'});}}}
