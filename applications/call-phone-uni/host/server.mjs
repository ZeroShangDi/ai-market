import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,rename,stat,realpath} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Control} from './control.mjs';
import {reconcileMessageEvents,readMessageEvents} from './message-events.mjs';
import {parseSendAction,actionSuccess,actionFailure,validateActionEnvelope} from './message-protocol.mjs';
import {contactsFor,agentBinding,validateContactOwnership} from './contacts.mjs';
import {finalDelivery,mergeDeliveries,singleFlight} from './results.mjs';
const root=path.resolve(import.meta.dirname,'..');
export function createHost(config,{control,fetcher=fetch}={}){
  control??=new Control(config.control);const tickets=new Map(),sessions=new Map(),locks=new Set(),workReads=new Map();
  validateContactOwnership(config.bindings);
  const syncResults=singleFlight();
  const owners=new Set(),workOwners=new Set();for(const [key,b]of Object.entries(config.bindings||{})){if(!/^\d{1,19}:\d{1,19}$/.test(key)||owners.has(b.voiceSessionId))throw Error('Bindings must have unique assistant owners');owners.add(b.voiceSessionId);for(const id of b.workSessionIds||[]){if(workOwners.has(id))throw Error('Work ownership conflicts');workOwners.add(id);}}
  const base='/mobile-host';const fail=(code)=>Object.assign(Error(code),{status:code==='UNAUTHORIZED'?401:code==='FORBIDDEN'?403:400});
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  async function body(req){let data='';for await(const c of req){data+=c;if(Buffer.byteLength(data)>32768)throw fail('REQUEST_TOO_LARGE');}try{return data?JSON.parse(data):{};}catch{throw fail('INVALID_JSON');}}
  async function identity(auth,tenant){if(!/^Bearer [^\s]+$/.test(auth||'')||!/^\d{1,19}$/.test(tenant||''))throw fail('UNAUTHORIZED');const r=await fetcher(config.containerUrl+'/admin-api/system/auth/get-permission-info',{headers:{Authorization:auth,'tenant-id':tenant},signal:AbortSignal.timeout(8000)});const d=await r.json();if(!r.ok||d.code!==0||!d.data?.user?.id)throw fail('UNAUTHORIZED');const key=tenant+':'+d.data.user.id;return {key,binding:config.bindings?.[key]};}
  async function voice(method,url,data){const r=await fetcher(config.voiceUrl+url,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(125000)});if(!r.ok)throw Error('VOICE_UNAVAILABLE');return r.json();}
  const server=createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    try{
      const url=new URL(req.url,'http://host');const p=url.pathname;
      if(req.headers.origin&&!config.origins?.includes(req.headers.origin))throw fail('FORBIDDEN');
      if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,tenant-id');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');}
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      if(['GET','HEAD'].includes(req.method)&&p.startsWith(base+'/pet-resources/')){
        const file=p.slice((base+'/pet-resources/').length);if(!/^(?:catalog\.json|[a-z0-9_-]+-\d+\/[a-zA-Z0-9_-]+\.(?:mp4|wav|json|md|txt))$/.test(file))throw fail('FORBIDDEN');
        const resourceRoot=await realpath(config.petResourceRoot||path.join(root,'.local/pet-resources'));const full=await realpath(path.join(resourceRoot,file));if(!full.startsWith(resourceRoot+path.sep))throw fail('FORBIDDEN');const info=await stat(full);if(!info.isFile())throw fail('FORBIDDEN');res.writeHead(200,{'Content-Type':file.endsWith('.json')?'application/json':file.endsWith('.mp4')?'video/mp4':file.endsWith('.wav')?'audio/wav':'text/plain; charset=utf-8','Content-Length':info.size,'Cache-Control':file==='catalog.json'?'no-cache':'public,max-age=31536000,immutable'});if(req.method==='HEAD')res.end();else{const stream=createReadStream(full);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}return;
      }
      const assets=new Map([['/team-chat/audio.html',['team-chat/audio.html','text/html']],['/native-download.js',['../shared/mobile/native-download.js','text/javascript']],['/realtime-qwen.js',['shared/realtime-audio.js','text/javascript']],['/common.js',['shared/common.js','text/javascript']],['/voice/voice.css',['voice/voice.css','text/css']],['/style.css',['shared/style.css','text/css']],['/team-chat/common.js',['team-chat/common.js','text/javascript']],['/team-chat/voice.js',['team-chat/voice.js','text/javascript']],['/team-chat/style.css',['team-chat/style.css','text/css']],...['chat','work','voice','team-chat'].flatMap(n=>[['/'+n+'/',[n+'/index.html','text/html']],['/'+n+'/app.js',[n+'/app.js','text/javascript']]])]);
      if(req.method==='GET'&&p.startsWith(base)&&assets.has(p.slice(base.length))){const [file,type]=assets.get(p.slice(base.length));res.setHeader('Content-Type',type+'; charset=utf-8');res.end(await readFile(path.join(root,'features',file)));return;}
      if(req.method==='POST'&&p===base+'/ticket'){
        const auth=req.headers.authorization,tenant=req.headers['tenant-id'];const user=await identity(auth,tenant);const b=await body(req);if(!['chat','work','voice','team-chat'].includes(b.app))throw fail('INVALID_APP');
        for(const [k,v] of tickets)if(v.expires<Date.now())tickets.delete(k);
        if(tickets.size>=1000)throw fail('BUSY');const agentId=b.app==='team-chat'?(b.agentId??contactsFor(user.binding)[0]?.id):undefined;if(agentId&&!agentBinding(user.binding,agentId))throw fail('FORBIDDEN');const ticket=randomBytes(32).toString('base64url');tickets.set(ticket,{auth,tenant,app:b.app,agentId,key:user.key,expires:Date.now()+30000});return json(res,200,{url:base+'/'+b.app+'/#'+ticket});
      }
      if(req.method==='POST'&&p===base+'/bootstrap'){
        const b=await body(req),t=tickets.get(b.ticket);tickets.delete(b.ticket);if(!t||t.expires<Date.now())throw fail('UNAUTHORIZED');
        const user=await identity(t.auth,t.tenant);if(user.key!==t.key)throw fail('UNAUTHORIZED');for(const [k,v]of sessions)if(v.expires<Date.now())sessions.delete(k);if(sessions.size>=1000)throw fail('BUSY');
        const token=randomBytes(32).toString('base64url');sessions.set(token,{...t,expires:Date.now()+3600000});return json(res,200,{token,app:t.app,agentId:t.agentId});
      }
      const s=sessions.get((req.headers.authorization||'').replace(/^Bearer /,''));if(!s||s.expires<Date.now())throw fail('UNAUTHORIZED');
      const user=await identity(s.auth,s.tenant);if(user.key!==s.key)throw fail('UNAUTHORIZED');const ownerKey=user.key;let binding=user.binding;const key=ownerKey+(s.app==='team-chat'&&s.agentId?'-agent-'+s.agentId:'');
      if(p===base+'/team/contacts'&&req.method==='GET'){if(s.app!=='team-chat')throw fail('FORBIDDEN');return json(res,200,{items:contactsFor(binding)});}
      if(p===base+'/team/select'&&req.method==='POST'){
        if(s.app!=='team-chat')throw fail('FORBIDDEN');const b=await body(req);if(!agentBinding(binding,b.agentId))throw fail('FORBIDDEN');
        if(tickets.size>=1000)throw fail('BUSY');const ticket=randomBytes(32).toString('base64url');tickets.set(ticket,{auth:s.auth,tenant:s.tenant,app:'team-chat',agentId:b.agentId,key:ownerKey,expires:Date.now()+30000});
        return json(res,200,{url:base+'/team-chat/#'+ticket});
      }
      if(s.app==='team-chat'&&s.agentId){binding=agentBinding(binding,s.agentId);if(!binding)throw fail('FORBIDDEN');}
      if(p===base+'/status'&&req.method==='GET')return json(res,200,{chat:!!binding?.voiceSessionId,work:!!binding?.workSessionIds?.length,voice:!!binding?.voiceSessionId});
      if(!binding?.voiceSessionId)throw fail('NOT_BOUND');
      const sid=binding.voiceSessionId;
      const historyFile=path.join(config.dataDir||path.join(root,'.local/history'),key.replace(':','-')+'.json');
      async function history(){try{return JSON.parse(await readFile(historyFile,'utf8'));}catch(e){if(e.code==='ENOENT')return {sessionId:sid,messages:[]};throw e;}}
      async function save(value){if(s.app==='team-chat')reconcileMessageEvents(value,s.agentId);await mkdir(path.dirname(historyFile),{recursive:true,mode:0o700});await writeFile(historyFile+'.tmp',JSON.stringify(value),{mode:0o600});await rename(historyFile+'.tmp',historyFile);}
      if(p===base+'/team/events'&&req.method==='GET'){
        if(s.app!=='team-chat')throw fail('FORBIDDEN');const h=await history();if(h.sessionId!==sid)throw fail('BINDING_CHANGED');try{return json(res,200,readMessageEvents(h,url.searchParams.get('after')||'0',Number(url.searchParams.get('limit')||100)));}catch(e){throw fail(e.message);}
      }
      if(p===base+'/chat'&&req.method==='GET'){const h=await history();if(h.sessionId!==sid)throw fail('BINDING_CHANGED');return json(res,200,{sessionId:h.sessionId,messages:h.messages});}
      if(p===base+'/chat/transcript'&&req.method==='POST'){
        if(!['voice','team-chat'].includes(s.app))throw fail('FORBIDDEN');const b=await body(req);if(!['user','assistant'].includes(b.role)||typeof b.text!=='string'||b.text.length>6000||typeof b.id!=='string'||b.id.length>128)throw fail('INVALID_TRANSCRIPT');if(locks.has(key))throw fail('BUSY');locks.add(key);try{const h=await history();if(h.sessionId!==sid)throw fail('BINDING_CHANGED');if(!h.messages.some(m=>m.id===b.id)){h.messages.push({id:b.id,role:b.role,text:b.text,at:Date.now(),source:'voice'});await save(h);}return json(res,200,{recorded:true});}finally{locks.delete(key);}
      }
      async function sendChat(b){
        if(typeof b.text!=='string'||!b.text.trim()||b.text.length>6000)throw fail('INVALID_TEXT');
        if(locks.has(key))throw fail('BUSY');locks.add(key);
        try{
          const h=await history();if(h.sessionId!==sid)throw fail('BINDING_CHANGED');
          const message={id:randomUUID(),role:'user',text:b.text,at:Date.now(),status:'sending'};h.messages.push(message);await save(h);
          try{const result=await control.call('voice.chat.user',{voiceSessionId:sid,text:b.text,requestId:message.id});message.status='sent';h.messages.push({role:'assistant',text:result.text||'',at:Date.now()});await save(h);return {result,message};}
          catch(e){message.status='unknown';await save(h);throw e;}
        }finally{locks.delete(key);}
      }
      if(p===base+'/team/action'&&req.method==='POST'){
        if(s.app!=='team-chat')throw fail('FORBIDDEN');const raw=await body(req);
        try{
          validateActionEnvelope(raw);
          if(raw.action==='get_supported_actions')return json(res,200,actionSuccess(['send_message','get_supported_actions'],raw.echo));
          const b=parseSendAction(raw,s.agentId),{message}=await sendChat(b);
          return json(res,200,actionSuccess({message_id:message.id,time:message.at/1000},raw.echo));
        }catch(e){return json(res,200,actionFailure(e.message,raw?.echo));}
      }
      if(p===base+'/chat'&&req.method==='POST'){const {result}=await sendChat(await body(req));return json(res,200,result);}
      async function ownedWorks(){
        if(workReads.has(key))return workReads.get(key);
        const pending=readOwnedWorks();workReads.set(key,pending);
        try{return await pending;}finally{if(workReads.get(key)===pending)workReads.delete(key);}
      }
      async function readOwnedWorks(){
        const file=historyFile.replace(/\.json$/,'.works.json');let state={sessionId:sid,cursor:'0',ids:[]};try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(state.sessionId!==sid)throw fail('BINDING_CHANGED');
        const result=await control.tool('bridge_chat_events',{sessionId:sid,after:state.cursor,topics:['task.created'],limit:100});
        for(const event of result.events||[]){if(event.topic==='task.created'&&event.sessionId===sid&&event.payload?.controlSessionId===sid&&typeof event.payload.workSessionId==='string')state.ids.push(event.payload.workSessionId);}
        state.ids=[...new Set(state.ids)].slice(-500);if(result.nextCursor)state.cursor=result.nextCursor;
        await mkdir(path.dirname(file),{recursive:true,mode:0o700});await writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await rename(file+'.tmp',file);return [...new Set([...(binding.workSessionIds||[]),...state.ids])];
      }
      if(p===base+'/work/file'&&req.method==='POST'){
        const b=await body(req);if(!(await ownedWorks()).includes(b.workSessionId))throw fail('FORBIDDEN');
        const status=await control.tool('bridge_chat_status',{sessionId:b.workSessionId});const work=status.work??status;
        const artifact=(work.result?.artifacts||[]).find(a=>a.artifactId===b.artifactId&&(work.result?.artifactIds||[]).includes(a.artifactId));
        if(!artifact)throw fail('FORBIDDEN');
        let local;try{local=artifact.uri.startsWith('file:')?fileURLToPath(artifact.uri):artifact.uri;}catch{throw fail('FORBIDDEN');}
        if(!path.isAbsolute(local))throw fail('FORBIDDEN');
        const full=await realpath(local);let allowed=false;
        for(const folder of config.workArtifactRoots||[]){const folderPath=await realpath(folder);if(full.startsWith(folderPath+path.sep))allowed=true;}
        if(!allowed)throw fail('FORBIDDEN');const info=await stat(full);if(!info.isFile())throw fail('FORBIDDEN');
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':info.size,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(path.basename(full)),'Cache-Control':'no-store'});
        const input=createReadStream(full);input.on('error',()=>res.destroy());res.on('close',()=>input.destroy());input.pipe(res);return;
      }
      if(p===base+'/chat/results'&&req.method==='POST'){
        const result=await syncResults(key+':'+sid,async()=>{
        // Slow desktop reads must never hold the conversation write lock.
        const deliveries=[];let unavailable=0;const recovered=[];
        const before=await history();if(before.sessionId!==sid)throw fail('BINDING_CHANGED');
        for(const message of before.messages.filter(m=>m.role==='user'&&m.status==='unknown'&&m.id).slice(-20)){
          try{const r=await control.call('voice.chat.read.requested',{voiceSessionId:sid,requestId:message.id});if(r.requestId===message.id&&r.status==='completed'&&r.reply?.text)recovered.push({requestId:message.id,reply:r.reply});}catch{unavailable++;}
        }
        for(const id of (await ownedWorks()).slice(-50)) {
          try {const delivery=finalDelivery(id,await control.tool('bridge_chat_status',{sessionId:id}));if(delivery)deliveries.push(delivery);}
          catch {unavailable++;}
        }
        if(locks.has(key))throw fail('BUSY');locks.add(key);
        try {
          const h=await history();if(h.sessionId!==sid)throw fail('BINDING_CHANGED');
          let changed=mergeDeliveries(h,deliveries);
          for(const item of recovered){const original=h.messages.find(m=>m.id===item.requestId);if(original?.status==='unknown'){original.status='sent';h.messages.push({id:'chat-reply:'+item.requestId,role:'assistant',text:item.reply.text,at:Date.now(),replyTo:item.requestId});changed=true;}}
          if(changed)await save(h);
          return {messages:h.messages,unavailable};
        } finally {locks.delete(key);}
        });return json(res,200,result);
      }
      if(p===base+'/work'&&req.method==='GET'){
        const items=[];for(const id of (await ownedWorks()).slice(-50)){try{const result=await control.tool('bridge_chat_status',{sessionId:id});items.push({id,data:result.work?{...result.work,pending:result.pendingInteractions||[]}:result});}catch{items.push({id,unavailable:true});}}return json(res,200,{items});
      }
      if(p===base+'/work/action'&&req.method==='POST'){
        const b=await body(req);if(!(await ownedWorks()).includes(b.id))throw fail('FORBIDDEN');
        const tools={read:'bridge_chat_read',send:'bridge_chat_send',stop:'bridge_chat_stop'};if(!tools[b.action])throw fail('INVALID_ACTION');const args={sessionId:b.id};
        if(b.action==='read')args.view='history';if(b.action==='send'){if(typeof b.text!=='string'||!b.text.trim()||b.text.length>6000)throw fail('INVALID_TEXT');args.text=b.text;args.mode='send';}
        return json(res,200,await control.tool(tools[b.action],args));
      }
      // Per-user bound local Voice session is provisioned by the operator, never an arbitrary client ID.
      if(p.startsWith(base+'/voice/')&&req.method==='POST'){
        if(!binding.localVoiceSessionId||config.voiceOwnerKey!==ownerKey)throw fail('VOICE_NOT_BOUND');const action=p.slice((base+'/voice/').length),b=await body(req);
        if(action==='ticket')return json(res,200,await voice('POST','/api/voice/session',{}));
        if(action==='offer'){if(typeof b.ticket!=='string'||typeof b.sdp!=='string')throw fail('INVALID_OFFER');return json(res,200,await voice('POST','/api/voice/offer',{ticket:b.ticket,sdp:b.sdp,type:'offer'}));}
        if(action==='event'){if(!['transcript','voice','activity','delivery'].includes(b.type))throw fail('INVALID_EVENT');return json(res,200,await voice('POST','/api/sessions/'+encodeURIComponent(binding.localVoiceSessionId)+'/events',b));}
      }
      if(p===base+'/voice/events'&&req.method==='GET'){
        if(!binding.localVoiceSessionId||config.voiceOwnerKey!==ownerKey)throw fail('VOICE_NOT_BOUND');const r=await fetcher(config.voiceUrl+'/api/sessions/'+encodeURIComponent(binding.localVoiceSessionId)+'/events',{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('VOICE_UNAVAILABLE');res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});const reader=r.body.getReader();res.on('close',()=>reader.cancel().catch(()=>{}));try{while(!res.destroyed){const {done,value}=await reader.read();if(done)break;res.write(value);}}finally{res.end();}return;
      }
      throw Object.assign(Error('NOT_FOUND'),{status:404});
    }catch(e){if(!res.headersSent)json(res,e.status||503,{error:e.status?e.message:'SERVICE_UNAVAILABLE',unknown:!e.status&&req.method==='POST'});else res.end();}
  });return {server,close:()=>{control.close?.();server.close();}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const config=JSON.parse(await readFile(process.argv[2]||path.join(root,'.local/host.json'),'utf8'));
  if(config.control?.tokenFile)config.control.token=(await readFile(config.control.tokenFile,'utf8')).trim();
  const host=createHost(config);host.server.listen(config.port||5193,'127.0.0.1',()=>console.log('Mobile host ready on loopback'));
}
