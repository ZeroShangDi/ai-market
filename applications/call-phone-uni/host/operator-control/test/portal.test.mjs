import {test}from'node:test';import assert from'node:assert/strict';import{PortalTransport}from'../src/portal.mjs';
test('portal adapter uses authenticated documented API and never claims verified success',async()=>{
 const calls=[];const p=new PortalTransport({url:'http://127.0.0.1:8080/',token:'private',fetcher:async(u,o)=>{calls.push({u:String(u),o});return Response.json({status:'success',result:{tree:[]}});}});
 await p.observe();const r=await p.dispatch('swipe',{startX:1,startY:2,endX:3,endY:4,duration:300});assert.equal(r.verified,false);assert.equal(r.status,'dispatched');assert.equal(calls[1].u,'http://127.0.0.1:8080/swipe');assert.equal(calls[1].o.headers.Authorization,'Bearer private');assert.equal(calls[1].o.redirect,'error');
 await assert.rejects(p.dispatch('shell'),{code:'UNSUPPORTED'});await assert.rejects(p.dispatch('tap',{x:-1,y:3}),{code:'INVALID_ARGUMENT'});assert.equal(calls.length,2);
});
test('device URLs and unsuccessful envelopes fail closed without replay',async()=>{
 assert.throws(()=>new PortalTransport({url:'http://public.example/',token:'secret'}));let calls=0;
 const p=new PortalTransport({url:'https://device.example/',token:'private',fetcher:async()=>{calls++;return Response.json({status:'error'});}});await assert.rejects(p.dispatch('back'),{code:'DEVICE_REJECTED'});assert.equal(calls,1);
});
