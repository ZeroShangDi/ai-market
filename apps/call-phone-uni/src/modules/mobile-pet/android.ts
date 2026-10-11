// Native overlay stays in this module; it is not a webview pretending to be a system window.
function android(): any {
  if (typeof plus === 'undefined' || uni.getSystemInfoSync().platform !== 'android') throw new Error('手机宠目前仅支持 Android');
  return plus.android;
}
export function overlayPermission(): boolean | null {
  try {
    const a = android();
    const sdk = Number(a.getAttribute('android.os.Build$VERSION', 'SDK_INT'));
    if (!sdk) return null;
    if (sdk < 23) return true;
    const value = a.invoke('android.provider.Settings', 'canDrawOverlays', a.runtimeMainActivity());
    return typeof value === 'boolean' ? value : null;
  } catch { return null; }
}
export function openOverlaySettings() {
  const a = android(), activity = a.runtimeMainActivity();
  const intent = a.newObject('android.content.Intent', 'android.settings.action.MANAGE_OVERLAY_PERMISSION');
  a.invoke(intent, 'setData', a.invoke('android.net.Uri', 'parse', 'package:' + a.invoke(activity, 'getPackageName')));
  a.invoke(activity, 'startActivity', intent);
}
function ui<T>(work: () => T): Promise<T> {
  const a = android();
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error('系统悬浮窗操作超时，请返回 App 重试')); }, 8000);
    try {
      a.invoke(a.runtimeMainActivity(), 'runOnUiThread', a.implements('java.lang.Runnable', { run() {
        if (expired) return;
        clearTimeout(timer);
        try { resolve(work()); } catch (e) { reject(e); }
      } }));
    } catch (e) { clearTimeout(timer); reject(e); }
  });
}
let view: any, label: any, manager: any, params: any, listener: any;
let generation = 0;
export async function showOverlay(onTap: () => void, onClose: () => void) {
  if (overlayPermission() !== true) throw new Error('请先允许显示在其他应用上层');
  const current = ++generation;
  await ui(() => {
    if (current !== generation || view) return;
    const a = android(), activity = a.runtimeMainActivity();
    const invoke = (object: any, method: string, ...args: any[]) => a.invoke(object, method, ...args);
    const density = Number(a.getAttribute(invoke(invoke(activity, 'getResources'), 'getDisplayMetrics'), 'density')) || 1;
    const dp = (value: number) => Math.round(value * density);
    manager = invoke(activity, 'getSystemService', 'window');
    const candidate = a.newObject('android.widget.TextView', activity);
    const background = a.newObject('android.graphics.drawable.GradientDrawable');
    invoke(background, 'setColor', -15309132); // teal companion body
    invoke(background, 'setCornerRadius', dp(22));
    invoke(candidate, 'setBackground', background);
    invoke(candidate, 'setText', '◕ ◕\n连接中');
    invoke(candidate, 'setTextColor', -1); invoke(candidate, 'setTextSize', 12);
    invoke(candidate, 'setGravity', 17); invoke(candidate, 'setElevation', dp(6));
    invoke(candidate, 'setContentDescription', 'Call Phone 手机宠，点击返回，长按关闭');
    const type = Number(a.getAttribute('android.os.Build$VERSION', 'SDK_INT')) >= 26 ? 2038 : 2002;
    params = a.newObject('android.view.WindowManager$LayoutParams', dp(68), dp(68), type, 8 | 32, -3);
    a.setAttribute(params, 'gravity', 51); a.setAttribute(params, 'x', dp(12)); a.setAttribute(params, 'y', dp(160));
    let x = 0, y = 0, px = 0, py = 0, down = 0, moved = false;
    listener = a.implements('android.view.View$OnTouchListener', { onTouch(_v: any, event: any) {
      const action = Number(invoke(event, 'getAction'));
      if (action === 0) { x = Number(invoke(event, 'getRawX')); y = Number(invoke(event, 'getRawY')); px = Number(a.getAttribute(params, 'x')); py = Number(a.getAttribute(params, 'y')); down = Date.now(); moved = false; }
      else if (action === 2) {
        const dx = Number(invoke(event, 'getRawX')) - x, dy = Number(invoke(event, 'getRawY')) - y;
        if (Math.abs(dx) + Math.abs(dy) > dp(6)) moved = true;
        const metrics = invoke(invoke(activity, 'getResources'), 'getDisplayMetrics');
        a.setAttribute(params, 'x', Math.max(0, Math.min(Number(a.getAttribute(metrics, 'widthPixels')) - dp(68), px + dx)));
        a.setAttribute(params, 'y', Math.max(0, Math.min(Number(a.getAttribute(metrics, 'heightPixels')) - dp(88), py + dy)));
        if (view) invoke(manager, 'updateViewLayout', view, params);
      } else if (action === 1 && !moved) { if (Date.now() - down > 650) onClose(); else onTap(); }
      return true;
    } });
    invoke(candidate, 'setOnTouchListener', listener);
    invoke(manager, 'addView', candidate, params);
    if (invoke(candidate, 'isAttachedToWindow') !== true) throw new Error('系统未显示悬浮手机宠，请检查悬浮窗权限');
    view = candidate; label = candidate;
  });
}
export async function hideOverlay() {
  generation++;
  if (!view) return;
  await ui(() => {
    if (view) android().invoke(manager, 'removeView', view);
    view = label = manager = params = listener = undefined;
  });
}
export function setOverlayText(text: string) {
  if (!view) return Promise.resolve();
  return ui(() => { if (label) android().invoke(label, 'setText', text); });
}
export function bringToFront() {
  const a = android(), activity = a.runtimeMainActivity();
  const intent = a.invoke(a.invoke(activity, 'getPackageManager'), 'getLaunchIntentForPackage', a.invoke(activity, 'getPackageName'));
  if (!intent) throw new Error('无法返回应用，请点击桌面图标');
  a.invoke(intent, 'addFlags', 0x10000000 | 0x20000);
  a.invoke(activity, 'startActivity', intent);
}
