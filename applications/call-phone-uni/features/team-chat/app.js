import {ready,api,showError,renderMessages} from './common.js';
const list=document.querySelector('#messages'),form=document.querySelector('#form'),input=document.querySelector('#input'),send=document.querySelector('#send');
let busy=false,initialized=false,loading=false,queued=false,disposed=false,timer;
async function load(){
 if(disposed)return;if(loading){queued=true;return;}loading=true;
 try {
  const h=await api('/chat');if(disposed)return;renderMessages(list,h.messages);
  if(!busy){try{const result=await api('/chat/results',{});if(!disposed)renderMessages(list,result.messages);}catch{if(!disposed)showError('工作结果暂未同步，可稍后刷新；文字聊天仍可使用');}}
 } finally {loading=false;if(queued&&!disposed){queued=false;void load().catch(showError);}}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();if(!initialized||busy||!input.value.trim())return;
 busy=true;send.disabled=true;showError('');const text=input.value;input.value='';
 try{await api('/chat',{text});}
 catch{showError('发送结果未确认，请刷新查看记录，勿重复提交');}
 finally{busy=false;send.disabled=disposed;await load().catch(()=>{});}
});
document.querySelector('#refresh').onclick=()=>load().catch(showError);
function schedule(){clearTimeout(timer);if(disposed)return;timer=setTimeout(async()=>{if(!document.hidden&&!busy)await load().catch(()=>{});schedule();},15000);}
window.addEventListener('transcript-saved',()=>{void load().catch(showError);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!disposed)void load().catch(showError);});
window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(timer);});
window.addEventListener('pageshow',()=>{if(disposed){disposed=false;if(initialized){send.disabled=busy;void load().catch(showError);schedule();}}});
const contact=document.querySelector('#contact');
async function loadContacts(current){if(!contact)return;const r=await api('/team/contacts');contact.replaceChildren();for(const item of r.items){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;option.selected=item.id===current;contact.append(option);}contact.disabled=!r.items.length;contact.onchange=async()=>{contact.disabled=true;try{const next=await api('/team/select',{agentId:contact.value});location.assign(next.url);}catch(e){showError(e);contact.disabled=false;}};}
send.disabled=true;ready().then(async session=>{await loadContacts(session.agentId);}).then(()=>{if(disposed)return;initialized=true;send.disabled=false;schedule();return load();}).catch(showError);
