import {randomUUID} from 'node:crypto';
/** Public Control WS protocol only. Credentials remain in this trusted process. */
export class Control {
  constructor({url,token}){this.url=url;this.token=token;this.pending=new Map();}
  async connect(){
    if(this.ws?.readyState===1&&this.ready)return;
    if(this.connecting)return this.connecting;
    this.connecting=new Promise((resolve,reject)=>{
      const ws=new WebSocket(this.url);this.ws=ws;this.ready=false;
      const timer=setTimeout(()=>{ws.close();reject(Error('CONTROL_UNAVAILABLE'));},5000);
      ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'hello',protocolVersion:1,client:{id:'assistant-mobile-host',version:'1'},token:this.token})));
      ws.addEventListener('message',({data})=>{let m;try{m=JSON.parse(data);}catch{return;}
        if(m.type==='hello.ack'){ws.send(JSON.stringify({type:'subscribe',topics:['control.*']}));return;}
        if(m.type==='subscribe.ack'){clearTimeout(timer);this.ready=true;resolve();return;}
        if(m.type==='error'){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CONTROL_PROTOCOL_ERROR'));}this.pending.clear();return;}
        if(m.type==='event'){const e=m.event,p=this.pending.get(e?.correlationId);if(p){clearTimeout(p.timer);this.pending.delete(e.correlationId);if(/failed$|error$/.test(e.topic))p.reject(Error('CONTROL_REQUEST_FAILED'));else p.resolve(e.payload);}}
      });
      const closed=()=>{clearTimeout(timer);this.ready=false;reject(Error('CONTROL_DISCONNECTED'));for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CONTROL_RESULT_UNKNOWN'));}this.pending.clear();};
      ws.addEventListener('error',closed);ws.addEventListener('close',closed);
    }).finally(()=>{this.connecting=null;});return this.connecting;
  }
  async call(topic,payload){await this.connect();const id=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CONTROL_RESULT_UNKNOWN'));},125000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({type:'event',event:{schemaVersion:1,eventId:randomUUID(),correlationId:id,topic,source:'assistant-mobile-host',createdAt:new Date().toISOString(),payload}}));});}
  async tool(tool,args){const r=await this.call('control.tool.call.requested',{profile:'voice-controller',threadId:args.sessionId,tool,arguments:args});let v=r.result;if(v?.isError)throw Error('CONTROL_REQUEST_FAILED');if(v?.structuredContent)return v.structuredContent;if(v?.content){const t=v.content.find(x=>x.type==='text')?.text;try{return JSON.parse(t);}catch{return {text:t||''};}}return v??r;}
  close(){this.ws?.close();}
}
