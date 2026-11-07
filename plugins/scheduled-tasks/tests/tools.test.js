import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeTools} from '../lib/tools.js';
import {z} from '../../../apps/agent-service/node_modules/zod/index.js';
test('confirmed rule mutations emit durable cards; failures emit no success card',async t=>{
 const original=globalThis.fetch; t.after(()=>globalThis.fetch=original);
 const cards=[],requests=[];
 globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify({data:{id:'test-rule',title:'早报',schedule_label:'每天 09:00',enabled:true}}));};
 const runtime=await runtimeTools('scheduled_tasks').activate({sdk:{tool:(name,_desc,_schema,run)=>({name,run})},z,ctx:{identity:{tenant:'1',user:'2'},conversationId:'17',emitResult:async card=>cards.push(card)}});
 const manage=runtime.tools.find(t=>t.name==='manage_rule');
 await manage.run({operation:'create',title:'早报'});
 assert.equal(requests[0].conversation_id,'17');assert.equal(cards[0].resource.subtitle,'每天 09:00');
 globalThis.fetch=async()=>new Response('{}',{status:503});
 await assert.rejects(manage.run({operation:'create'}));assert.equal(cards.length,1);
});
