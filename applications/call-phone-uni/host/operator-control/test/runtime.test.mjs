import {test} from 'node:test';import assert from 'node:assert/strict';import {DeviceRuntime} from '../src/runtime.mjs';
const command=()=>({operation:'click',expiresAt:new Date(Date.now()+5000).toISOString(),arguments:{nodeRef:'one'}});
test('device work is serial, captured before queueing and cancellation never reaches adapter',async()=>{
 let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r),seen=[];
 const runtime=new DeviceRuntime({async execute(r){seen.push(r.arguments.nodeRef);if(seen.length===1){started();await gate;}return 'ok';}},{minIntervalMs:5});
 try{const first=runtime.execute(command());await entered;const next=command(),abort=new AbortController();const cancelled=runtime.execute(next,{signal:abort.signal});const rejected=assert.rejects(cancelled,{code:'CANCELLED'});next.arguments.nodeRef='mutated';abort.abort();release();await first;await rejected;assert.deepEqual(seen,['one']);}finally{await runtime.close();}
});
test('expired or unsupported commands cannot reach device and failures do not trigger retries',async()=>{
 let calls=0;const runtime=new DeviceRuntime({async execute(){calls++;throw Error('device failed');}},{minIntervalMs:1});
 try{await assert.rejects(runtime.execute({...command(),expiresAt:'2000-01-01T00:00:00Z'}),{code:'EXPIRED'});await assert.rejects(runtime.execute({...command(),operation:'shell'}),{code:'INVALID_REQUEST'});await assert.rejects(runtime.execute(command()));assert.equal(calls,1);}finally{await runtime.close();}
});
