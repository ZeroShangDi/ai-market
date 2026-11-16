import{test}from'node:test';import assert from'node:assert/strict';import{DeviceSession}from'../src/device-session.mjs';
const command=()=>({protocolVersion:1,requestId:'r',rootTaskId:'task',sessionId:'session',deviceId:'phone',deviceEpoch:'epoch',expiresAt:new Date(Date.now()+5000).toISOString(),action:{operation:'back',arguments:{}}});
test('schema, ownership, epoch and expiry checks precede execution',async()=>{
 let calls=0;const d=new DeviceSession({deviceId:'phone',epoch:'epoch',authorize:async p=>p==='owner',runtime:{execute:async()=>{calls++;return 'ok';}}});
 for(const [change,code]of [[{deviceId:'other'},'WRONG_DEVICE'],[{deviceEpoch:'old'},'STALE_DEVICE_EPOCH'],[{action:{operation:'shell',arguments:{}}},'INVALID_REQUEST'],[{expiresAt:'2000-01-01T00:00:00Z'},'EXPIRED']])await assert.rejects(d.execute('owner',{...command(),...change}),{code});
 await assert.rejects(d.execute('other',command()),{code:'FORBIDDEN'});assert.equal(calls,0);assert.equal(await d.execute('owner',command()),'ok');d.revoke();await assert.rejects(d.execute('owner',command()),{code:'STALE_DEVICE_EPOCH'});assert.equal(calls,1);
});
