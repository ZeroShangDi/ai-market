import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import {DeviceSession} from '../src/device-session.mjs';
import {DeviceRuntime} from '../src/runtime.mjs';
test('pure action rejects envelope fields and controller receives only action',async()=>{
 const validate=new Ajv({strict:false}).compile(JSON.parse(readFileSync(new URL('../../../src/modules/mobile-control/operator/contracts/action.schema.json',import.meta.url),'utf8')));
 const action={operation:'back',arguments:{}};
 assert.equal(validate(action),true);
 for(const key of ['deviceId','deviceEpoch','sessionId','rootTaskId','requestId','expiresAt','protocolVersion'])assert.equal(validate({...action,[key]:'metadata'}),false);
 let received;
 const runtime=new DeviceRuntime({execute:async a=>{received=a;return {status:'dispatched'};}},{minIntervalMs:0});
 try{
 const session=new DeviceSession({deviceId:'phone',epoch:'one',authorize:()=>true,runtime});
 await session.execute('owner',{protocolVersion:1,requestId:'r',rootTaskId:'t',sessionId:'s',deviceId:'phone',deviceEpoch:'one',expiresAt:new Date(Date.now()+5000).toISOString(),action});
 assert.deepEqual(received,action);
 }finally{await runtime.close();}
});
