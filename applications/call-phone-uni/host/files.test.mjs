import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createHost} from './server.mjs';
test('downloads require owned work, delivered artifact and real shared path',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'work-files-'));await mkdir(path.join(dir,'shared'));await writeFile(path.join(dir,'shared/report.txt'),'完整报告');await writeFile(path.join(dir,'private.txt'),'secret');await symlink(path.join(dir,'private.txt'),path.join(dir,'shared/escape.txt'));
 const artifacts=[{artifactId:'ok',uri:path.join(dir,'shared/report.txt')},{artifactId:'outside',uri:path.join(dir,'private.txt')},{artifactId:'escape',uri:path.join(dir,'shared/escape.txt')},{artifactId:'draft',uri:path.join(dir,'shared/report.txt')}];
 const h=createHost({dataDir:path.join(dir,'history'),containerUrl:'http://container',workArtifactRoots:[path.join(dir,'shared')],bindings:{'1:1':{voiceSessionId:'a',workSessionIds:['owned']}}},{fetcher:async()=>Response.json({code:0,data:{user:{id:1}}}),control:{close(){},async tool(name){return name==='bridge_chat_events'?{events:[]}:{status:'completed',result:{summary:'done',artifacts,artifactIds:['ok','outside','escape']}};}}});
 await new Promise(r=>h.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+h.server.address().port+'/mobile-host';
 const post=(p,b,token='valid')=>fetch(base+p,{method:'POST',headers:{Authorization:'Bearer '+token,'tenant-id':'1','Content-Type':'application/json'},body:JSON.stringify(b)});
 try{const t=await(await post('/ticket',{app:'chat'})).json(),s=await(await post('/bootstrap',{ticket:t.url.split('#')[1]})).json();
  for(const [workSessionId,artifactId]of [['other','ok'],['owned','draft'],['owned','outside'],['owned','escape']])assert.equal((await post('/work/file',{workSessionId,artifactId},s.token)).status,403);
  const r=await post('/work/file',{workSessionId:'owned',artifactId:'ok'},s.token);assert.equal(r.status,200);assert.equal(await r.text(),'完整报告');assert.match(r.headers.get('content-disposition'),/attachment/);
 }finally{await new Promise(r=>h.server.close(r));await rm(dir,{recursive:true,force:true});}
});
