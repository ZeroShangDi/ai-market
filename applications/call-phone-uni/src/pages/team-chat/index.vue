<template>
 <view class="team-page">
  <MobileHeader title="Agent 同事" back-icon-name="chevron-left"/>
  <view v-if="!session.identity" class="empty"><button @tap="login">登录</button></view>
  <template v-else>
   <picker :range="contacts" range-key="name" :value="selected" :disabled="busy||voiceEngaged" @change="selectContact"><view class="contact">{{contacts[selected]?.name||'正在连接…'}} ▾</view></picker>
   <scroll-view scroll-y class="messages">
    <view v-for="(m,i) in messages" :key="m.id||i"><TChatMessage :name="m.role==='user'?'我':contacts[selected]?.name" :role="m.role" :placement="m.role==='user'?'right':'left'" :status="m.status==='unknown'?'error':'complete'" :content="[{type:'text',data:m.text}]"/><button v-for="file in m.files||[]" :key="file.id" size="mini" @tap="openFile(m,file)">{{file.title}}</button></view>
   </scroll-view>
   <text v-if="error" class="error" role="alert">{{error}}</text>
   <button v-if="nativeAvailable&&contacts[selected]?.capabilities.voiceCall" size="mini" @tap="toggleVoice">{{voiceEngaged?'结束语音':'语音通话'}}</button><text v-if="voiceEngaged" class="contact">{{voiceStatus}}</text>
   <TChatSender :value="draft" :disabled="busy||!connection" @change="setDraft" @send="send"/>
  </template>
 </view>
</template>
<script setup lang="ts">
import {ref,watch} from 'vue';import {onShow,onHide,onUnload} from '@dcloudio/uni-app';
import TChatMessage from '@tdesign/uniapp-chat/chat-message/chat-message.vue';
import TChatSender from '@tdesign/uniapp-chat/chat-sender/chat-sender.vue';
import MobileHeader from '@/components/MobileHeader.vue';import {session,openLogin} from '@/platform';
import * as nativeVoice from '@/uni_modules/portable-voice';import {requestRuntimePermissions} from '@/modules/device-readiness';
import {openTeamChat,type TeamContact,type TeamMessage} from '@/services/team-chat';
const contacts=ref<TeamContact[]>([]),messages=ref<TeamMessage[]>([]),selected=ref(0),draft=ref(''),error=ref(''),busy=ref(false),connection=ref<Awaited<ReturnType<typeof openTeamChat>>>();let generation=0,visible=false,connecting=false,timer:ReturnType<typeof setTimeout>|undefined;let refreshingFor:unknown;let contentRevision=0;
async function openFile(m:TeamMessage,file:{id:string;title:string}){if(!connection.value||!m.workSessionId)return;const rev=generation;try{await connection.value.download(m.workSessionId,file);}catch{if(rev===generation)error.value='文件暂不可下载，请检查连接或文件共享配置';}}
const nativeAvailable=typeof plus!=='undefined',voiceEngaged=ref(false),voiceStatus=ref('');let voiceRevision=0;
function stopVoice(){voiceRevision++;if(voiceEngaged.value){voiceEngaged.value=false;nativeVoice.closeVoice();}}
async function toggleVoice(){if(voiceEngaged.value){stopVoice();return;}const client=connection.value;if(!client)return;const rev=++voiceRevision,chatRev=generation;voiceEngaged.value=true;voiceStatus.value='正在连接…';try{await requestRuntimePermissions(['android.permission.RECORD_AUDIO']);if(rev!==voiceRevision||chatRev!==generation)return;const url=await client.voiceUrl();if(rev!==voiceRevision||chatRev!==generation)return;nativeVoice.openInlineVoice(url,event=>{if(rev!==voiceRevision)return;if(event==='connected')voiceStatus.value='语音已连接';else if(event==='closed'||event==='error'){voiceEngaged.value=false;if(event==='error')error.value='语音连接失败，请检查服务与权限';void refresh();}else{try{const value=JSON.parse(event);if(value.type==='transcript')void refresh();}catch{}}});}catch{if(rev===voiceRevision){voiceEngaged.value=false;error.value='语音未连接，请检查权限与服务';}}}
function login(){openLogin('/pages/team-chat/index');}
function setDraft(value:string){draft.value=value;}
async function connect(id?:string){connecting=true;const rev=++generation;connection.value=undefined;messages.value=[];error.value='';try{const client=await openTeamChat(id),items=await client.contacts(),rows=await client.history();if(rev!==generation)return;contacts.value=items;selected.value=Math.max(0,items.findIndex(a=>a.id===client.agentId));connection.value=client;messages.value=rows;void refresh();}catch(e){if(rev===generation)error.value=e instanceof Error?e.message:'连接失败';}finally{if(rev===generation){connecting=false;schedule();}}}
function selectContact(e:any){if(busy.value||voiceEngaged.value)return;const id=contacts.value[Number(e.detail.value)]?.id;if(id)void connect(id);}
async function send(value:string){if(busy.value||!connection.value||!value.trim())return;const client=connection.value,rev=generation;busy.value=true;contentRevision++;error.value='';draft.value='';try{await client.send(value);}catch{if(rev===generation)error.value='发送结果未确认，请稍后核对，勿重复提交';}finally{try{const rows=await client.history();if(rev===generation)messages.value=rows;}catch{}if(rev===generation)busy.value=false;}}
async function refresh(){const client=connection.value,rev=generation,contentRev=contentRevision;if(!client||busy.value||refreshingFor===client)return;refreshingFor=client;try{const rows=await client.sync();if(rev===generation&&contentRev===contentRevision&&session.identity)messages.value=rows;}catch{if(rev===generation)error.value='结果暂未同步，可稍后重试';}finally{if(refreshingFor===client)refreshingFor=undefined;}}
function schedule(){clearTimeout(timer);if(!visible||!session.identity)return;timer=setTimeout(async()=>{await refresh();schedule();},15000);}
function reset(){stopVoice();generation++;clearTimeout(timer);connection.value=undefined;messages.value=[];contacts.value=[];busy.value=false;connecting=false;}
watch(()=>session.identity,identity=>{reset();if(identity&&visible)void connect();});
onShow(()=>{visible=true;if(session.identity){if(!connection.value&&!connecting)void connect();else{void refresh();schedule();}}});onHide(()=>{stopVoice();visible=false;clearTimeout(timer);});onUnload(()=>{visible=false;reset();});
</script>
<style scoped>
.team-page{height:100dvh;box-sizing:border-box;display:flex;flex-direction:column;background:#ededed;padding:12px 12px env(safe-area-inset-bottom)}.contact{padding:14px;background:white;border-radius:10px}.messages{flex:1;min-height:0;padding-top:12px}.error{color:#b44343;padding:8px;font-size:13px}.empty{margin:auto}
</style>
