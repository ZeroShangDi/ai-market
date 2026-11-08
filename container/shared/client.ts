// Adapted from the existing system/auth, infra/file and notify-message clients.
export interface Response { status: number; data: any }
export interface Transport {
  request(method: string, url: string, headers: Record<string,string>, body?: unknown): Promise<Response>;
  upload(url: string, headers: Record<string,string>, file: unknown): Promise<Response>;
}
export interface MenuEntry { id:number|string; name:string; path:string; visible?:boolean; children?:MenuEntry[] }
export interface Identity { menus?:MenuEntry[]; user: { id: number; nickname: string }; permissions: string[]; roles: string[] }
export interface Entry { id: string; title: string; url: string; enabled?: boolean; permission?: string }
export function visibleEntries(entries: Entry[], permits: (permission: string) => boolean) {
  const seen = new Set<string>();
  return entries.filter(entry => {
    if (seen.has(entry.id)) throw new Error('重复的模块入口');
    seen.add(entry.id);
    return entry.enabled !== false && (!entry.permission || permits(entry.permission));
  });
}
/** Portable across Web and uni-app logic runtimes without browser URL APIs. */
export function parseEntryUrl(value:string){
  const match=/^(https?):\/\/(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?([/?#][^\s\\]*)?$/i.exec(value);
  if(!match||match[3]&&(Number(match[3])<1||Number(match[3])>65535))throw new Error('模块入口只允许不带凭据的 HTTP(S) 地址');
  const sensitive=/^(?:access[_-]?token|refresh[_-]?token|token|password|secret|authorization|credential|api[_-]?key)$/i;
  const tail=match[4]||'/',hashIndex=tail.indexOf('#'),hash=hashIndex<0?'':tail.slice(hashIndex+1),withoutHash=hashIndex<0?tail:tail.slice(0,hashIndex),queryIndex=withoutHash.indexOf('?');
  for(const params of [queryIndex<0?'':withoutHash.slice(queryIndex+1),hash.includes('?')?hash.slice(hash.indexOf('?')+1):hash]){
    for(const pair of params.split('&')){let key:string;try{key=decodeURIComponent(pair.split('=')[0].replace(/\+/g,' '));}catch{throw new Error('模块入口编码无效');}if(sensitive.test(key))throw new Error('模块入口不得包含认证凭据');}
  }
  const scheme=match[1].toLowerCase(),port=match[3]&&!(scheme==='http'&&Number(match[3])===80||scheme==='https'&&Number(match[3])===443)?':'+Number(match[3]):'';
  const origin=scheme+'://'+match[2].toLowerCase()+port;
  return {origin,href:origin+(tail.startsWith('/')?tail:'/'+tail)};
}
export function safeEntryUrl(value:string){return parseEntryUrl(value).href;}
export function entriesFromMenus(menus:MenuEntry[]):Entry[]{
  const result:Entry[]=[];
  function visit(nodes:MenuEntry[]){for(const menu of nodes){
    if(menu.visible===false)continue;
    try{
      const hashAt=menu.path.indexOf('#'),hash=hashAt<0?'':menu.path.slice(hashAt),raw=hashAt<0?menu.path:menu.path.slice(0,hashAt),at=raw.indexOf('?');
      const base=at<0?raw:raw.slice(0,at),params=(at<0?'':raw.slice(at+1)).split('&').filter(part=>part&&decodeURIComponent(part.split('=')[0])!=='_iframe');
      result.push({id:'menu-'+menu.id,title:menu.name,url:safeEntryUrl(base+(params.length?'?'+params.join('&'):'')+hash)});
    }catch{/* Internal routes are not external business modules. */}
    if(Array.isArray(menu.children))visit(menu.children);
  }}
  visit(menus);return result;
}
export function normalizeConnection(baseUrl:string,tenantId:string){
  if(typeof baseUrl!=='string'||typeof tenantId!=='string')throw new Error('连接设置无效');
  const normalized=baseUrl.trim().replace(/\/+$/,'');
  if(normalized){parseEntryUrl(normalized);if(/[?#]/.test(normalized))throw new Error('服务地址无效');}
  if(!/^[0-9]{1,19}$/.test(tenantId.trim()))throw new Error('工作区编号无效');
  return {baseUrl:normalized,tenantId:tenantId.trim()};
}
export function createClient(transport: Transport, settings: () => { baseUrl: string; tenantId: string }) {
  let access = '', refresh = '', generation = 0, identity: Identity | null = null;
  let refreshing: Promise<void> | undefined;
  const listeners = new Set<(value:Identity|null)=>void>();
  function notify() { for(const listener of listeners)try{listener(identity);}catch{/* A view failure must not interrupt session invalidation. */} }
  function clear() { generation++; access = refresh = ''; identity = null; refreshing=undefined; notify(); }
  function headers(auth = true) {
    const h: Record<string,string> = { 'tenant-id': settings().tenantId };
    if (auth && access) h.Authorization = `Bearer ${access}`;
    return h;
  }
  function target(path: string) {
    if (!path.startsWith('/admin-api/')) throw new Error('仅允许调用公共后台');
    return settings().baseUrl.replace(/\/+$/, '') + path;
  }
  function unwrap(result: Response) {
    if (result.status < 200 || result.status >= 300 || result.data?.code !== 0) {
      const error = new Error('公共服务调用失败') as Error & { code: number };
      error.code = result.data?.code ?? result.status;
      throw error;
    }
    return result.data.data;
  }
  async function renew() {
    if (refreshing) return refreshing;
    const version = generation, token = refresh;
    if (!token) throw new Error('请重新登录');
    const task = (async () => {
      try {
        const data = unwrap(await transport.request('POST', target('/admin-api/system/auth/refresh-token?refreshToken='+encodeURIComponent(token)), headers(false)));
        if (version !== generation) throw new Error('会话已变更');
        if (!data?.accessToken || !data?.refreshToken) throw new Error('登录响应无效');
        access = data.accessToken; refresh = data.refreshToken;
      } catch (error) { if (version === generation) clear(); throw error; }
    })();
    refreshing = task;
    try { await task; } finally { if (refreshing === task) refreshing = undefined; }
  }
  async function request(method: string, path: string, body?: unknown, auth = true) {
    const version = generation;
    let result = await transport.request(method, target(path), headers(auth), body);
    if (auth && version !== generation) throw new Error('会话已变更');
    if (auth && (result.status === 401 || result.data?.code === 401)) {
      await renew();
      result = await transport.request(method, target(path), headers(), body);
    }
    if (auth && version !== generation) throw new Error('会话已变更');
    return unwrap(result);
  }
  return {
    request,
    get identity() { return identity; },
    subscribe(listener:(value:Identity|null)=>void){listeners.add(listener);listener(identity);return ()=>listeners.delete(listener);},
    can(permission: string) { return !!identity && (identity.roles.includes('super_admin') || identity.permissions.includes('*:*:*') || identity.permissions.includes(permission)); },
    async login(username: string, password: string, captchaVerification?: string) {
      clear(); const version = generation;
      const data = await request('POST','/admin-api/system/auth/login',{username,password,captchaVerification},false);
      if (version !== generation) throw new Error('登录请求已替换');
      if (!data?.accessToken || !data?.refreshToken) throw new Error('登录响应无效');
      access = data.accessToken; refresh = data.refreshToken;
      try {
        const info = await request('GET','/admin-api/system/auth/get-permission-info');
        if (version !== generation) throw new Error('会话已变更');
        identity = info; notify();
      } catch (error) { if (version === generation) clear(); throw error; }
    },
    async logout() { const task = access ? request('POST','/admin-api/system/auth/logout') : Promise.resolve(); clear(); try { await task; } catch { /* Local session is already invalidated. */ } },
    clear,
    config: (key: string) => request('GET','/admin-api/infra/config/get-value-by-key?key='+encodeURIComponent(key)),
    notifications: () => request('GET','/admin-api/system/notify-message/my-page?pageNo=1&pageSize=20'),
    markRead: (id: number) => request('PUT','/admin-api/system/notify-message/update-read?ids='+id),
    async upload(file: unknown) {
      const version = generation;
      const result = await transport.upload(target('/admin-api/infra/file/upload'), headers(), file);
      if (version !== generation) throw new Error('会话已变更');
      // Do not retry uploads: the server may have persisted the file.
      return unwrap(result) as string;
    },
  };
}
