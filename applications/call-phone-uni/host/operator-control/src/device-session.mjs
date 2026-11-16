import {readFileSync} from 'node:fs';import Ajv from 'ajv/dist/2020.js';import addFormats from 'ajv-formats';
const ajv=new Ajv({strict:false});addFormats(ajv);ajv.addSchema(JSON.parse(readFileSync(new URL('../../../src/modules/mobile-control/operator/contracts/action.schema.json',import.meta.url),'utf8')));const validate=ajv.compile(JSON.parse(readFileSync(new URL('../contracts/request.schema.json',import.meta.url),'utf8')));
const fail=code=>Object.assign(new Error(code),{code});
export class DeviceSession {
 constructor({deviceId,epoch,authorize,runtime}){
  if(typeof deviceId!=='string'||!deviceId||typeof epoch!=='string'||!epoch||typeof authorize!=='function'||typeof runtime?.execute!=='function')throw fail('INVALID_SESSION');
  this.deviceId=deviceId;this.epoch=epoch;this.authorize=authorize;this.runtime=runtime;this.lifetime=new AbortController();
 }
 async execute(principal,input,{signal}={}){
  const request=structuredClone(input);
  if(!validate(request))throw fail('INVALID_REQUEST');
  if(request.deviceId!==this.deviceId)throw fail('WRONG_DEVICE');
  if(request.deviceEpoch!==this.epoch||this.lifetime.signal.aborted)throw fail('STALE_DEVICE_EPOCH');
  if(Date.parse(request.expiresAt)<=Date.now())throw fail('EXPIRED');
  if(!await this.authorize(principal,this.deviceId))throw fail('FORBIDDEN');
  const combined=signal?AbortSignal.any([signal,this.lifetime.signal]):this.lifetime.signal;
  if(combined.aborted)throw fail('CANCELLED');
  if(request.control==='capabilities')return {protocolVersion:1,operations:['observe','click','back','home','launchApp'],gesturePath:false};
  return this.runtime.execute({...request,...request.action},{signal:combined});
 }
 revoke(){this.lifetime.abort();}
}
