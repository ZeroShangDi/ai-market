let saving = false;
/** Save to a user-chosen Android document, without broad storage permissions. */
export function saveAndroidLog(name: string, content: string): Promise<boolean> {
  if (saving) return Promise.reject(new Error('日志保存窗口已打开'));
  if (typeof plus === 'undefined' || !plus.android) return Promise.reject(new Error('请在 Android App 中导出日志'));
  saving = true;
  return new Promise((resolve, reject) => {
    const a: any = plus.android;
    let activity: any, previous: any, timeout: ReturnType<typeof setTimeout>;
    const requestCode = 41264;
    let settled = false;
    function restore() {
      clearTimeout(timeout); saving = false;
      if (activity?.onActivityResult === handler) activity.onActivityResult = previous;
    }
    function handler(code: number, resultCode: number, result: any) {
      if (code !== requestCode) { if (typeof previous === 'function') previous.call(activity, code, resultCode, result); return; }
      if (settled) return;
      settled = true; restore();
      if (resultCode !== -1 || !result) { resolve(false); return; }
      let stream: any, writer: any, resolver: any, uri: any;
      try {
        uri = a.invoke(result, 'getData');
        if (!uri) throw new Error('Missing document URI');
        resolver = a.invoke(activity, 'getContentResolver');
        stream = a.invoke(resolver, 'openOutputStream', uri, 'wt');
        if (!stream) throw new Error('Missing output stream');
        writer = a.newObject('java.io.OutputStreamWriter', stream, 'UTF-8');
        a.invoke(writer, 'write', content); a.invoke(writer, 'flush'); a.invoke(writer, 'close');
        writer = stream = undefined; resolve(true);
      } catch {
        if (uri && resolver) { try { a.invoke(resolver, 'delete', uri, null, null); } catch { /* Provider may not support deletion. */ } }
        reject(new Error('日志保存失败，请重新选择本机可写的位置'));
      } finally {
        for (const handle of [writer, stream]) if (handle) { try { a.invoke(handle, 'close'); } catch { /* Best effort after a write failure. */ } }
      }
    }
    try {
      activity = a.runtimeMainActivity(); a.importClass(activity); previous = activity.onActivityResult;
      activity.onActivityResult = handler;
      const intent = a.newObject('android.content.Intent', 'android.intent.action.CREATE_DOCUMENT');
      a.invoke(intent, 'addCategory', 'android.intent.category.OPENABLE');
      a.invoke(intent, 'setType', 'text/plain'); a.invoke(intent, 'putExtra', 'android.intent.extra.TITLE', name);
      timeout = setTimeout(() => { settled = true; restore(); reject(new Error('日志保存超时，请重新导出')); }, 300000);
      a.invoke(activity, 'startActivityForResult', intent, requestCode);
    } catch { settled = true; restore(); reject(new Error('无法打开系统日志保存窗口')); }
  });
}
export async function downloadLog(name: string, content: string): Promise<boolean> {
  // #ifdef H5
  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = name;
    try { document.body.appendChild(link); link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return true;
  }
  // #endif
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.os.name === 'Android') return saveAndroidLog(name, content);
  // #endif
  throw new Error('当前平台暂不支持日志下载');
}

/** Opening the chooser confirms handoff only, not delivery by the selected app. */
export async function shareLog(name: string, content: string): Promise<'shared' | 'downloaded'> {
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.os.name === 'Android') {
    const { shareTextDocument } = await import('@/uni_modules/work-file-receiver');
    await new Promise<void>((resolve, reject) => shareTextDocument(name.replace(/\.jsonl$/, '.txt'), content, error => error ? reject(new Error(error)) : resolve()));
    return 'shared';
  }
  // #endif
  await downloadLog(name, content);
  return 'downloaded';
}
