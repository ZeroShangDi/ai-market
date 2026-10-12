// Native.js may return null/undefined without throwing. Keep probe failures distinct from denial.
const probeFailures = new Map<string, string>();
export function permissionDiagnostics() { return [...probeFailures.values()].join('；'); }
function failed(key: string, message: string) {
  if (probeFailures.get(key) !== message) console.warn('[permission-probe]', key, message);
  probeFailures.set(key, message);
}
export function bridge(): any | undefined {
  try {
    if (typeof plus === 'undefined') {
      failed('bridge', '原生环境尚未就绪，请在手机 App 中重新检查'); return;
    }
    if (uni.getSystemInfoSync().platform !== 'android') {
      failed('bridge', '当前运行环境不支持 Android 权限检查'); return;
    }
    if (!plus.android) {
      failed('bridge', '当前运行环境缺少 Android 原生能力，请检查运行基座'); return;
    }
    probeFailures.delete('bridge');
    return plus.android;
  } catch { failed('bridge', '无法读取手机运行环境，请重新检查或更新运行基座'); return; }
}
export function nativeBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || value === 'true' || value === '1') return true;
  if (value === false || value === 0 || value === 'false' || value === '0') return false;
  return null;
}
function nativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
export function sdkVersion(): number {
  const a = bridge(); if (!a) return 0;
  // Try the imported class as an alternate access path when class-name lookup fails.
  try {
    const value = nativeInteger(a.getAttribute('android.os.Build$VERSION', 'SDK_INT'));
    if (value !== null && value > 0) { probeFailures.delete('sdk'); return value; }
  } catch { /* Try the imported class below. */ }
  try {
    const version = a.importClass('android.os.Build$VERSION');
    const value = nativeInteger(version?.SDK_INT ?? version?.plusGetAttribute?.('SDK_INT'));
    if (value !== null && value > 0) { probeFailures.delete('sdk'); return value; }
  } catch { /* Leave version unknown; never assume an old Android version. */ }
  failed('sdk', '无法读取 Android 版本，特殊权限状态暂无法确认');
  return 0;
}
export function specialPermission(key: string, query: (a: any) => unknown): boolean | null {
  const a = bridge();
  if (!a) return null;
  try {
    const value = nativeBoolean(query(a));
    if (value !== null) { probeFailures.delete(key); return value; }
  } catch { /* Native bridge failure is not a permission denial. */ }
  failed(key, key + '检查未返回有效结果，请重新检查或在系统设置中核对');
  return null;
}
export function permissionGranted(permission: string): boolean | null {
  const a = bridge(); if (!a) return null;
  // A failed SDK query must not prevent independent permission checks.
  try {
    const activity = a.runtimeMainActivity();
    let result = nativeInteger(a.invoke(activity, 'checkSelfPermission', permission));
    if (result !== 0 && result !== -1) result = nativeInteger(a.invoke(activity, 'checkCallingOrSelfPermission', permission));
    if (result === 0 || result === -1) { probeFailures.delete(permission); return result === 0; }
  } catch { /* Fall back to the public uni API for the two permissions it exposes. */ }
  const field = permission === 'android.permission.CAMERA' ? 'cameraAuthorized'
    : permission === 'android.permission.RECORD_AUDIO' ? 'microphoneAuthorized' : undefined;
  if (field) {
    try {
      const setting = uni.getAppAuthorizeSetting();
      const value = setting[field];
      if (value === 'authorized' || value === 'denied' || value === 'config error') {
        probeFailures.delete(permission); return value === 'authorized';
      }
    } catch { /* API may be absent in an older base. */ }
  }
  failed(permission, permission.split('.').pop() + '状态读取失败，请重新检查或打开应用权限设置');
  return null;
}
export function allFilesGranted(): boolean | null {
  const sdk = sdkVersion();
  if (!sdk) return null;
  if (sdk >= 30) return specialPermission('录音文件访问', a => a.invoke('android.os.Environment', 'isExternalStorageManager'));
  return permissionGranted('android.permission.READ_EXTERNAL_STORAGE');
}
function openNativeSettings(kind: 'app' | 'files' | 'battery') {
  const a = bridge(); if (!a) throw new Error('请在 Android 手机中打开系统设置');
  try {
    const activity = a.runtimeMainActivity();
    const intent = a.newObject('android.content.Intent', kind === 'files' && sdkVersion() >= 30
      ? 'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION'
      : kind === 'battery' ? 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS' : 'android.settings.APPLICATION_DETAILS_SETTINGS');
    if (!intent) throw new Error('设置入口不可用');
    if (kind !== 'battery') a.invoke(intent, 'setData', a.invoke('android.net.Uri', 'parse', 'package:' + a.invoke(activity, 'getPackageName')));
    // resolveActivity can be filtered by Android package visibility even when launch is allowed.
    a.invoke(activity, 'startActivity', intent);
  } catch {
    if (kind !== 'app') openSystemSettings('app');
    else throw new Error('无法打开应用设置，请在系统设置中查找 Call Phone');
  }
}
export function openSystemSettings(kind: 'app' | 'files' | 'battery') {
  if (!bridge()) throw new Error('请在 Android 手机中打开系统设置');
  if (kind === 'app' && typeof uni.openAppAuthorizeSetting === 'function') {
    try {
      uni.openAppAuthorizeSetting({ fail: () => {
        try { openNativeSettings('app'); }
        catch (e) { uni.showToast({ title: (e as Error).message, icon: 'none' }); }
      } });
      return;
    } catch { /* Older app engines can expose an unsupported API stub. */ }
  }
  openNativeSettings(kind);
}
export function batteryUnrestricted(): boolean | null {
  const sdk = sdkVersion();
  if (!sdk) return null;
  if (sdk < 23) return true;
  return specialPermission('电池优化', a => {
    const context = a.runtimeMainActivity(), manager = a.invoke(context, 'getSystemService', 'power');
    return a.invoke(manager, 'isIgnoringBatteryOptimizations', a.invoke(context, 'getPackageName'));
  });
}
export function requestRuntimePermissions(permissions: string[]): Promise<void> {
  const a = bridge(); if (!a || !permissions.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('权限申请未完成，请在“我的”中重试')), 60000);
    try { a.requestPermissions(permissions, (result: any) => {
      clearTimeout(timer);
      if (result?.deniedAlways?.length) reject(new Error('部分权限已被永久拒绝，请在系统应用设置中手动开启'));
      else if (result?.deniedPresent?.length) reject(new Error('部分权限尚未允许，可再次申请或前往系统应用设置'));
      else if (permissions.every(permission => result?.granted?.includes(permission))) resolve();
      else reject(new Error('系统未返回完整授权结果，请重新检查权限'));
    }, () => { clearTimeout(timer); reject(new Error('无法申请权限，请前往系统应用设置')); });
    } catch { clearTimeout(timer); reject(new Error('权限申请接口不可用，请打开应用权限设置')); }
  });
}
