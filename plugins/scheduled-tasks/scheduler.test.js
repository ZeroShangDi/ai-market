import test from 'node:test';
import assert from 'node:assert/strict';
import { retryBusy } from './scheduler.js';
test('retries only transient SQLite locks with a bounded budget',async()=>{
 let calls=0;const waits=[];
 assert.equal(await retryBusy(async()=>{if(++calls<3)throw Error('SQLITE_BUSY');return 'ok';},async ms=>waits.push(ms)),'ok');
 assert.deepEqual(waits,[100,200]);
 calls=0;await assert.rejects(retryBusy(async()=>{calls++;throw Error('database is locked');},async()=>{}));assert.equal(calls,5);
 calls=0;await assert.rejects(retryBusy(async()=>{calls++;throw Error('invalid task');},async()=>{}));assert.equal(calls,1);
});
