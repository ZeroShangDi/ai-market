let choosing = false;
interface AndroidFileBridge {
  runtimeMainActivity(): any;
  importClass(value: unknown): any;
  invoke(receiver: unknown, method: string, ...args: unknown[]): any;
  newObject(className: string, ...args: unknown[]): any;
}
/** Android Storage Access Framework; passes only the URI string to the native reader; never bridge mutable byte arrays. */
export function chooseAndroidDocument<T>(maxSize: number, acceptName: (name: string) => boolean, read: (android: AndroidFileBridge, uri: string, name: string) => T, mime = '*/*', metadataOnly: boolean | ((name: string) => boolean) = false): Promise<T | undefined> {
  if (choosing) return Promise.reject(new Error('文件选择器已打开，请先完成选择'));
  if (typeof plus === 'undefined' || !plus.android) return Promise.reject(new Error('系统文件选择器不可用'));
  choosing = true;
  return new Promise((resolve, reject) => {
    const android = plus.android as unknown as AndroidFileBridge;
    let activity: any;
    try { activity = android.runtimeMainActivity(); if (!activity) throw new Error('Activity unavailable'); android.importClass(activity); }
    catch { choosing = false; reject(new Error('系统文件选择器不可用')); return; }
    const previous = activity.onActivityResult;
    const requestCode = 41263;
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const restore = () => { clearTimeout(deadline); choosing = false; if (activity.onActivityResult === handler) activity.onActivityResult = previous; };
    function handler(code: number, resultCode: number, result: any) {
      if (code !== requestCode) { if (typeof previous === 'function') previous.call(activity, code, resultCode, result); return; }
      if (settled) return;
      settled = true;
      restore();
      if (resultCode !== -1 || !result) { resolve(undefined); return; }
      let cursor: any;
      try {
        const uri = android.invoke(result, 'getData');
        if (!uri) throw new Error('文件地址无法读取，请重新选择');
        const resolver = android.invoke(activity, 'getContentResolver');
        cursor = android.invoke(resolver, 'query', uri, null, null, null, null);
        let name = '', size = -1;
        if (cursor && android.invoke(cursor, 'moveToFirst')) {
          const nameColumn = Number(android.invoke(cursor, 'getColumnIndex', '_display_name'));
          const sizeColumn = Number(android.invoke(cursor, 'getColumnIndex', '_size'));
          if (nameColumn >= 0) name = String(android.invoke(cursor, 'getString', nameColumn) || '');
          if (sizeColumn >= 0 && !android.invoke(cursor, 'isNull', sizeColumn)) size = Number(android.invoke(cursor, 'getLong', sizeColumn));
        }
        if (!acceptName(name)) throw new Error('文件类型或名称无效');
        if (typeof metadataOnly === 'function' ? metadataOnly(name) : metadataOnly) { resolve(read(android, '', name)); return; }
        if (!Number.isFinite(size) || size < 0) throw new Error('无法确认文件大小，请保存到本机后重选');
        if (size > maxSize) throw new Error(`文件最多 ${maxSize / 1024} KiB，请缩减内容`);
        resolve(read(android, String(android.invoke(uri, 'toString')), name));
      } catch (reason) { reject(reason instanceof Error ? reason : new Error('文件读取失败')); }
      finally { for (const handle of [cursor]) if (handle) { try { android.invoke(handle, 'close'); } catch { /* Already closed by the reader. */ } } }
    }
    try {
      activity.onActivityResult = handler;
      const intent = android.newObject('android.content.Intent', 'android.intent.action.OPEN_DOCUMENT');
      if (!intent) throw new Error('Intent unavailable');
      android.invoke(intent, 'addCategory', 'android.intent.category.OPENABLE');
      android.invoke(intent, 'setType', mime);
      deadline = setTimeout(() => { settled = true; restore(); reject(new Error('文件选择超时，请重新选择')); }, 300000);
      android.invoke(activity, 'startActivityForResult', intent, requestCode);
    } catch { settled = true; restore(); reject(new Error('系统文件选择器无法打开')); }
  });
}
