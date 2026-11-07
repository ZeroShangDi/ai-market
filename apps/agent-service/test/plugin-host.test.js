import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPluginRuntime} from '../src/plugin-runtime.js';
test('host loads an unrelated inventory plugin without schedule/event semantics',async t=>{
 const root=await mkdtemp(join(tmpdir(),'generic-plugin-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'inventory'));
 await writeFile(join(root,'inventory','package.json'),'{"type":"module"}');
 await writeFile(join(root,'inventory','runtime.js'),`export async function activateRuntime(host) {
  return {handle:async(actor,op,input)=>({user:actor.user,op,item:input.item}),receive:async(id,secret,payload)=>({id,payload}),close:async()=>{}};
 }`);
 const runtime=await createPluginRuntime({root,dataDir:join(root,'data'),entries:[{id:'inventory',directory:'inventory'}]});
 assert.deepEqual(await runtime.handle({user:'7'},'inventory','stock',{item:'book'}),{user:'7',op:'stock',item:'book'});
 assert.deepEqual(await runtime.receive('inventory/abc/key',{count:3}),{id:'abc',payload:{count:3}});
 await assert.rejects(runtime.handle({user:'7'},'unknown','stock',{}),e=>e.status===404);
 await runtime.close();
});
