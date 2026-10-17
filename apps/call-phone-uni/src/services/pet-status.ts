// Connection state remains in the host UI; the pet text channel is reserved for transient messages.
import { setMobilePetText } from '@/modules/mobile-pet';
let wasBusy = false;
export function reportPetConnection(_connected: boolean, busy = false) {
  if (busy && !wasBusy) void setMobilePetText('正在通话，稍后聊。');
  wasBusy = busy;
}
