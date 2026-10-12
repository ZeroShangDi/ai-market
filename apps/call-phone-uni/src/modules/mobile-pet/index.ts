import { reactive } from 'vue';
import { petAdapter } from './android';
import { createPetController, initialPetState } from './controller';

let preferenceKey = 'portable-pet.enabled';
let started = false;
export const mobilePet = reactive(initialPetState());
const controller = createPetController(petAdapter, {
  read: () => { started = true; return uni.getStorageSync(preferenceKey) === true; },
  write: enabled => { started = true; uni.setStorageSync(preferenceKey, enabled); },
}, mobilePet);
/** Configure once before the first refresh; the host owns its preference namespace. */
export function configureMobilePet(options: { preferenceKey: string }) {
  if (!options.preferenceKey.trim()) throw new Error('桌宠设置键不能为空');
  if (started && preferenceKey !== options.preferenceKey) throw new Error('桌宠启动后不能更换设置键');
  preferenceKey = options.preferenceKey;
}
export const refreshMobilePet = controller.refresh;
export const setMobilePetEnabled = controller.setEnabled;
export const setMobilePetText = controller.setText;
export const openOverlaySettings = controller.openSettings;
export const onPetChange = controller.onChange;
export const isPetActive = controller.isActive;
export const disposeMobilePet = controller.dispose;
