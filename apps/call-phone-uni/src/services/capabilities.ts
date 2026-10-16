import { request, onSessionChange, onDeviceChange } from '@/api/http';
import { reactive } from 'vue';
import type { WorkPlugin } from './work';
const path = '/api/v1/mobile/work/sessions/capabilities';
export const capabilities = reactive({ items: [] as WorkPlugin[], loading: false, saving: false, error: '' });
let epoch = 0;
function reset() { epoch++; capabilities.items = []; capabilities.loading = false; capabilities.saving = false; capabilities.error = ''; }
onSessionChange(reset); onDeviceChange(reset);
export async function loadCapabilities() {
  const token = ++epoch; capabilities.loading = true;
  try { const result = await request<{items: WorkPlugin[]}>('GET', path); if (token === epoch) { capabilities.items = result.items; capabilities.error = ''; } }
  catch (e: any) { if (token === epoch) capabilities.error = e.message || '能力加载失败'; }
  finally { if (token === epoch) capabilities.loading = false; }
}
export async function configureCapability(id: string, action: string, skill?: string) {
  if (capabilities.saving) return;
  const token = ++epoch; capabilities.loading = false; capabilities.saving = true;
  try { const result = await request<{items: WorkPlugin[]}>('POST', path, {plugin_id: id, action, skill}); if (token === epoch) { capabilities.items = result.items; capabilities.error = ''; } }
  finally { if (token === epoch) capabilities.saving = false; }
}
