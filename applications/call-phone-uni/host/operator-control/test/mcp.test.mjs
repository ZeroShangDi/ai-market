import{test}from'node:test';import assert from'node:assert/strict';import{Client}from'@modelcontextprotocol/sdk/client/index.js';import{InMemoryTransport}from'@modelcontextprotocol/sdk/inMemory.js';import{StdioClientTransport}from'@modelcontextprotocol/sdk/client/stdio.js';import{fileURLToPath}from'node:url';import{createServer}from'../server.mjs';
const decode=r=>JSON.parse(r.content.find(x=>x.type==='text').text);
test('standard MCP client discovers tools and does not treat configuration as connectivity',async()=>{
 const calls=[],device={deviceId:'phone',epoch:'one',async execute(principal,r){calls.push({principal,r});return {status:'dispatched',verified:false};}};
 const server=createServer(new Map([['phone',device]]),'desktop'),client=new Client({name:'test-client',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await Promise.all([server.connect(a),client.connect(b)]);assert.equal((await client.listTools()).tools.length,2);const list=decode(await client.callTool({name:'mobile_devices',arguments:{}}));assert.equal(list[0].connection,'not_checked');
 const unknown=await client.callTool({name:'mobile_execute',arguments:{request:{deviceId:'other'}}});assert.equal(unknown.isError,true);assert.equal(calls.length,0);
 const r=await client.callTool({name:'mobile_execute',arguments:{request:{deviceId:'phone'}}});assert.equal(decode(r).verified,false);assert.equal(calls[0].principal,'desktop');
 }finally{await client.close();await server.close();}
});
test('stdio entry starts without paired devices and rejects device actions',async()=>{
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server.mjs',import.meta.url))],env:{PATH:process.env.PATH}}),client=new Client({name:'stdio-test',version:'1'});
 try{await client.connect(transport);assert.deepEqual(decode(await client.callTool({name:'mobile_devices',arguments:{}})),[]);assert.equal((await client.callTool({name:'mobile_execute',arguments:{request:{deviceId:'missing'}}})).isError,true);}finally{await client.close();}
});
