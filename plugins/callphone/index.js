import { createLeadBridge, createLeadTools, prepareLeadImport } from './leads.js';

export async function activate({ sdk, z, ctx, config = {} }) {
  const bridge = config.bridge || createLeadBridge(config);
  if (!bridge) throw new Error('Call Phone plugin requires WORK_BUSINESS_URL');
  return {
    tools: createLeadTools(sdk, z, ctx, bridge),
    async approval(tool, input) {
      if (tool !== 'import_leads') return [];
      const p = await prepareLeadImport(ctx, input);
      if (p.fingerprint !== input.fingerprint) throw new Error('Import preview changed');
      return [
        { label: '文件', value: p.resource.name }, { label: '可导入行数', value: String(p.valid.length) },
        { label: '跳过错误行', value: String(p.invalid.length) }, { label: '导入位置', value: '线索池（沿用现有自动分配设置）' },
      ];
    },
  };
}

// Account connection belongs to this plugin, never to the Work host.
export async function connect({ identity, config = {} }) {
  if (config.connect) return config.connect(identity);
  const url = config.url || process.env.WORK_BUSINESS_URL;
  const token = config.token || process.env.AGENT_INTERNAL_TOKEN;
  if (!url || !token || token.length < 32) throw new Error('插件连接未配置');
  const endpoint = new URL(url);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('插件地址无效');
  endpoint.pathname = endpoint.pathname.replace(/\/import$/, '/connection');
  const response = await (config.fetchImpl || fetch)(endpoint, { redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'tenant-id': identity.tenant, 'X-AI-User': identity.user, 'X-Work-Internal-Token': token } });
  if (!response.ok) throw new Error('当前账号连接失败');
  return (await response.json()).data;
}
