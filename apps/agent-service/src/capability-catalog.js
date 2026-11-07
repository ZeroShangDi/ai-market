import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../../../plugins/catalog.json', import.meta.url));
export async function builtInCapabilities() {
  const path = process.env.WORK_BUILTIN_CATALOG || source;
  const catalog = JSON.parse(await readFile(path, 'utf8'));
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.items)) throw Error('Invalid capability catalog');
  return catalog.items.map(item => ({ ...item, installed: true, enabled: true, connected: false, account: '', connection: {} }));
}
