import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';import {mkdirSync,chmodSync} from 'node:fs';import path from 'node:path';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const fail=code=>Object.assign(new Error(code),{code});
const safeErrors=new Set(['EXPIRED','CANCELLED','STALE_SNAPSHOT','TARGET_NOT_FOUND','TARGET_NOT_ACTIONABLE','UNSUPPORTED','INVALID_ARGUMENT','INVALID_REQUEST']);
/** Durable side-effect journal. Stores identifiers, digests and minimal receipts, never input text. */
export class ReceiptJournal {
 constructor(file){mkdirSync(path.dirname(file),{recursive:true,mode:0o700});this.db=new DatabaseSync(file);chmodSync(file,0o600);this.db.exec('CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT)');}
 async execute(request,run){
  if(request.operation==='observe')return run();
  if(typeof request.requestId!=='string'||!request.requestId||request.requestId.length>128)throw fail('INVALID_REQUEST');
  const digest=createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex');
  const previous=this.db.prepare('SELECT digest,result FROM receipts WHERE id=?').get(request.requestId);
  if(previous){if(previous.digest!==digest)throw fail('REQUEST_CONFLICT');return previous.result?JSON.parse(previous.result):{status:'unknown',error:{code:'RESULT_UNKNOWN'}};}
  this.db.prepare('INSERT INTO receipts(id,digest,result) VALUES(?,?,NULL)').run(request.requestId,digest);
  let result;
  try{const raw=await run();result={status:raw?.status==='dispatched'?'dispatched':'unknown',verified:false};}
  catch(e){result={status:safeErrors.has(e.code)?'failed':'unknown',error:{code:safeErrors.has(e.code)?e.code:'RESULT_UNKNOWN'}};}
  this.db.prepare('UPDATE receipts SET result=? WHERE id=?').run(JSON.stringify(result),request.requestId);return result;
 }
 close(){this.db.close();}
}
