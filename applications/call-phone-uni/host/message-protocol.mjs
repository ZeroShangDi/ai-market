// OneBot 12 message-segment subset. Capability checks precede all side effects.
export function textFromSegments(message){
 if(!Array.isArray(message)||message.length<1||message.length>100)throw Error('INVALID_MESSAGE');
 let text='';for(const segment of message){if(segment?.type!=='text')throw Error('UNSUPPORTED_MESSAGE_TYPE');if(typeof segment.data?.text!=='string')throw Error('INVALID_MESSAGE');text+=segment.data.text;}
 if(!text.trim()||text.length>6000)throw Error('INVALID_MESSAGE');return text;
}
export function parseSendAction(value,agentId){
 if(value?.action!=='send_message')throw Error('UNSUPPORTED_ACTION');
 if(value.params?.detail_type!=='private'||value.params?.user_id!==agentId)throw Error('INVALID_RECIPIENT');
 return {text:textFromSegments(value.params.message),echo:value.echo};
}
export const actionSuccess=(data,echo)=>({status:'ok',retcode:0,data,message:'',...(echo===undefined?{}:{echo})});
export function actionFailure(code,echo){
 const codes={UNSUPPORTED_ACTION:10002,INVALID_RECIPIENT:10003,INVALID_MESSAGE:10006,UNSUPPORTED_MESSAGE_TYPE:10005,INVALID_ACTION:10001,BUSY:35001};
 const known=Object.hasOwn(codes,code);
 return {status:'failed',retcode:known?codes[code]:33001,data:null,message:known?code:'发送结果未确认，请补查消息，勿重复提交',...(typeof echo==='string'?{echo}:{}),...(!known?{'ai_market.unknown':true}:{})};
}
export function validateActionEnvelope(value){if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.action!=='string'||(value.echo!==undefined&&typeof value.echo!=='string'))throw Error('INVALID_ACTION');}
