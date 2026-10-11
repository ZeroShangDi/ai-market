import { reactive } from 'vue';
import { overlayPermission, openOverlaySettings, showOverlay, hideOverlay, setOverlayText, bringToFront } from './android';
export { openOverlaySettings } from './android';
const preference = 'callphone.mobile-pet.enabled';
export const mobilePet = reactive({ enabled: false, visible: false, permission: null as boolean | null, message: '', status: '未连接' });
let initialized = false, operation = Promise.resolve(), onlineAt = 0;
let ticker: ReturnType<typeof setInterval> | undefined;
const observers = new Set<() => void>();
export function onPetChange(fn: () => void) { observers.add(fn); return () => observers.delete(fn); }
function notify() { observers.forEach(fn => fn()); }
function enqueue(action: () => Promise<void>) { operation = operation.then(action, action); return operation; }
export function canRunInBackground() { return mobilePet.enabled && mobilePet.visible && overlayPermission() === true; }
export function refreshMobilePet() {
  if (!initialized) { initialized = true; mobilePet.enabled = uni.getStorageSync(preference) === true; }
  mobilePet.permission = overlayPermission();
  return enqueue(async () => {
    try {
      if (!mobilePet.enabled || mobilePet.permission !== true) {
        await hideOverlay(); mobilePet.visible = false;
        if (mobilePet.enabled) mobilePet.message = '请允许显示在其他应用上层';
        if (ticker) clearInterval(ticker); ticker = undefined;
      } else {
        await showOverlay(() => { try { bringToFront(); } catch (e) { mobilePet.message = (e as Error).message; } }, () => { void setMobilePetEnabled(false); });
        mobilePet.visible = true; mobilePet.message = '';
        if (!ticker) ticker = setInterval(() => {
          if (overlayPermission() !== true) { void refreshMobilePet(); return; }
          void renderStatus();
        }, 5000);
        await renderStatus();
      }
    } catch (e) { mobilePet.visible = false; mobilePet.message = (e as Error).message || '悬浮窗显示失败'; }
    notify();
  });
}
export async function setMobilePetEnabled(enabled: boolean) {
  initialized = true; mobilePet.enabled = enabled;
  uni.setStorageSync(preference, enabled);
  await refreshMobilePet();
  if (enabled && mobilePet.permission === false) openOverlaySettings();
  else if (enabled && !mobilePet.visible) throw new Error(mobilePet.message || '手机宠未显示，请重新检查权限');
}
export function reportPetConnection(connected: boolean, busy = false) {
  onlineAt = connected ? Date.now() : 0;
  mobilePet.status = busy ? '通话中' : connected ? '已连接' : '未连接';
  void renderStatus();
}
async function renderStatus() {
  const text = onlineAt && Date.now() - onlineAt > 15000 ? '连接待确认' : mobilePet.status;
  try { await setOverlayText(text); }
  catch { mobilePet.message = '手机宠显示更新失败'; }
}
