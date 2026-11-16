import{test}from'node:test';import assert from'node:assert/strict';import{reconcileMessageEvents,readMessageEvents}from'./message-events.mjs';
test('durable message events deduplicate, carry file IDs and expose corrections after a cursor',()=>{
 const h={messages:[{id:'u',role:'user',text:'task',status:'unknown'},{id:'a',role:'assistant',text:'done',files:[{id:'f',title:'report'}],workSessionId:'w'}]};
 reconcileMessageEvents(h,'coder');assert.equal(h.messageEvents.length,1);assert.equal(h.messageEvents[0].message[1].data.file_id,'f');reconcileMessageEvents(h,'coder');assert.equal(h.messageEvents.length,1);
 h.messages[1].text='corrected';reconcileMessageEvents(h,'coder');const next=readMessageEvents(h,'1');assert.equal(next.events.length,1);assert.equal(next.events[0].detail_type,'ai_market.message_updated');assert.equal(next.nextCursor,'2');assert.throws(()=>readMessageEvents(h,'../x'));
 const restored=JSON.parse(JSON.stringify(h));reconcileMessageEvents(restored,'coder');assert.equal(restored.messageEvents.length,2);
});
