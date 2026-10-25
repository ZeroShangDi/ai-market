import { schedulerClient } from './scheduler.js';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { Store, owner, string, fail } from './lib/store.js';
export async function activateRuntime(host) {
  const scheduler = host.cron ? null : await schedulerClient(host.dataDir);
  host = {...host, cron:host.cron || scheduler?.call};
  const store = new Store(host.dataDir); await store.init();
  let busy=false, closed=false;
  const view = ({secret,actor,owner,...r}) => r;
  function validate(input) {
    string(input.title,80); string(input.url,2000); host.validateTarget(input.url);
    if (input.run_at) { if (!/(Z|[+-]\d{2}:\d{2})$/.test(input.run_at) || !Number.isFinite(Date.parse(input.run_at))) fail(400,'执行时间无效'); }
    else {
      string(input.cron,100);
      if (input.cron.trim().split(/\s+/).length !== 5 || !/^[\d*,/\-\s]+$/.test(input.cron)) fail(400,'请使用五段 cron 表达式');
    }
    try { new Intl.DateTimeFormat('en',{timeZone:input.timezone || 'Asia/Shanghai'}); } catch { fail(400,'时区无效'); }
    if (Buffer.byteLength(JSON.stringify(input.payload ?? {}))>6000) fail(413,'参数过大');
  }
  async function reconcileNow() {
    if (!host.cron) return;
    const tasks = await host.cron('list_tasks',{});
    for (const r of store.state.rules) {
      const name=`ai-market:${r.id}`;
      const existing=tasks.find(t=>t.name===name);
      if (r.deleted) { if(existing) await host.cron('remove_task',{id:existing.id}); continue; }
      const config={name, schedule:r.run_at?'* * * * *':`CRON_TZ=${r.timezone} ${r.cron}`, enabled:r.enabled,
        url:`${host.callbackBase}/scheduled_tasks/${r.id}/${r.secret}`,method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
      if(existing) {
        if(Object.entries(config).some(([key,value])=>JSON.stringify(existing[key])!==JSON.stringify(value))) await host.cron('update_task',{id:existing.id,...config});
      }
      else await host.cron('add_http_task',config);
    }
  }
  let syncTail=Promise.resolve();
  function reconcile() { const next=syncTail.then(reconcileNow);syncTail=next.catch(()=>{});return next; }
  async function handle(actor,op,input={}) {
    if(op==='list') return {items:store.state.rules.filter(r=>r.owner===owner(actor)&&!r.deleted).map(view), available:!!host.cron};
    if(op==='runs') {store.rule(actor,input.id);return {items:store.state.runs.filter(r=>r.rule_id===input.id).slice(-100).reverse().map(({url,payload,...r})=>r)};}
    if (!host.cron) fail(503,'定时进程尚未配置');
    const result=await store.transaction(state=>{
      if(op==='create') {
        const id=host.uuid(input.request_id), old=state.rules.find(r=>r.id===id&&r.owner===owner(actor)); if(old) return view(old);
        validate(input); const now=new Date().toISOString();
        const r={id,owner:owner(actor),actor,title:input.title,url:input.url,payload:input.payload??{},cron:input.run_at?null:input.cron,run_at:input.run_at||null,timezone:input.timezone||'Asia/Shanghai',enabled:true,secret:randomBytes(32).toString('hex'),created_at:now,updated_at:now};
        state.rules.push(r);return view(r);
      }
      const r=store.rule(actor,input.id,state);
      if(op==='update') {
        const next={...r,...Object.fromEntries(['title','url','payload','cron','run_at','timezone'].filter(k=>k in input).map(k=>[k,input[k]]))};
        validate(next);Object.assign(r,next);
      } else if(op==='pause'||op==='resume') r.enabled=op==='resume';
      else if(op==='delete') {r.deleted=true;r.enabled=false;}
      else fail(400,'操作不支持');
      r.updated_at=new Date().toISOString();return view(r);
    });
    // Durable desired state remains inspectable if the separate scheduler is unavailable.
    try {await reconcile();return {...result,synced:true};} catch {return {...result,synced:false,error:'配置已保存，调度同步待重试'};}
  }
  async function receive(id,secret) {
    return store.transaction(async state=>{
      const r=state.rules.find(r=>r.id===id&&!r.deleted);
      if(!r||typeof secret!=='string'||secret.length!==r.secret.length||!timingSafeEqual(Buffer.from(secret),Buffer.from(r.secret))) fail(404,'规则不存在');
      if(host.enabled && !await host.enabled(r.actor))return {accepted:false,reason:'disabled'};
      if(!r.enabled) return {accepted:false,reason:'paused'};
      if(r.run_at&&Date.now()<Date.parse(r.run_at)) return {accepted:false,reason:'not_due'};
      const slot=r.run_at||String(Math.floor(Date.now()/60000));
      const old=state.runs.find(run=>run.rule_id===id&&run.slot===slot);if(old)return {accepted:true,run_id:old.id};
      const run={id:randomUUID(),rule_id:id,slot,url:r.url,payload:r.payload,status:'queued',attempts:0,created_at:new Date().toISOString()};
      state.runs.push(run);if(r.run_at)r.enabled=false;return {accepted:true,run_id:run.id};
    });
  }
  async function drain() {
    if(busy||closed)return;busy=true;
    try {
      for(const run of store.state.runs.filter(r=>r.status==='queued'&&(!r.retry_at||r.retry_at<=Date.now()))) {
        if(closed)break;
        const rule=store.state.rules.find(r=>r.id===run.rule_id);
        if(rule?.deleted || host.enabled && !await host.enabled(rule.actor))continue;
        try {
          await host.deliver(run.url,run.payload,run.id,'schedule');
          await store.transaction(s=>Object.assign(s.runs.find(r=>r.id===run.id),{status:'delivered'}));
        } catch {
          await store.transaction(s=>{const r=s.runs.find(r=>r.id===run.id);r.attempts++;r.status=r.attempts>=5?'failed':'queued';r.retry_at=Date.now()+2000*2**r.attempts;});
        }
      }
    } finally {busy=false;}
  }
  const timer=setInterval(()=>void drain().catch(()=>{}),2000);timer.unref();
  let syncing=false;
  const sync=async()=>{if(syncing||closed)return;syncing=true;try{await reconcile();}catch{}finally{syncing=false;}};
  const refresh=setInterval(()=>void sync(),60000);refresh.unref();
  void sync();
  return {handle,receive,drain,reconcile,close:async()=>{closed=true;clearInterval(timer);clearInterval(refresh);await store.tail;await scheduler?.close();}};
}
