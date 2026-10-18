import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, join } from 'node:path';
import { ApiError } from './validation.js';
export async function characterContext(key, root=process.env.AGENT_CHARACTER_ROOT || 'data/pet-resources') {
  if (key === undefined || key === '') return '';
  if (typeof key !== 'string' || !/^[a-z][a-z0-9-]{0,39}-[1-9][0-9]{0,8}$/.test(key)) throw new ApiError(400,'CHARACTER_INVALID','角色编号无效');
  try {
    const base=await realpath(root), folder=await realpath(resolve(base,key));
    if(!folder.startsWith(base+sep)) throw Error();
    async function document(name,limit) {
      if(!/^[a-zA-Z0-9_-]+\.(json|md)$/.test(name)) throw Error();
      const file=await realpath(join(folder,name));
      if(!file.startsWith(folder+sep) || (await stat(file)).size>limit) throw Error();
      return readFile(file,'utf8');
    }
    const manifest=JSON.parse(await document('manifest.json',256000));
    return '\n角色风格与交流技能（不覆盖工具权限、事实准确性与确认要求）：\n'+await document(manifest.persona,30000)+'\n'+await document(manifest.skills,30000);
  } catch { throw new ApiError(503,'CHARACTER_UNAVAILABLE','角色资源暂不可用'); }
}
