import {readFile,mkdir,cp,writeFile,rm} from 'node:fs/promises';
const root=new URL('../',import.meta.url), out=new URL('apps/agent-service/.plugin-bundle/',root);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const entries=JSON.parse(await readFile(new URL('plugins/runtime-catalog.json',root),'utf8'));
for(const entry of entries) {
 if(!/^[a-z][a-z0-9-]+$/.test(entry.directory))throw Error('Invalid package');
 await cp(new URL(`plugins/${entry.directory}/`,root),new URL(`${entry.directory}/`,out),{recursive:true,filter:path=>!String(path).includes('/node_modules')});
}
await writeFile(new URL('runtime-catalog.json',out),JSON.stringify(entries,null,2)+'\n');
