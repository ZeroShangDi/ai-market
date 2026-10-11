import sheet from './assets/elf-sheet-v2.png';
// Shared by the preview and native AnimationDrawable. Durations are milliseconds.
export const elfSheet = sheet;
export const elfFrames = [
  { cell: 0, duration: 2800 },
  { cell: 1, duration: 160 },
  { cell: 0, duration: 2200 },
  { cell: 2, duration: 650 },
  { cell: 0, duration: 300 },
  { cell: 2, duration: 650 },
];
export function createElfAnimation(a: any, resources: any) {
  const relative = elfSheet.replace(/^\//, '');
  // uni-app emits a packaged resource URL, not a data URI (even with ?inline).
  const local = plus.io.convertLocalFileSystemURL('_www/' + relative);
  let bitmap = a.invoke('android.graphics.BitmapFactory', 'decodeFile', local);
  if (!bitmap) {
    // Cloud APK resources may live in AssetManager instead of a regular file.
    const assets = a.invoke(a.runtimeMainActivity(), 'getAssets');
    let stream: any;
    try {
      stream = a.invoke(assets, 'open', 'apps/' + plus.runtime.appid + '/www/' + relative);
      if (stream) bitmap = a.invoke('android.graphics.BitmapFactory', 'decodeStream', stream);
    } finally { if (stream) a.invoke(stream, 'close'); }
  }
  if (!bitmap) throw new Error('精灵图片解码失败');
  const width = Number(a.invoke(bitmap, 'getWidth'));
  const height = Number(a.invoke(bitmap, 'getHeight'));
  if (!width || !height || width % 3) throw new Error('精灵图片帧尺寸不正确');
  const frames = [0, 1, 2].map(cell => {
    const crop = a.invoke('android.graphics.Bitmap', 'createBitmap', bitmap, cell * (width / 3), 0, width / 3, height);
    if (!crop) throw new Error('精灵动作帧读取失败');
    const small = a.invoke('android.graphics.Bitmap', 'createScaledBitmap', crop, 256, 256, true);
    if (!small) throw new Error('精灵动作帧缩放失败');
    const drawable = a.newObject('android.graphics.drawable.BitmapDrawable', resources, small);
    if (!drawable) throw new Error('精灵动作帧创建失败');
    a.invoke(crop, 'recycle');
    return drawable;
  });
  a.invoke(bitmap, 'recycle');
  const animation = a.newObject('android.graphics.drawable.AnimationDrawable');
  if (!animation) throw new Error('精灵动画创建失败');
  a.invoke(animation, 'setOneShot', false);
  elfFrames.forEach(frame => a.invoke(animation, 'addFrame', frames[frame.cell], frame.duration));
  return animation;
}
