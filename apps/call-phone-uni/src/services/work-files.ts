import { readDocument } from '@/uni_modules/work-file-receiver';
import { chooseAndroidDocument } from './android-document-picker';
import { request, downloadWorkArtifact } from '@/api/http';

const limit = 8 * 1024 * 1024;
export interface WorkUpload { name: string; content_base64: string }
export async function chooseWorkFile(accept = '', mime = '*/*', readContent = true, supports: (name: string) => boolean = () => true): Promise<WorkUpload | undefined> {
  // #ifdef H5
  if (typeof document !== 'undefined') return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept;
    input.oncancel = () => { input.remove(); resolve(undefined); };
    input.onchange = async () => {
      const file = input.files?.[0]; input.remove(); if (!file) return resolve(undefined);
      try {
        if (!readContent || !supports(file.name)) return resolve({ name: file.name, content_base64: '' });
        if (file.size > limit) throw new Error('文件最多 8 MiB');
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        resolve({ name: file.name, content_base64: btoa(binary) });
      } catch (e) { reject(e); }
    };
    input.style.display = 'none'; document.body.appendChild(input); input.click();
  });
  // #endif
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.os.name === 'Android') return chooseAndroidDocument(readContent ? limit : Number.MAX_SAFE_INTEGER,
    name => !!name && name.length <= 120 && !name.startsWith('.') && !/[/\\\x00-\x1f]/.test(name), (_android, uri, name) => {
      if (!readContent || !supports(name)) return { name, content_base64: '' };
      return { name, content_base64: readDocument(uri) };
    }, mime, name => !readContent || !supports(name));
  // #endif
  throw new Error('当前平台暂不支持原始文件选择');
}
export async function openWorkArtifact(session: string, artifact: { id: string; name: string }) {
  const path = `/api/v1/mobile/work/sessions/${session}/artifacts/${artifact.id}`;
  // #ifdef H5
  if (typeof document !== 'undefined') {
    // The JSON route keeps authentication in the existing refresh/session coordinator.
    const data = await request<{ name: string; content_base64: string }>('GET', path + '/content');
    const binary = atob(data.content_base64), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const link = document.createElement('a'); link.href = url; link.download = data.name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  // #endif
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined') {
    const temporary = await downloadWorkArtifact(path);
    const name = artifact.name.replace(/[\x00-\x1f/\\]/g, '_').slice(-120) || '产物';
    const local = await new Promise<string>((resolve, reject) => plus.io.resolveLocalFileSystemURL(temporary, entry => {
      plus.io.requestFileSystem(plus.io.PRIVATE_DOC, fs => {
        if (!fs.root) return reject(new Error('文件保存失败'));
        fs.root.getDirectory('work-results', { create: true }, directory => entry.copyTo(directory, `${Date.now()}-${name}`,
          result => resolve(result.toLocalURL()), () => reject(new Error('文件保存失败'))), () => reject(new Error('文件保存失败')));
      }, () => reject(new Error('文件保存失败')));
    }, () => reject(new Error('下载文件不可用'))));
    const extension = artifact.name.split('.').pop()?.toLowerCase();
    await new Promise<void>((resolve, reject) => uni.openDocument({ filePath: local, fileType: extension as any, showMenu: true, success: () => resolve(), fail: () => {
      plus.runtime.openFile(local, {}, () => uni.showToast({ title: '文件已保存，设备暂不支持打开此格式', icon: 'none' })); resolve();
    } })); return;
  }
  // #endif
  throw new Error('当前平台暂不支持文件下载');
}

/** Media uses the album picker; unsupported selections are never read or uploaded. */
export function chooseWorkMedia(kind: 'image' | 'video'): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const fail = (error: { errMsg?: string }) => /cancel/i.test(error.errMsg || '') ? resolve(false) : reject(new Error('相册暂不可用，请检查权限后重试'));
    if (kind === 'image') uni.chooseImage({ count: 1, sourceType: ['album'], sizeType: ['original'], success: () => resolve(true), fail });
    else uni.chooseVideo({ sourceType: ['album'], compressed: false, success: () => resolve(true), fail });
  });
}
