import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
// SQLite busy means the store operation did not commit; do not retry other errors.
export async function retryBusy(operation, wait=delay) {
  for(let attempt=0;;attempt++) {
    try {return await operation();}
    catch(error) {
      if(attempt>=4 || !/SQLITE_BUSY|database is locked/.test(String(error?.message)))throw error;
      await wait(100 * (attempt+1));
    }
  }
}
/** Managed subprocess only; tools are never exposed directly to model/user input. */
export async function schedulerClient(dataDir,command=process.env.MCP_CRON_COMMAND) {
  if(!command)return null;
  const dir=join(dataDir,'scheduler');await mkdir(dir,{recursive:true,mode:0o700});
  const client=new Client({name:'ai-market-scheduler-host',version:'1.0.0'});
  const transport=new StdioClientTransport({command,args:['--transport','stdio','--db-path',join(dir,'cron.db'),'--log-file',join(dir,'cron.log')],stderr:'ignore',env:{PATH:process.env.PATH || '',HOME:dir}});
  await client.connect(transport);
  const allowed=new Set(['list_tasks','add_http_task','update_task','remove_task']);
  const call=async(name,args)=>{
    if(!allowed.has(name))throw Error('Unsupported scheduler operation');
    const result=await retryBusy(()=>client.callTool({name,arguments:args}));
    if(result.isError)throw Error('Scheduler request failed');
    return JSON.parse(result.content.find(item=>item.type==='text').text);
  };
  return {call,close:()=>client.close()};
}
