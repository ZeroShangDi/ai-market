import {test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm,readFile}from'node:fs/promises';import os from'node:os';import path from'node:path';import{ReceiptJournal}from'../src/receipts.mjs';
test('completed actions survive restart, conflicting retries fail and plaintext is absent',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'device-receipts-')),file=path.join(dir,'receipts.sqlite');let journal=new ReceiptJournal(file),calls=0;
 const request={requestId:'one',operation:'setText',arguments:{text:'private user text'}};
 try{const run=async()=>{calls++;return {status:'dispatched'};};await journal.execute(request,run);journal.close();journal=new ReceiptJournal(file);assert.equal((await journal.execute(request,run)).status,'dispatched');assert.equal(calls,1);await assert.rejects(journal.execute({...request,arguments:{text:'different'}},run),{code:'REQUEST_CONFLICT'});assert(!(await readFile(file)).includes(Buffer.from('private user text')));}finally{journal.close();await rm(dir,{recursive:true,force:true});}
});
test('in-flight duplicates return unknown instead of issuing another action',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'device-running-'));const j=new ReceiptJournal(path.join(dir,'r.sqlite'));let release;const gate=new Promise(r=>release=r),request={requestId:'r',operation:'click'};let calls=0;
 try{const first=j.execute(request,async()=>{calls++;await gate;return {status:'dispatched'};});assert.equal((await j.execute(request,async()=>{calls++;})).status,'unknown');release();await first;assert.equal(calls,1);}finally{j.close();await rm(dir,{recursive:true,force:true});}
});
