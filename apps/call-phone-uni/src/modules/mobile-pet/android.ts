import { createElfAnimation } from './appearance';
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
  if (!intent || !a.invoke(intent, 'resolveActivity', a.invoke(activity, 'getPackageManager'))) throw new Error('此手机未提供悬浮窗设置入口，请在系统应用设置中开启');
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
let view: any, label: any, manager: any, params: any, listener: any, animation: any;
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
    const candidate = a.newObject('android.widget.LinearLayout', activity);
    const portrait = a.newObject('android.widget.ImageView', activity);
    const caption = a.newObject('android.widget.TextView', activity);
    if (!candidate || !portrait || !caption || !manager) throw new Error('无法创建手机宠原生视图');
    invoke(candidate, 'setOrientation', 1);
    invoke(candidate, 'setGravity', 17);
    animation = createElfAnimation(a, invoke(activity, 'getResources'));
    invoke(portrait, 'setImageDrawable', animation);
    invoke(candidate, 'addView', portrait, a.newObject('android.widget.LinearLayout$LayoutParams', dp(104), dp(104)));
    const background = a.newObject('android.graphics.drawable.GradientDrawable');
    invoke(background, 'setColor', -15309132);
    invoke(background, 'setCornerRadius', dp(10));
    invoke(caption, 'setBackground', background);
    invoke(caption, 'setText', '连接中');
    invoke(caption, 'setTextColor', -1); invoke(caption, 'setTextSize', 10);
    invoke(caption, 'setGravity', 17);
    invoke(candidate, 'addView', caption, a.newObject('android.widget.LinearLayout$LayoutParams', dp(88), dp(22)));
    label = caption;
    invoke(candidate, 'setContentDescription', 'Call Phone 手机宠，点击返回，长按关闭');
    const type = Number(a.getAttribute('android.os.Build$VERSION', 'SDK_INT')) >= 26 ? 2038 : 2002;
    params = a.newObject('android.view.WindowManager$LayoutParams', dp(104), dp(128), type, 8 | 32, -3);
    if (!params) throw new Error('无法创建悬浮窗布局参数');
    a.setAttribute(params, 'gravity', 51); a.setAttribute(params, 'x', dp(12)); a.setAttribute(params, 'y', dp(160));
    let x = 0, y = 0, px = 0, py = 0, down = 0, moved = false;
    listener = a.implements('android.view.View$OnTouchListener', { onTouch(_v: any, event: any) {
      const action = Number(invoke(event, 'getAction'));
      if (action === 0) { x = Number(invoke(event, 'getRawX')); y = Number(invoke(event, 'getRawY')); px = Number(a.getAttribute(params, 'x')); py = Number(a.getAttribute(params, 'y')); down = Date.now(); moved = false; }
      else if (action === 2) {
        const dx = Number(invoke(event, 'getRawX')) - x, dy = Number(invoke(event, 'getRawY')) - y;
        if (Math.abs(dx) + Math.abs(dy) > dp(6)) moved = true;
        const metrics = invoke(invoke(activity, 'getResources'), 'getDisplayMetrics');
        a.setAttribute(params, 'x', Math.max(0, Math.min(Number(a.getAttribute(metrics, 'widthPixels')) - dp(104), Math.round(px + dx))));
        a.setAttribute(params, 'y', Math.max(0, Math.min(Number(a.getAttribute(metrics, 'heightPixels')) - dp(148), Math.round(py + dy))));
        if (view) invoke(manager, 'updateViewLayout', view, params);
      } else if (action === 1 && !moved) { if (Date.now() - down > 650) onClose(); else onTap(); }
      return true;
    } });
    invoke(candidate, 'setOnTouchListener', listener);
    invoke(manager, 'addView', candidate, params);
    view = candidate;
  });
  // Window attachment completes after addView; checking in the same UI callback can be premature.
  for (let attempt = 0; attempt < 10; attempt++) {
    if (current !== generation) throw new Error('手机宠显示已取消');
    if (view && android().invoke(view, 'isAttachedToWindow') === true) {
      await ui(() => { if (animation) android().invoke(animation, 'start'); });
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await hideOverlay();
  throw new Error('悬浮窗未挂载，请核对系统悬浮窗权限并连接手机查看原生日志');
}
export async function hideOverlay() {
  generation++;
  if (!view) return;
  await ui(() => {
    if (animation) android().invoke(animation, 'stop');
    if (view) android().invoke(manager, 'removeView', view);
    view = label = manager = params = listener = animation = undefined;
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
