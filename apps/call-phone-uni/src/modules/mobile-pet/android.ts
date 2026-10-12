import * as native from '@/uni_modules/portable-pet-overlay';
import { createNativePetAdapter } from './transport';
import { elfSheets, elfFrames, elfActions } from './appearance';

export const petAdapter = createNativePetAdapter(() => {
  if (typeof plus === 'undefined' || uni.getSystemInfoSync().platform !== 'android') {
    throw new Error('桌宠目前仅支持 Android App');
  }
  return native;
}, () => {
  const sheets = elfSheets.map(sheet => {
    const relative = sheet.image.replace(/^\//, '');
    return {
      imagePath: plus.io.convertLocalFileSystemURL('_www/' + relative),
      assetPath: 'apps/' + plus.runtime.appid + '/www/' + relative,
      columns: sheet.columns, rows: sheet.rows,
    };
  });
  return {
    ...sheets[0], frames: elfFrames, sheets, actions: elfActions, sizeDp: 104,
  };
});
