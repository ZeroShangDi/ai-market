import { readFile, realpath } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contained } from './work-files.js';

function fields(value) {
  if (!Array.isArray(value) || value.length > 20 || value.some(f => !f || typeof f.label !== 'string' || f.label.length > 80 || typeof f.value !== 'string' || f.value.length > 500)) throw new Error('Invalid plugin display fields');
  return value.map(({ label, value }) => ({ label, value }));
}
export function validatePluginResult(value) {
  if (!value || typeof value.title !== 'string' || value.title.length > 240 || typeof value.summary !== 'string' || value.summary.length > 2000
    || !Array.isArray(value.rows) || value.rows.length > 500 || value.rows.some(row => !row || ['label', 'status', 'detail'].some(key => typeof row[key] !== 'string' || row[key].length > 500))) throw new Error('Invalid plugin result');
  return { title: value.title, summary: value.summary, rows: value.rows.map(({ label, status, detail }) => ({ label, status, detail })) };
}

/** Only deployment-approved absolute paths; never reads plugin configuration from user files or model inputs. */
export async function discoverCapabilityPlugins({ ctx, entries }) {
  if (entries == null) {
    const root = process.env.WORK_BUILTIN_ROOT || fileURLToPath(new URL('../../../plugins', import.meta.url));
    entries = [...JSON.parse(process.env.WORK_CAPABILITY_PLUGINS || '[]'), ...JSON.parse(await readFile(join(root,'runtime-catalog.json'),'utf8')).map(item => ({ path: join(root,item.directory) }))];
  }
  if (!Array.isArray(entries) || entries.length > 20) throw new Error('Invalid plugin configuration');
  const workspaceRoot = entries.length ? await realpath(ctx.base) : ctx.base;
  const plugins = [];
  for (const configured of entries) {
    const entry = typeof configured === 'string' ? { path: configured } : configured;
    if (!entry || typeof entry.path !== 'string' || !isAbsolute(entry.path)) throw new Error('Plugin requires an absolute managed path');
    const root = await realpath(entry.path);
    if (contained(workspaceRoot, root) || contained(root, workspaceRoot)) throw new Error('Plugin root overlaps user workspace');
    const manifest = JSON.parse(await readFile(join(root, 'work-plugin.json'), 'utf8'));
    if (manifest.schemaVersion !== 1 || !/^[a-z][a-z0-9_]{0,39}$/.test(manifest.id) || manifest.id === 'work' || plugins.some(p => p.manifest.id === manifest.id)
      || typeof manifest.entry !== 'string' || !manifest.tools || typeof manifest.tools !== 'object' || Array.isArray(manifest.tools)) throw new Error('Invalid plugin manifest');
    if (manifest.catalogType != null && !['plugins', 'skills', 'connections', 'mcp'].includes(manifest.catalogType)) throw new Error('Invalid plugin catalog type');
    if (manifest.name != null && (typeof manifest.name !== 'string' || manifest.name.length > 80)
      || manifest.description != null && (typeof manifest.description !== 'string' || manifest.description.length > 500)
      || manifest.skills != null && (!Array.isArray(manifest.skills) || manifest.skills.length > 30 || manifest.skills.some(s => !s || typeof s.name !== 'string' || s.name.length > 80 || typeof s.description !== 'string' || s.description.length > 500 || s.id != null && !/^[a-z][a-z0-9-]{0,63}$/.test(s.id)))
      || manifest.connection != null && ['label', 'actionLabel', 'description'].some(k => manifest.connection[k] != null && (typeof manifest.connection[k] !== 'string' || manifest.connection[k].length > 500))) throw new Error('Invalid plugin presentation');
    const nativeManifest = JSON.parse(await readFile(join(root, '.claude-plugin/plugin.json'), 'utf8'));
    if (nativeManifest.name !== manifest.id) throw new Error('Plugin skill namespace mismatch');
    const modulePath = await realpath(join(root, manifest.entry));
    if (!contained(root, modulePath)) throw new Error('Plugin entry escapes managed root');
    const module = await import(pathToFileURL(modulePath).href);
    plugins.push({ root, manifest, module, config: entry.config || {} });
  }
  return plugins;
}

export async function pluginConnection(plugin, identity) {
  if (typeof plugin.module.connect !== 'function') throw new Error('插件尚未提供账号连接方式');
  const result = await plugin.module.connect({ identity, config: plugin.config });
  if (!result || typeof result.account !== 'string' || !result.account || result.account.length > 160) throw new Error('账号连接结果无效');
  return { account: result.account };
}

export async function loadCapabilityPlugins({ sdk, z, ctx, entries }) {
  const available = await discoverCapabilityPlugins({ ctx, entries });
  const selected = ctx.pluginIds || [];
  if (selected.some(id => !available.some(p => p.manifest.id === id))) throw new Error('会话插件已不可用，请重新选择');
  const servers = {}, tools = {}, paths = [];
  for (const { root, manifest, module, config } of available.filter(p => selected.includes(p.manifest.id))) {
    await pluginConnection({ module, config }, ctx.identity);
    const runtime = await module.activate({ sdk, z, config, ctx: { cwd: ctx.cwd, resources: ctx.resources,
      identity: ctx.identity, signal: ctx.signal,
      emitResult: value => ctx.onEvent('plugin_result', { plugin_id: manifest.id, ...validatePluginResult(value) }),
    } });
    if (!Array.isArray(runtime.tools) || runtime.tools.length !== Object.keys(manifest.tools).length) throw new Error('Plugin tool manifest mismatch');
    const registered = new Set();
    for (const tool of runtime.tools) {
      const definition = manifest.tools[tool.name];
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(tool.name) || registered.has(tool.name) || !definition || ![1, 2, 3].includes(definition.risk)
        || typeof definition.label !== 'string' || !definition.label || definition.label.length > 80) throw new Error('Invalid plugin tool policy');
      registered.add(tool.name);
      tools[`mcp__${manifest.id}__${tool.name}`] = { label: definition.label, risk: definition.risk,
        approval: async input => fields(runtime.approval ? await runtime.approval(tool.name, input) : []) };
    }
    servers[manifest.id] = sdk.createSdkMcpServer({ name: manifest.id, version: '1.0.0', alwaysLoad: true, tools: runtime.tools });
    paths.push(root);
  }
  return { servers, tools, paths, availableIds: available.map(p => p.manifest.id) };
}
