import {downloadNativeFile} from '/mobile-host/native-download.js';
let token='';
export const error=document.querySelector('#error');
export function showError(e){error.textContent=typeof e==='string'?e:({NOT_BOUND:'尚未绑定助手会话',VOICE_NOT_BOUND:'语音会话尚未就绪',BINDING_CHANGED:'会话绑定已变化，请联系管理员',UNAUTHORIZED:'登录已失效，请返回应用重新登录',FORBIDDEN:'无权访问该内容',REOPEN_APP:'请返回应用列表重新打开',BUSY:'正在处理上一条消息，请稍后再试'})[e?.message]||'服务暂不可用，请检查连接后重试';}
export async function api(path,body){const r=await fetch('/mobile-host'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();if(!r.ok)throw Error(v.error||'SERVICE_UNAVAILABLE');return v;}
let initialization;
export function ready(){return initialization??=(bootstrap());}
async function bootstrap(){const ticket=location.hash.slice(1);history.replaceState(null,'',location.pathname+location.search);if(!ticket)throw Error('REOPEN_APP');const r=await fetch('/mobile-host/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})});const v=await r.json();if(!r.ok)throw Error('REOPEN_APP');token=v.token;return v;}
export function renderMessages(target,rows){target.replaceChildren();for(const m of rows||[]){const row=document.createElement('article');row.className=m.role==='user'?'message user':'message';const who=document.createElement('small');who.textContent=m.role==='user'?'我':'助手';const text=document.createElement('p');text.textContent=m.text||'';row.append(who,text);if(m.status==='unknown'){const warning=document.createElement('small');warning.textContent='发送结果未确认，请核对工作会话，勿重复提交';row.append(warning);}if(m.files?.length){for(const file of m.files){const button=document.createElement('button');button.type='button';button.textContent=file.title;button.onclick=async()=>{button.disabled=true;try{await downloadWorkFile(m.workSessionId,file);}catch{showError('文件暂不可下载，请检查工作文件共享配置');}finally{button.disabled=false;}};row.append(button);}}target.append(row);}target.scrollTop=target.scrollHeight;}
export async function stream(path,onEvent,signal){const r=await fetch('/mobile-host'+path,{headers:{Authorization:'Bearer '+token},signal});if(!r.ok)throw Error('事件流连接失败');const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const blocks=buffer.split(/\r?\n\r?\n/);buffer=blocks.pop();for(const block of blocks){const data=block.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5)).join('\n');if(data)try{onEvent(JSON.parse(data));}catch{}}}}

async function downloadWorkFile(workSessionId,file){
 if(globalThis.plus?.downloader){await nativeWorkFile(workSessionId,file);return;}
 const r=await fetch('/mobile-host/work/file',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({workSessionId,artifactId:file.id})});
 if(!r.ok)throw Error('FILE_UNAVAILABLE');const blob=await r.blob();
 const fileObject=new File([blob],file.title,{type:blob.type||'application/octet-stream'});
 if(navigator.canShare?.({files:[fileObject]})&&navigator.share){try{await navigator.share({files:[fileObject]});return;}catch(e){if(e.name==='AbortError')return;throw e;}}
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.title;a.textContent=file.title;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}

export function nativeWorkFile(workSessionId,file){return downloadNativeFile({native:globalThis.plus,url:new URL('/mobile-host/work/file',location.href).href,token,body:{workSessionId,artifactId:file.id},title:file.title,onOpenError:()=>showError('文件已保存在应用内，当前手机无法打开此格式')});}
