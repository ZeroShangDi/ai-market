import type { WorkPlugin } from '@/services/work';
export type CapabilityType = 'plugins' | 'skills' | 'connections' | 'mcp';
export interface CapabilityEntry {
  key: string; type: CapabilityType; name: string; description: string; plugin: WorkPlugin;
  skill?: string; installed: boolean; enabled: boolean; hasConnection: boolean;
}
export function capabilityEntries(plugins: WorkPlugin[]): CapabilityEntry[] {
  return plugins.flatMap(plugin => {
    const hasConnection = !!(plugin.connection?.label || plugin.connection?.description || plugin.connection?.actionLabel);
    const base = { plugin, installed: plugin.installed, enabled: plugin.installed && plugin.enabled, hasConnection };
    const entries: CapabilityEntry[] = [{ ...base, key: `${plugin.id}:plugin`, type: 'plugins', name: plugin.name, description: plugin.description }];
    for (const skill of plugin.skills) entries.push({ ...base, key: `${plugin.id}:skill:${skill.id || skill.name}`, type: 'skills', name: skill.name, description: skill.description, skill: skill.name, enabled: base.enabled && skill.enabled });
    if (hasConnection) entries.push({ ...base, key: `${plugin.id}:connection`, type: 'connections', name: plugin.connection.label || plugin.name, description: plugin.connection.description || plugin.description });
    if (plugin.tools.length) entries.push({ ...base, key: `${plugin.id}:mcp`, type: 'mcp', name: `${plugin.name} MCP`, description: plugin.tools.map(t => t.label).join('、') });
    return entries;
  });

}
