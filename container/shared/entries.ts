import {entriesFromMenus,type Entry,type Identity} from './client';
// Trusted build configuration, never remotely supplied JavaScript or credentials.
const configured: unknown = JSON.parse(import.meta.env?.VITE_CONTAINER_ENTRIES || '[]');
if (!Array.isArray(configured) || configured.some(value => !value || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.url !== 'string' || (value.permission !== undefined && typeof value.permission !== 'string') || (value.enabled !== undefined && typeof value.enabled !== 'boolean'))) throw new Error('模块入口配置无效');
export const entries: Entry[] = configured;

/** Reuse the same server-authorized external menus as the retained PC shell. */
export function entriesFor(identity:Identity|null):Entry[]{
  return identity&&Array.isArray(identity.menus)?entriesFromMenus(identity.menus):entries;
}
