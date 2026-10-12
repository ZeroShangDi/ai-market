// Call Phone presentation policy. The reusable pet module only receives plain text.
import { setMobilePetText } from '@/modules/mobile-pet';
let stale: ReturnType<typeof setTimeout> | undefined;
export function reportPetConnection(connected: boolean, busy = false) {
  if (stale) clearTimeout(stale);
  stale = undefined;
  void setMobilePetText(busy ? '通话中' : connected ? '已连接' : '未连接');
  if (connected) stale = setTimeout(() => { void setMobilePetText('连接待确认'); }, 15000);
}
