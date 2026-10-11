export function bridge(): any | undefined {
  if (typeof plus === 'undefined' || uni.getSystemInfoSync().platform !== 'android') return;
  return plus.android;
}
export function sdkVersion(): number {
  return Number(bridge()?.getAttribute('android.os.Build$VERSION', 'SDK_INT') || 0);
}
export function permissionGranted(permission: string): boolean | null {
  const a = bridge(); if (!a) return null;
  try {
    if (!sdkVersion()) return null;
    if (sdkVersion() < 23) return true;
    const result = a.invoke(a.runtimeMainActivity(), 'checkSelfPermission', permission);
    return typeof result === 'number' ? result === 0 : null;
  } catch { return null; }
}
export function allFilesGranted(): boolean | null {
  const a = bridge(); if (!a) return null;
  try {
    if (sdkVersion() >= 30) {
      const result = a.invoke('android.os.Environment', 'isExternalStorageManager');
      return typeof result === 'boolean' ? result : null;
    }
    return permissionGranted('android.permission.READ_EXTERNAL_STORAGE');
  } catch { return null; }
}
export function openSystemSettings(kind: 'app' | 'files' | 'battery') {
  const a = bridge(); if (!a) throw new Error('请在 Android 手机中打开系统设置');
  const activity = a.runtimeMainActivity();
  const intent = a.newObject('android.content.Intent', kind === 'files' && sdkVersion() >= 30
    ? 'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION'
    : kind === 'battery' ? 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS' : 'android.settings.APPLICATION_DETAILS_SETTINGS');
  if (kind !== 'battery') a.invoke(intent, 'setData', a.invoke('android.net.Uri', 'parse', 'package:' + a.invoke(activity, 'getPackageName')));
  try { a.invoke(activity, 'startActivity', intent); }
  catch { if (kind !== 'app') openSystemSettings('app'); else throw new Error('无法打开应用设置，请在系统设置中查找 Call Phone'); }
}
export function batteryUnrestricted(): boolean | null {
  const a = bridge(); if (!a) return null;
  try {
    if (!sdkVersion()) return null;
    if (sdkVersion() < 23) return true;
    const context = a.runtimeMainActivity(), manager = a.invoke(context, 'getSystemService', 'power');
    const value = a.invoke(manager, 'isIgnoringBatteryOptimizations', a.invoke(context, 'getPackageName'));
    return typeof value === 'boolean' ? value : null;
  } catch { return null; }
}
export function requestRuntimePermissions(permissions: string[]): Promise<void> {
  const a = bridge(); if (!a || !permissions.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('权限申请未完成，请在“我的”中重试')), 60000);
    a.requestPermissions(permissions, () => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); reject(new Error('无法申请权限，请前往系统应用设置')); });
  });
}
