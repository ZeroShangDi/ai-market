import {ready,api,showError,renderMessages} from '../common.js';
const list=document.querySelector('#messages'),form=document.querySelector('#form'),input=document.querySelector('#input'),send=document.querySelector('#send');let busy=false,initialized=false;
async function load(){const h=await api('/chat');renderMessages(list,h.messages);}
form.addEventListener('submit',async e=>{e.preventDefault();if(!initialized||busy||!input.value.trim())return;busy=true;send.disabled=true;showError('');const text=input.value;input.value='';try{await api('/chat',{text});await load();}catch{showError('发送结果未确认，请刷新查看记录，勿重复提交');await load().catch(()=>{});}finally{busy=false;send.disabled=false;}});
document.querySelector('#refresh').onclick=()=>load().catch(showError);send.disabled=true;ready().then(load).then(()=>{initialized=true;send.disabled=false;}).catch(showError);
