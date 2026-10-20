/** Minimal authenticated host transport. Domain orchestration belongs to managed plugins. */
import { request, getSessionVersion } from '@/api/http';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function handleVoicePluginRequest(value: any, current: () => boolean) {
  if (!value || value.type !== 'plugin_host_request' || typeof value.id !== 'string' || !uuid.test(value.id)) return;
  const response = { type: 'plugin_host_result', id: value.id };
  // Read checks go through the same permission/device/conversation boundary as Work.
  // Return only an ID: task contents never cross this host authorization transport.
  const allocation = value.method === 'POST' && value.path === '/api/v1/mobile/ai/conversations'
    && typeof value.request_id === 'string' && uuid.test(value.request_id)
    && value.body && !Array.isArray(value.body) && Object.keys(value.body).length === 0;
  const inspection = value.method === 'GET' && typeof value.path === 'string'
    && value.path.startsWith('/api/v1/mobile/work/sessions/')
    && uuid.test(value.path.slice('/api/v1/mobile/work/sessions/'.length)) && value.body == null;
  if (!allocation && !inspection) {
    return { ...response, error: 'HOST_OPERATION_NOT_ALLOWED' };
  }
  const identity = getSessionVersion();
  if (!current()) return;
  try {
    const data = await request<{ id: string }>(allocation ? 'POST' : 'GET', value.path, allocation ? {} : undefined, allocation ? value.request_id : undefined);
    if (!current() || identity !== getSessionVersion()) return;
    return { ...response, data: { id: data.id } };
  } catch {
    if (!current() || identity !== getSessionVersion()) return;
    return { ...response, error: 'HOST_REQUEST_UNCONFIRMED' };
  }
}
