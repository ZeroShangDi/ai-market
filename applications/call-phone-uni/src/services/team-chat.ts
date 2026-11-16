import {downloadNativeFile} from '../../shared/mobile/native-download.js';
import {applicationHost,applicationUrl} from '@/platform';
export interface TeamContact{id:string;name:string;capabilities:{send:string[];receive:string[];voiceCall:boolean}}
export interface TeamMessage{id?:string;role:'user'|'assistant';text:string;status?:string;workSessionId?:string;files?:{id:string;title:string}[]}
function request(path:string,token:string,data?:Record<string,unknown>):Promise<any>{
 return new Promise((resolve,reject)=>uni.request({url:applicationHost()+'/mobile-host'+path,method:data===undefined?'GET':'POST',header:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(data===undefined?{}:{data}),timeout:140000,success:r=>r.statusCode===200?((r.data as any)?.status==='failed'?reject(new Error((r.data as any).message||'发送失败')):resolve(r.data)):reject(new Error(r.statusCode===401?'登录已失效，请重新进入':'服务暂不可用')),fail:()=>reject(new Error('连接失败，请检查网络'))}));
}
export async function openTeamChat(agentId?:string){
 const url=await applicationUrl('team-chat',agentId),ticket=url.split('#')[1];
 if(!ticket)throw new Error('应用入口无效');
 const session=await request('/bootstrap','',{ticket});
 return {voiceUrl:async()=> (await applicationUrl('team-chat',session.agentId)).replace('/team-chat/#','/team-chat/audio.html#'),agentId:session.agentId as string,contacts:async()=>((await request('/team/contacts',session.token)).items as TeamContact[]),history:async()=>((await request('/chat',session.token)).messages as TeamMessage[]),sync:async()=>((await request('/chat/results',session.token,{})).messages as TeamMessage[]),download:async(workSessionId:string,file:{id:string;title:string})=>{
 const url=applicationHost()+'/mobile-host/work/file',body={workSessionId,artifactId:file.id};
 if(typeof plus!=='undefined')return downloadNativeFile({native:plus,url,token:session.token,body,title:file.title,onOpenError:()=>uni.showToast({title:'文件已下载，当前格式无法打开',icon:'none'})});
 // #ifdef H5
 const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error('文件下载失败');const objectUrl=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=objectUrl;a.download=file.title;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);return;
 // #endif
 throw new Error('当前环境不支持文件下载');
 },send:async(text:string)=>request('/team/action',session.token,{action:'send_message',params:{detail_type:'private',user_id:session.agentId,message:[{type:'text',data:{text}}]}})};
}
