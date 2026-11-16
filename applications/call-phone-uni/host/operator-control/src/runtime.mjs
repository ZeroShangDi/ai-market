import Bottleneck from 'bottleneck';
const actions=new Set(['observe','click','longClick','setText','scroll','back','home','launchApp','wait']);
const failure=code=>Object.assign(new Error(code),{code});
/** One runtime per authorized device. Transport owns authentication and native completion. */
export class DeviceRuntime {
 constructor(adapter,{minIntervalMs=600,maxPerMinute=40,queueLimit=100,journal}={}){
  if(typeof adapter?.execute!=='function')throw failure('INVALID_ADAPTER');
  if(!Number.isInteger(minIntervalMs)||minIntervalMs<0||!Number.isInteger(maxPerMinute)||maxPerMinute<1||!Number.isInteger(queueLimit)||queueLimit<1)throw failure('INVALID_POLICY');
  this.adapter=adapter;this.journal=journal;this.closed=false;
  this.queue=new Bottleneck({maxConcurrent:1,minTime:minIntervalMs,reservoir:maxPerMinute,reservoirRefreshAmount:maxPerMinute,reservoirRefreshInterval:60000,highWater:queueLimit,strategy:Bottleneck.strategy.OVERFLOW});
  this.queue.on('error',()=>{});
 }
 execute(request,{signal}={}){
  if(this.closed)return Promise.reject(failure('RUNTIME_CLOSED'));
  if(!actions.has(request?.operation)||!Number.isFinite(Date.parse(request?.expiresAt)))return Promise.reject(failure('INVALID_REQUEST'));
  // Capture before queueing so callers cannot change an already scheduled action.
  const command=structuredClone(request);
  return this.queue.schedule(async()=>{
   if(signal?.aborted)throw failure('CANCELLED');
   if(Date.now()>=Date.parse(command.expiresAt))throw failure('EXPIRED');
   const run=()=>this.adapter.execute({operation:command.operation,arguments:command.arguments},{signal});
   return this.journal?this.journal.execute(command,run):run();
  });
 }
 async close(){this.closed=true;await this.queue.stop({dropWaitingJobs:true});await this.queue.disconnect();}
}
