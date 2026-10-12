import * as native from '@/uni_modules/portable-pet-overlay';
import { createNativePetAdapter } from './transport';
import { elfSheet, elfFrames } from './appearance';

export const petAdapter = createNativePetAdapter(() => {
  if (typeof plus === 'undefined' || uni.getSystemInfoSync().platform !== 'android') {
    throw new Error('桌宠目前仅支持 Android App');
  }
  return native;
}, () => {
  const relative = elfSheet.replace(/^\//, '');
  return {
    imagePath: plus.io.convertLocalFileSystemURL('_www/' + relative),
    assetPath: 'apps/' + plus.runtime.appid + '/www/' + relative,
    columns: 3, frames: elfFrames, sizeDp: 104,
  };
});
