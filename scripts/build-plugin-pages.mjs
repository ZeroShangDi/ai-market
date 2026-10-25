import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('plugins/runtime-catalog.json',root),'utf8'));
const pages=[];
for(const entry of catalog) {
  const base=new URL(`plugins/${entry.directory}/`,root);
  const page=JSON.parse(await readFile(new URL('page.json',base),'utf8'));
  if(page.entry!=='ui/index.vue' || !/^[a-z_]+$/.test(page.id))throw Error('Invalid managed plugin page');
  const destination=new URL(`apps/call-phone-uni/src/pages/plugin-generated/${page.id}/`,root);
  await mkdir(destination,{recursive:true});
  await cp(new URL('ui/',base),destination,{recursive:true});
  pages.push({...page,route:`/pages/plugin-generated/${page.id}/index`});
}
await writeFile(new URL('apps/call-phone-uni/src/modules/plugin-pages/catalog.json',root),JSON.stringify(pages,null,2)+'\n');
const path=new URL('apps/call-phone-uni/src/pages.json',root);
const config=JSON.parse(await readFile(path,'utf8'));
config.pages=config.pages.filter(p=>!p.path.startsWith('pages/plugin-generated/') && p.path!=='pages/plugin-rules/index');
config.pages.push(...pages.map(p=>({path:p.route.slice(1),style:{navigationStyle:'custom'}})));
await writeFile(path,JSON.stringify(config,null,2)+'\n');
