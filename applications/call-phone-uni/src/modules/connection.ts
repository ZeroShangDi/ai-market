import {normalizeConnection} from '../../shared/client';
// A deployed unified endpoint wins over stale per-device addresses from older builds.
export function initialConnection(deployed: unknown, saved: any, legacyUrl: unknown, legacyTenant: unknown) {
  const configured = typeof deployed === 'string' ? deployed.trim() : '';
  const base = configured || (typeof saved?.baseUrl === 'string' ? saved.baseUrl : typeof legacyUrl === 'string' ? legacyUrl : '');
  const tenant = typeof saved?.tenantId === 'string' ? saved.tenantId : typeof legacyTenant === 'string' ? legacyTenant : '1';
  try { return normalizeConnection(base, tenant); }
  catch { return normalizeConnection(configured, '1'); }
}
