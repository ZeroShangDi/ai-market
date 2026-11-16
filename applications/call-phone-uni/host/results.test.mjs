import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finalDelivery,mergeDeliveries,singleFlight} from './results.mjs';
test('only final summaries are delivered; execution traces are never substituted',()=>{
 assert.equal(finalDelivery('w',{status:'running',result:{summary:'partial'}}),null);
 assert.equal(finalDelivery('w',{status:'completed',messages:[{text:'trace'}]}),null);
 assert.equal(finalDelivery('w',{work:{status:'completed',result:{summary:'done'}}}).text,'done');
});
test('repeat sync and corrected summary preserve one message and its arrival time',()=>{
 const h={messages:[]},d=finalDelivery('w',{status:'completed',result:{summary:'done'}});
 assert.equal(mergeDeliveries(h,[d],10),true);
 assert.equal(mergeDeliveries(h,[d],20),false);
 assert.equal(mergeDeliveries(h,[{...d,text:'corrected'}],30),true);
 assert.equal(h.messages.length,1);assert.equal(h.messages[0].at,10);assert.equal(h.messages[0].text,'corrected');
});
test('only explicitly delivered artifacts enter chat and local URIs stay on host',()=>{
 const value={status:'completed',result:{summary:'done',artifactIds:['final'],artifacts:[{artifactId:'draft',uri:'/private/draft'},{artifactId:'final',title:'报告.pdf',uri:'/private/report.pdf'}]}};
 const d=finalDelivery('w',value);assert.deepEqual(d.files,[{id:'final',title:'报告.pdf'}]);assert.equal(JSON.stringify(d).includes('/private'),false);
});

test('overlapping reads coalesce per owner and failures release the slot',async()=>{
 const run=singleFlight();let release,calls=0;const gate=new Promise(r=>release=r);
 const read=async()=>{calls++;await gate;return 'done';};
 const a=run('a',read),b=run('a',read);assert.equal(a,b);
 const other=run('b',async()=> 'other');assert.equal(await other,'other');
 release();assert.equal(await a,'done');assert.equal(calls,1);
 await assert.rejects(run('a',async()=>{throw Error('offline');}));
 assert.equal(await run('a',async()=> 'recovered'),'recovered');
});
