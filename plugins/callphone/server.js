#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { activate } from './index.js';

// A managed deployment supplies credentials, actor and attachment inventory. Models cannot override them.
export async function createServer(ctx, config) {
  const server = new McpServer({name:'callphone',version:'0.1.0'});
  const sdk = {tool:(name,description,inputSchema,handler,options)=>({name,description,inputSchema,handler,...options})};
  const runtime = await activate({sdk,z,ctx,config});
  for(const {name,description,inputSchema,handler,annotations} of runtime.tools)
    server.registerTool(name,{description,inputSchema,annotations},async input=>{
      if(!annotations?.readOnlyHint) {
        if(!server.server.getClientCapabilities()?.elicitation) return {isError:true,content:[{type:'text',text:'客户端不支持用户确认表单，请通过工作台导入'}]};
        const fields=await runtime.approval(name,input);
        const reply=await server.server.elicitInput({mode:'form',message:JSON.stringify({operation:name,fields}),requestedSchema:{type:'object',properties:{approved:{type:'boolean',title:'确认导入',default:false}},required:['approved']}},{timeout:60000});
        if(reply.action!=='accept' || reply.content?.approved!==true) return {isError:true,content:[{type:'text',text:'用户未批准，未执行导入'}]};
      }
      return handler(input);
    });
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const env=process.env;
  if(!/^(0|[1-9][0-9]{0,18})$/.test(env.WORK_TENANT_ID || '') || !/^[1-9][0-9]{0,18}$/.test(env.WORK_USER_ID || '')) throw Error('Managed actor required');
  const cwd=await realpath(env.WORK_WORKSPACE);
  const resources=JSON.parse(await readFile(env.WORK_RESOURCES_FILE,'utf8'));
  if(!Array.isArray(resources)) throw Error('Attachment inventory required');
  const ctx={cwd,resources,identity:{tenant:env.WORK_TENANT_ID,user:env.WORK_USER_ID},signal:new AbortController().signal,emitResult:async()=>{}};
  await (await createServer(ctx,{})).connect(new StdioServerTransport());
}
