import {test} from 'node:test';import assert from 'node:assert/strict';
import {contactsFor,agentBinding,validateContactOwnership} from './contacts.mjs';
test('contacts expose capabilities without runtime credentials and resolve only owned agents',()=>{
 const binding={agents:[{id:'coder',name:'开发同事',voiceSessionId:'private-session',workSessionIds:['w']},{id:'analyst',name:'分析同事',voiceSessionId:'other'}]};
 assert.equal(contactsFor(binding).length,2);assert(!JSON.stringify(contactsFor(binding)).includes('private-session'));
 assert.equal(agentBinding(binding,'coder').voiceSessionId,'private-session');assert.equal(agentBinding(binding,'outsider'),null);assert.equal(agentBinding(binding,'analyst').workSessionIds.length,0);
});
test('existing assistant is retained, and duplicate or unsafe contact identifiers fail closed',()=>{
 assert.equal(contactsFor({voiceSessionId:'s'})[0].id,'assistant');assert.deepEqual(contactsFor(null),[]);
 assert.throws(()=>contactsFor({agents:[{id:'../bad',name:'bad',voiceSessionId:'s'}]}));
 assert.throws(()=>contactsFor({agents:[{id:'a',name:'a',voiceSessionId:'s'},{id:'a',name:'a',voiceSessionId:'t'}]}));
});

test('cross-user and cross-agent session or work conflicts fail at startup',()=>{
 const agent=(id,s,w=[])=>({id,name:id,voiceSessionId:s,workSessionIds:w});
 assert.throws(()=>validateContactOwnership({'1:1':{voiceSessionId:'a',agents:[agent('coder','shared')]},'1:2':{voiceSessionId:'shared'}}));
 assert.throws(()=>validateContactOwnership({'1:1':{agents:[agent('a','x',['w']),agent('b','y',['w'])]}}));
 assert.throws(()=>validateContactOwnership({'1:1':{agents:[agent('a','x'),agent('b','x')]}}));
 assert.doesNotThrow(()=>validateContactOwnership({'1:1':{voiceSessionId:'x',agents:[agent('a','x',['w'])]}}));
});
