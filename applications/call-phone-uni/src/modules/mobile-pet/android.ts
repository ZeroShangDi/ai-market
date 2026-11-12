import * as native from '@/uni_modules/portable-pet-overlay';
import { createNativePetAdapter } from './transport';
import { activePackage } from '../pet-packages';

function localSource(path: string) {
  const relative = path.replace(/^\//, '');
  return {
    videoPath: plus.io.convertLocalFileSystemURL('_www/' + relative),
    assetPath: 'apps/' + plus.runtime.appid + '/www/' + relative,
  };
}

export const petAdapter = createNativePetAdapter(() => {
  if (typeof plus === 'undefined' || uni.getSystemInfoSync().platform !== 'android') {
    throw new Error('桌宠目前仅支持 Android App');
  }
  return native;
}, () => {
  const pack = activePackage();
  if (!pack) throw new Error('请先在我的 → 语音中加载角色资源');
  const player = localSource('/static/mobile-pet/player.html');
  return {
    renderer: 'rgb-alpha-sbs-v1', playerPath: player.videoPath, playerAssetPath: player.assetPath,
    actions: pack.actions.map(({ file, ...action }) => ({ ...action, videoPath: pack.directory + '/' + file, assetPath: 'pet-package/' + file })), sizeDp: 104,
  };
});
