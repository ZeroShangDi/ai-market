import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ApiError, uuid } from './validation.js';

/** Generic lifecycle/transport host. Rule semantics and persistence belong to plugin packages. */
export async function createPluginRuntime({dataDir, work, entries, root:configuredRoot, createConversation, publicBase=process.env.PLUGIN_PUBLIC_URL || '', callbackBase=process.env.PLUGIN_CALLBACK_URL || 'http://127.0.0.1:48082/plugin-hooks'}) {
  const root=configuredRoot || process.env.WORK_BUILTIN_ROOT || fileURLToPath(new URL('../../../plugins',import.meta.url));
  entries ??= JSON.parse(await readFile(join(root,'runtime-catalog.json'),'utf8'));
  const modules=new Map();
  const allowed=new Set((process.env.PLUGIN_WEBHOOK_HOSTS||'').split(',').filter(Boolean));
  function localTarget(value) { return publicBase && value.startsWith(publicBase.replace(/\/$/,'')+'/'); }
  function validateTarget(value) {
    let url;try{url=new URL(value);}catch{throw new ApiError(400,'PLUGIN_INVALID','通知地址无效');}
    if(url.username||url.password||url.hash||(!localTarget(value)&&(url.protocol!=='https:'||!allowed.has(url.host)))) throw new ApiError(400,'PLUGIN_INVALID','通知地址尚未获准；使用事件接收地址或已配置的 HTTPS 目标');
  }
  async function receive(path,payload,key,source) {
    const [id,rule,secret,...rest]=path.split('/');
    if(rest.length||!modules.has(id))throw new ApiError(404,'PLUGIN_NOT_FOUND','插件不存在');
    return modules.get(id).receive(rule,secret,payload,key,source);
  }
  for(const entry of entries) {
    if(!/^[a-z][a-z0-9_]+$/.test(entry.id)||!/^[a-z][a-z0-9-]+$/.test(entry.directory))throw Error('Invalid runtime manifest');
    const dir=join(dataDir,'plugins',entry.id);await mkdir(dir,{recursive:true,mode:0o700});
    const mod=await import(pathToFileURL(join(root,entry.directory,'runtime.js')).href);
    modules.set(entry.id,await mod.activateRuntime({dataDir:dir,uuid,publicBase:publicBase.replace(/\/$/,''),callbackBase,validateTarget,
      async enabled(actor) {
        const item=(await work.capabilities(actor)).items.find(p=>p.id===entry.id);
        return !!(item?.enabled && item.installed);
      },
      async createWork(actor,input) {
        if(!work||!createConversation)throw new ApiError(503,'PLUGIN_UNAVAILABLE','后台工作尚未配置');
        const conversation=await createConversation(actor,input);
        const session=await work.create(actor,{conversation_id:conversation.id,source_type:input.source_type});
        await work.send(actor,session.id,{request_id:input.request_id,prompt:input.prompt,resource_ids:[],enqueue:true});
        return {session_id:session.id,conversation_id:conversation.id};
      },
      async deliver(url,payload,key,source) {
        validateTarget(url);
        if(localTarget(url))return receive(url.slice(publicBase.replace(/\/$/,'').length+1),payload,key,source);
        const result=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});
        await result.body?.cancel();if(!result.ok)throw Error('Notification delivery failed');
      }
    }));
  }
  return { async handle(actor,id,operation,input) {const mod=modules.get(id);if(!mod)throw new ApiError(404,'PLUGIN_NOT_FOUND','插件不存在');if(!input || typeof input !== 'object' || Array.isArray(input))throw new ApiError(400,'PLUGIN_INVALID','输入无效');return mod.handle(actor,operation,input);}, receive,
    async close(){for(const mod of modules.values())await mod.close();} };
}
export function conversationClient(env=process.env) {
  return async (actor,input)=>{
    if(!env.AI_SERVICE_URL||!env.AI_INTERNAL_TOKEN)throw new ApiError(503,'PLUGIN_UNAVAILABLE','后台会话服务未配置');
    const response=await fetch(`${env.AI_SERVICE_URL.replace(/\/$/,'')}/internal/v1/ai/conversations`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${env.AI_INTERNAL_TOKEN}`,'Content-Type':'application/json','Idempotency-Key':input.request_id,'X-AI-Tenant':actor.tenant,'X-AI-User':actor.user,'X-AI-Device':actor.device},
      body:JSON.stringify({source_type:input.source_type})});
    if(!response.ok)throw Error('Conversation creation unconfirmed');return (await response.json()).data;
  };
}
