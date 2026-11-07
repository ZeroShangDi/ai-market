import type { WorkPlugin } from '@/services/work';
export type CapabilityType = 'plugins' | 'skills' | 'connections' | 'mcp';
export interface CapabilityEntry {
  key: string; type: CapabilityType; name: string; description: string; plugin: WorkPlugin;
  skill?: string; parentId?: string; installed: boolean; enabled: boolean; hasConnection: boolean;
}
export interface CapabilityTag { text: string; tone: 'off' | 'on' | 'pending' }
export function capabilityTags(entry: CapabilityEntry): CapabilityTag[] {
  const { plugin, type, installed, enabled } = entry;
  if (type === 'connections') return [{ text: plugin.connected ? '已连接' : '未连接', tone: plugin.connected ? 'on' : 'off' }];
  const tags: CapabilityTag[] = [{ text: plugin.builtin ? '内置' : installed ? '已安装' : '未安装', tone: plugin.builtin || installed ? 'on' : 'off' }];
  const blocked = enabled && type !== 'skills' && entry.hasConnection && !plugin.connected;
  tags.push({ text: !enabled ? '未启用' : blocked ? '待连接' : '已启用', tone: !enabled ? 'off' : blocked ? 'pending' : 'on' });
  if (type !== 'skills' && entry.hasConnection && !blocked) tags.push({ text: plugin.connected ? '已连接' : '未连接', tone: plugin.connected ? 'on' : 'off' });
  return tags;
}
export function capabilityEntries(plugins: WorkPlugin[]): CapabilityEntry[] {
  return plugins.flatMap(plugin => {
    const type = plugin.catalogType || 'plugins';
    const needsConnection = !!(plugin.connection?.label || plugin.connection?.description || plugin.connection?.actionLabel);
    const base = { plugin, installed: plugin.installed, enabled: plugin.installed && plugin.enabled, hasConnection: needsConnection };
    const root: CapabilityEntry = { ...base, key: `${plugin.id}:plugin`, type, name: plugin.name, description: plugin.description,
      hasConnection: type === 'skills' ? false : needsConnection };
    // A package has one catalog owner. Bundled contents are only discoverable inside its detail page.
    if (type !== 'plugins') return [root];
    const entries: CapabilityEntry[] = [root];
    for (const skill of plugin.skills) entries.push({ ...base, hasConnection: false, key: `${plugin.id}:skill:${skill.id || skill.name}`, type: 'skills', parentId: plugin.id, name: skill.name, description: skill.description, skill: skill.name, enabled: base.enabled && skill.enabled });
    if (needsConnection) entries.push({ ...base, key: `${plugin.id}:connection`, type: 'connections', parentId: plugin.id, name: plugin.connection.label || plugin.name, description: plugin.connection.description || plugin.description });
    if (plugin.tools.length) entries.push({ ...base, key: `${plugin.id}:mcp`, type: 'mcp', parentId: plugin.id, name: `${plugin.name} MCP`, description: plugin.tools.map(t => t.label).join('、') });
    return entries;
  });
}
