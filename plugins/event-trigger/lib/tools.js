export function runtimeTools(id) {
  return {
    async connect({identity}) { return {account:`账号 ${identity.user}`}; },
    async activate({sdk,z,ctx,config={}}) {
      async function request(operation,input) {
        const origin=config.url||process.env.PLUGIN_AGENT_URL||'http://127.0.0.1:48082';
        const response=await fetch(`${origin}/internal/v1/agent/work/sessions/extensions/${id}/${operation}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
          headers:{Authorization:`Bearer ${process.env.AGENT_INTERNAL_TOKEN}`,'Content-Type':'application/json','X-AI-Tenant':ctx.identity.tenant,'X-AI-User':ctx.identity.user,'X-AI-Device':ctx.identity.device || '1'},body:JSON.stringify(input)});
        if(!response.ok)throw Error(`插件请求未确认 (${response.status})，请查询状态`);
        return {content:[{type:'text',text:JSON.stringify((await response.json()).data)}]};
      }
      return {tools:[
        sdk.tool('list_rules','查看当前账号的规则。',{},()=>request('list',{})),
        sdk.tool('read_runs','查看某条规则的触发记录；submitted 只是工作已提交，应继续读取 Work 状态。',{id:z.string().uuid()},a=>request('runs',a)),
        sdk.tool('manage_rule','创建、修改、暂停、恢复或删除规则。创建重试使用相同 request_id。工作说明包含筛选与执行范围；不替代服务端授权。',{
          operation:z.enum(['create','update','pause','resume','delete','endpoint']),id:z.string().uuid().optional(),request_id:z.string().uuid().optional(),
          title:z.string().max(80).optional(),prompt:z.string().max(5000).optional(),url:z.string().max(2000).optional(),
          cron:z.string().max(100).optional(),run_at:z.string().nullable().optional(),timezone:z.string().optional(),payload:z.record(z.string(),z.unknown()).optional()
        },({operation,...input})=>request(operation,input))
      ],approval:async(tool,input)=>tool==='manage_rule'?[{label:'操作',value:input.operation},{label:'规则',value:input.title||input.id||'新规则'},{label:'工作说明或目标',value:(input.prompt||input.url||'沿用已有设置').slice(0,500)}]:[]};
    }
  };
}
