import Ajv from 'ajv/dist/2020.js';
import actionSchema from '../operator/contracts/action.schema.json' with {type:'json'};
const text={type:'string',minLength:1,maxLength:256};
const ajv=new Ajv({strict:false});ajv.addSchema(actionSchema);
const schema={type:'object',additionalProperties:false,properties:{operation:{type:'string'},action:{$ref:actionSchema.$id},packageName:text,version:text,id:text,functionName:text,args:{type:'object'},condition:{type:'object'},timeoutMs:{type:'integer',minimum:0,maximum:30000}},required:['operation'],oneOf:[
 {properties:{operation:{const:'action'}},required:['action'],not:{anyOf:['packageName','version','id','functionName','args','condition','timeoutMs'].map(k=>({required:[k]}))}},
 {properties:{operation:{const:'apps'}},required:['packageName','version'],not:{anyOf:['action','id','functionName','args','condition','timeoutMs'].map(k=>({required:[k]}))}},
 {properties:{operation:{const:'invoke'}},required:['id','functionName','packageName','version','args'],not:{anyOf:['action','condition','timeoutMs'].map(k=>({required:[k]}))}},
 {properties:{operation:{const:'waitFor'}},required:['condition'],not:{anyOf:['action','packageName','version','id','functionName','args'].map(k=>({required:[k]}))}}
]};
const validate=ajv.compile(schema);
/** Entry for an already authenticated WS handler. Does not own sockets or routing metadata. */
export async function dispatchRuntimeCall(runtime,input,options={}){
 if(!validate(input))return {status:'failed',verified:false,error:{code:'INVALID_ARGUMENT'}};
 const call=JSON.parse(JSON.stringify(input));
 switch(call.operation){
  case 'action':return runtime.execute(call.action,options);
  case 'apps':return {status:'completed',verified:false,data:runtime.discoverApps(call.packageName,call.version)};
  case 'invoke':return runtime.invokeApp(call,options);
  case 'waitFor':return runtime.waitFor(call.condition,{...options,...(call.timeoutMs===undefined?{}:{timeoutMs:call.timeoutMs})});
 }
}
