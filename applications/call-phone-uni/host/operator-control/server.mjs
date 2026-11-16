import {McpServer}from'@modelcontextprotocol/sdk/server/mcp.js';import{StdioServerTransport}from'@modelcontextprotocol/sdk/server/stdio.js';import{z}from'zod';import{readFile}from'node:fs/promises';import{pathToFileURL}from'node:url';
import{PortalTransport}from'./src/portal.mjs';import{StandardController}from'./src/controller.mjs';import{DeviceRuntime}from'./src/runtime.mjs';import{ReceiptJournal}from'./src/receipts.mjs';import{DeviceSession}from'./src/device-session.mjs';
const result=v=>({content:[{type:'text',text:JSON.stringify(v)}]});
export function createServer(devices,principal){
 const server=new McpServer({name:'ai-market-mobile-control',version:'0.1.0'});
 server.registerTool('mobile_devices',{description:'List configured devices. Configuration does not imply connectivity or enabled accessibility.',inputSchema:{},annotations:{readOnlyHint:true}},async()=>result([...devices.values()].map(d=>({id:d.deviceId,epoch:d.epoch,connection:'not_checked'}))));
 server.registerTool('mobile_execute',{description:'Execute a versioned device request. Observe first; dispatched is not verified business success. Never replay unknown actions.',inputSchema:{request:z.record(z.string(),z.unknown())},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},async({request})=>{
  const device=devices.get(request.deviceId);if(!device)return {isError:true,...result({error:'DEVICE_NOT_CONFIGURED'})};
  try{return result(await device.execute(principal,request));}catch(e){return {isError:true,...result({error:['INVALID_REQUEST','WRONG_DEVICE','STALE_DEVICE_EPOCH','EXPIRED','FORBIDDEN','CANCELLED','REQUEST_CONFLICT'].includes(e.code)?e.code:'DEVICE_EXECUTION_UNCONFIRMED'})};}
 });return server;
}
async function main(){
 const config=process.env.MOBILE_CONTROL_CONFIG?JSON.parse(await readFile(process.env.MOBILE_CONTROL_CONFIG,'utf8')):{devices:[]};const devices=new Map(),resources=[];
 const cleanup=async()=>{await Promise.allSettled(resources.map(async({runtime,journal})=>{try{await runtime.close();}finally{journal.close();}}));};
 try{
 for(const d of config.devices||[]){if(!config.principalId||devices.has(d.id)||!d.tokenFile||!d.journalFile)throw Error('Invalid private device configuration');const transport=new PortalTransport({url:d.url,token:(await readFile(d.tokenFile,'utf8')).trim()});const journal=new ReceiptJournal(d.journalFile),runtime=new DeviceRuntime(new StandardController(transport),{...d.pacing,journal});resources.push({runtime,journal});devices.set(d.id,new DeviceSession({deviceId:d.id,epoch:d.epoch,authorize:p=>p===config.principalId,runtime}));}
 const server=createServer(devices,config.principalId);server.server.onclose=()=>{void cleanup();};process.once('SIGTERM',()=>void server.close());process.once('SIGINT',()=>void server.close());await server.connect(new StdioServerTransport());
 }catch(e){await cleanup();throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
