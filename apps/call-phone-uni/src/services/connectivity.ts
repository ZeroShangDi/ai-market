import { ref } from 'vue';
import { checkDataService } from '@/api/http';
import { connectionSettings, mockEnabled } from '@/config';

export const connectivityStatus = ref('未检查');
export const checkingConnectivity = ref(false);
let checkedKey = '';
let generation = 0;
let pending: Promise<void> | undefined;

// Keep the latest result across page remounts, but recheck changed server settings.
export function testConnectivity(force = true): Promise<void> {
  const key = JSON.stringify(connectionSettings());
  if (key === checkedKey) {
    if (pending) return pending;
    if (!force) return Promise.resolve();
  }
  const attempt = ++generation;
  checkedKey = key;
  checkingConnectivity.value = true;
  connectivityStatus.value = '检查中';
  const request = (async () => {
    let status: string;
    try {
      status = mockEnabled ? '开发模拟模式，未检查真实服务' : await checkDataService();
    } catch {
      status = '无法连接客户侧数据服务';
    }
    if (attempt === generation) connectivityStatus.value = status;
  })();
  pending = request;
  return request.finally(() => {
    if (pending === request) {
      checkingConnectivity.value = false;
      pending = undefined;
    }
  });
}
