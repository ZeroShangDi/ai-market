/** Public contact metadata; runtime session IDs never leave the trusted host. */
export function contactsFor(binding) {
 if(!binding)return [];
 const entries=binding.agents??(binding.voiceSessionId?[{id:'assistant',name:'我的助手',voiceSessionId:binding.voiceSessionId,localVoiceSessionId:binding.localVoiceSessionId}]:[]);
 if(!Array.isArray(entries))throw Error('INVALID_AGENT_REGISTRY');
 const seen=new Set();
 return entries.map(agent=>{
  if(!/^[a-z][a-z0-9_-]{0,63}$/.test(agent.id)||seen.has(agent.id)||typeof agent.name!=='string'||!agent.name.trim()||agent.name.length>80||typeof agent.voiceSessionId!=='string'||!agent.voiceSessionId)throw Error('INVALID_AGENT_REGISTRY');
  seen.add(agent.id);
  return {id:agent.id,name:agent.name,capabilities:{send:['text'],receive:['text','file'],voiceCall:!!agent.localVoiceSessionId}};
 });
}
export function agentBinding(binding,id) {
 const contacts=contactsFor(binding),contact=contacts.find(a=>a.id===id);
 if(!contact)return null;
 if(!binding.agents)return {...binding,agentId:contact.id};
 const agent=binding.agents.find(a=>a.id===id);
 return {...binding,...agent,localVoiceSessionId:agent.localVoiceSessionId??null,workSessionIds:agent.workSessionIds??[],agentId:contact.id};
}
export function validateContactOwnership(bindings={}) {
 const sessions=new Map(),works=new Map();
 const claim=(map,id,owner)=>{if(map.has(id)&&map.get(id)!==owner)throw Error('AGENT_OWNERSHIP_CONFLICT');map.set(id,owner);};
 for(const [owner,binding] of Object.entries(bindings)){
  contactsFor(binding);
  if(binding.voiceSessionId)claim(sessions,binding.voiceSessionId,owner);
  for(const id of binding.workSessionIds||[])claim(works,id,owner);
  const localSessions=new Set(),localWorks=new Set();
  for(const agent of binding.agents||[]){
   if(localSessions.has(agent.voiceSessionId))throw Error('DUPLICATE_AGENT_SESSION');localSessions.add(agent.voiceSessionId);
   claim(sessions,agent.voiceSessionId,owner);
   for(const id of agent.workSessionIds||[]){if(localWorks.has(id))throw Error('DUPLICATE_AGENT_WORK');localWorks.add(id);claim(works,id,owner);}
  }
 }
}
