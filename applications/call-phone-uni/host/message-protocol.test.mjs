import {test}from'node:test';import assert from'node:assert/strict';import{textFromSegments,parseSendAction,actionSuccess,actionFailure,validateActionEnvelope}from'./message-protocol.mjs';
test('structured text preserves segment order and rejects unimplemented media before sending',()=>{
 assert.equal(textFromSegments([{type:'text',data:{text:'a'}},{type:'text',data:{text:'b'}}]),'ab');assert.throws(()=>textFromSegments([{type:'image',data:{file_id:'x'}}]),/UNSUPPORTED_MESSAGE_TYPE/);assert.throws(()=>textFromSegments([{type:'text',data:{text:' '.repeat(6001)}}]));
});
test('private actions bind the selected contact and echo is correlation only',()=>{
 const request={action:'send_message',echo:'e',params:{detail_type:'private',user_id:'coder',message:[{type:'text',data:{text:'task'}}]}};assert.equal(parseSendAction(request,'coder').text,'task');assert.throws(()=>parseSendAction(request,'other'),/INVALID_RECIPIENT/);assert.equal(actionSuccess({message_id:'m'},'e').echo,'e');
});

test('standard action errors preserve echo and distinguish unknown execution',()=>{assert.equal(actionFailure('UNSUPPORTED_MESSAGE_TYPE','e').retcode,10005);assert.equal(actionFailure('UNSUPPORTED_ACTION','e').echo,'e');assert.equal(actionFailure('timeout').retcode,33001);assert.equal(actionFailure('timeout')['ai_market.unknown'],true);assert.throws(()=>validateActionEnvelope({action:'send_message',echo:{}}));});
