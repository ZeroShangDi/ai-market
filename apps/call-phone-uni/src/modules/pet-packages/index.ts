import { reactive } from 'vue';
import * as native from '@/uni_modules/portable-pet-overlay';
import { connectionSettings } from '@/config';
export interface PackageAction { id: string; label: string; group: string; file: string; bounds: number[]; repeats: number; randomWeight: number }
export interface PetPackage { id: string; version: number; name: string; actions: PackageAction[]; directory: string; persona: string; skills: string; voiceProfile: string; scenes?: Record<string,string> }
export interface AvailablePackage { id: string; version: number; name: string; bytes: number; sha256: string; actionCount: number }
export const petPackages = reactive({ active: '', installed: [] as PetPackage[], available: [] as AvailablePackage[], busy: '', error: '' });
const observers = new Set<() => Promise<void>>();
export function onPackageChange(listener: () => Promise<void>) { observers.add(listener); return () => observers.delete(listener); }
export function activePackage() { return petPackages.installed.find(item => `${item.id}-${item.version}` === petPackages.active); }
export function packageBaseUrl() { return connectionSettings().serviceUrl.replace(/\/+$/, '') + '/api/v1/pet-resources'; }
function invoke(command: string, payload: object = {}): Promise<void> {
  return new Promise((resolve,reject) => {
    if (typeof plus === 'undefined') { reject(new Error('资源加载需要 Android App')); return; }
    native.execute(command, JSON.stringify(payload), raw => {
      try {
        const result = JSON.parse(raw); if (!result.ok) throw new Error(result.message);
        petPackages.active = result.active; petPackages.installed = result.installed; resolve();
      } catch (error) { reject(error); }
    });
  });
}
export async function restorePackages() { if (typeof plus !== 'undefined') await invoke('packageState'); }
export async function refreshPackages() {
  petPackages.error = '';
  try {
    await restorePackages();
    const result = await new Promise<any>((resolve,reject) => uni.request({url: packageBaseUrl()+'/catalog.json',success: r => r.statusCode===200 ? resolve(r.data) : reject(new Error('资源目录暂不可用')),fail: () => reject(new Error('无法连接资源服务'))}));
    if (result.schemaVersion !== 1 || !Array.isArray(result.packages)) throw new Error('资源目录格式不兼容');
    petPackages.available = result.packages;
  } catch (e) { petPackages.error = (e as Error).message; }
}
export async function changePackage(command: 'packageInstall'|'packageActivate'|'packageDelete', item: AvailablePackage | PetPackage) {
  if (petPackages.busy) return;
  petPackages.busy = item.id; petPackages.error = '';
  const previous = petPackages.active;
  try {
    await invoke(command,{ id:item.id,version:item.version,baseUrl:packageBaseUrl(),sha256:'sha256' in item ? item.sha256 : undefined });
    if (previous !== petPackages.active) for (const fn of observers) await fn();
  } catch (e) { petPackages.error = (e as Error).message; }
  finally { petPackages.busy = ''; }
}
