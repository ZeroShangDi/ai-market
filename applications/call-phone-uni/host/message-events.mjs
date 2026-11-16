import {createHash,randomUUID}from'node:crypto';
/** Append final message deliveries to the same atomic history record. */
export function reconcileMessageEvents(history,agentId){
 history.messageEvents??=[];history.messageDigests??={};history.eventCursor??=0;
 for(const m of history.messages){
  if(m.role==='user'&&m.status&&m.status!=='sent')continue;
  if(!m.id)m.id=randomUUID();
  const segments=[...(m.text?[{type:'text',data:{text:m.text}}]:[]),...(m.files||[]).map(f=>({type:'file',data:{file_id:f.id,'ai_market.title':f.title,'ai_market.work_session_id':m.workSessionId}}))];
  if(!segments.length)continue;
  const digest=createHash('sha256').update(JSON.stringify(segments)).digest('hex');
  if(history.messageDigests[m.id]===digest)continue;
  const updated=!!history.messageDigests[m.id];history.messageDigests[m.id]=digest;const cursor=++history.eventCursor;
  history.messageEvents.push({cursor:String(cursor),id:randomUUID(),time:Date.now()/1000,type:updated?'notice':'message',detail_type:updated?'ai_market.message_updated':'private',sub_type:'',self:{platform:'ai_market',user_id:agentId},message_id:m.id,user_id:agentId,message:segments,alt_message:m.text||'文件','ai_market.direction':m.role==='user'?'outgoing':'incoming'});
 }
 history.messageEvents=history.messageEvents.slice(-5000);
}
export function readMessageEvents(history,after='0',limit=100){
 if(!/^(0|[1-9][0-9]*)$/.test(after)||!Number.isSafeInteger(Number(after))||!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_CURSOR');
 const events=history.messageEvents||[],first=Number(events[0]?.cursor||0);
 if(first&&Number(after)<first-1)throw Error('CURSOR_EXPIRED');
 const items=events.filter(e=>Number(e.cursor)>Number(after)).slice(0,limit);
 return {events:items,nextCursor:items.at(-1)?.cursor||after};
}
