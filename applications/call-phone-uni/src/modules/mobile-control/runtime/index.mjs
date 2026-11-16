import Bottleneck from 'bottleneck/light.js';
import {linkedSignal} from './signals.mjs';
import {actionCopy,error} from '../operator/actions.mjs';
import {swipePath} from './gestures.mjs';
export {AppFunctions} from '../adapters/index.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(error('CANCELLED'));
 const done=()=>{signal?.removeEventListener('abort',abort);resolve();};
 const timer=setTimeout(done,ms),abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(error('CANCELLED'));};
 signal?.addEventListener('abort',abort,{once:true});
});
const failure=code=>({status:'failed',verified:false,error:{code}});
/** Phone-local runtime. No sockets, device identity, task planner or remote source evaluation. */
export class Runtime {
 constructor(operator,{minIntervalMs=600,maxPerMinute=40,queueLimit=100,functions}={}){
  if(!operator?.execute||!Number.isInteger(minIntervalMs)||minIntervalMs<0||!Number.isInteger(maxPerMinute)||maxPerMinute<1||!Number.isInteger(queueLimit)||queueLimit<1)throw error('INVALID_POLICY');
  this.operator=operator;this.functions=functions;this.closed=false;this.paused=false;this.history=[];this.rules=new Map();this.lifetime=new AbortController();
  this.queue=new Bottleneck({maxConcurrent:1,minTime:minIntervalMs,reservoir:maxPerMinute,reservoirRefreshAmount:maxPerMinute,reservoirRefreshInterval:60000,highWater:queueLimit,strategy:Bottleneck.strategy.OVERFLOW});
  this.queue.on('error',()=>{});
 }
 async execute(input,{signal,expectedPackage,expectedVersion}={}){
  let action;
  try{action=actionCopy(input);}catch{return failure('INVALID_ARGUMENT');}
  if(this.closed)return failure('RUNTIME_CLOSED');
  const linked=linkedSignal(signal,this.lifetime.signal),combined=linked.signal;
  let started=false,onAbort;
  const aborted=new Promise(resolve=>{onAbort=()=>{if(combined.aborted&&!started)resolve(failure('CANCELLED'));};combined.addEventListener('abort',onAbort,{once:true});onAbort();});
  try{return await Promise.race([aborted,this.queue.schedule(async()=>{
   started=true;
   if(combined.aborted)return failure('CANCELLED');
   if(this.paused)return failure('PAUSED');
   if(expectedPackage){
    const observed=await this.operator.execute({operation:'observe',arguments:{}},{signal:combined});
    if(observed.status!=='completed')return observed;
    if(observed.data.foregroundPackage!==expectedPackage)return failure('WRONG_APPLICATION');
    if(expectedVersion&&observed.data.appVersion!==expectedVersion)return failure('APP_FUNCTION_UNAVAILABLE');
   }
   const result=await this.operator.execute(action,{signal:combined,gesture:({snapshot,resolved,action:a})=>{
    if(!['swipe','drag'].includes(a.operation))return undefined;
    return swipePath({from:resolved.from.point,to:resolved.to.point,width:snapshot.display.width,height:snapshot.display.height,durationMs:a.arguments.durationMs??600});
   }});
   this.record(action,result);
   return result;
  })]);}catch{return failure(combined.aborted?'CANCELLED':'QUEUE_REJECTED');}finally{combined.removeEventListener('abort',onAbort);linked.dispose();}
 }
 async waitFor(condition,{timeoutMs=10000,pollMs=400,signal,expectedPackage}={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<0||timeoutMs>30000||!Number.isInteger(pollMs)||pollMs<100||pollMs>5000||!condition||!['package','visible','absent','stable'].includes(condition.type))return failure('INVALID_ARGUMENT');
  if(condition.type==='package'&&(typeof condition.packageName!=='string'||!condition.packageName)||['visible','absent'].includes(condition.type)&&(!condition.match||!Object.keys(condition.match).length||Object.entries(condition.match).some(([k,v])=>!['resourceId','text','description','role'].includes(k)||typeof v!=='string'||!v)))return failure('INVALID_ARGUMENT');
  const timeout=new AbortController(),linked=linkedSignal(signal,this.lifetime.signal,timeout.signal),combined=linked.signal;
  const timer=timeoutMs>0?setTimeout(()=>timeout.abort(),timeoutMs):undefined;
  const end=Date.now()+timeoutMs;let previous,stableSince=0;
  try{
  do{
   const result=await this.execute({operation:'observe',arguments:{}},{signal:combined,expectedPackage});
   if(result.status!=='completed')return timeout.signal.aborted?failure('WAIT_TIMEOUT'):result;
   const state=result.data,matching=state.nodes.filter(n=>condition.match&&Object.entries(condition.match).every(([k,v])=>n[k]===v));
   if(matching.length>1)return failure('TARGET_AMBIGUOUS');
   if(condition.type==='package'&&state.foregroundPackage===condition.packageName||condition.type==='visible'&&matching.length===1&&matching[0].visible&&matching[0].enabled||condition.type==='absent'&&matching.length===0)return {status:'completed',verified:false,data:state};
   if(condition.type==='stable'){
    if(previous!==state.snapshotId){previous=state.snapshotId;stableSince=Date.now();}
    else if(Date.now()-stableSince>=600)return {status:'completed',verified:false,data:state};
   }
   if(Date.now()>=end)break;
   try{await sleep(Math.min(pollMs,end-Date.now()),combined);}catch{return failure(timeout.signal.aborted?'WAIT_TIMEOUT':'CANCELLED');}
  }while(Date.now()<=end);
  return failure('WAIT_TIMEOUT');
  }finally{clearTimeout(timer);linked.dispose();}
 }
 discoverApps(packageName,version){return this.functions?.discover(packageName,version)||[];}
 async invokeApp(input,options={}){
  if(!this.functions)return failure('APP_FUNCTION_UNAVAILABLE');
  try{return await this.functions.invoke(copy(input),this,options);}catch(e){return failure(['APP_FUNCTION_UNAVAILABLE','INVALID_ARGUMENT'].includes(e.code)?e.code:'APP_FUNCTION_FAILED');}
 }
 record(action,result){
  this.history.push({operation:action.operation,status:result?.status||'unknown',at:Date.now()});
  if(this.history.length>100)this.history.shift();
 }
 setAppRule(packageName,rule){
  if(typeof packageName!=='string'||!packageName||!['normal','confirm','deny'].includes(rule))return failure('INVALID_ARGUMENT');
  this.rules.set(packageName,rule);return {status:'completed',verified:false};
 }
 appRule(packageName){return this.rules.get(packageName)||'normal';}
 summaries(){return this.history.map(item=>({...item}));}
 pause(){if(this.closed)return failure('RUNTIME_CLOSED');this.paused=true;return {status:'paused',verified:false};}
 resume(){if(this.closed)return failure('RUNTIME_CLOSED');this.paused=false;return {status:'resumed',verified:false};}
 stop(){if(this.closed)return {status:'stopped',verified:false};this.closed=true;this.lifetime.abort();return {status:'stopped',verified:false};}
 async close(){this.closed=true;this.lifetime.abort();await this.queue.stop({dropWaitingJobs:true});await this.queue.disconnect();}
}
