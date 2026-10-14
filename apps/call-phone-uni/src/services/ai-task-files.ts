import type { AgentArtifact, AgentAttachment } from '@/types/ai-task';
import { validateTaskAttachment } from './ai-task';
import { chooseAndroidTaskAttachment } from './ai-task-android-file';

export async function chooseTaskAttachment(): Promise<AgentAttachment | undefined> {
  // #ifdef H5
  if (typeof document !== 'undefined') return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.txt,.md,text/plain,text/markdown'; input.style.display = 'none';
    document.body.appendChild(input);
    input.oncancel = () => { input.remove(); resolve(undefined); };
    input.onchange = async () => {
      const file = input.files?.[0]; input.remove();
      if (!file) return resolve(undefined);
      try {
        if (file.size > 65536) throw new Error('资料最多 64 KiB，请缩减内容');
        let content: string;
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
        catch { throw new Error('文件不是有效 UTF-8 文本，请转换编码或粘贴资料'); }
        const attachment = { name: file.name, content };
        validateTaskAttachment(attachment); resolve(attachment);
      } catch (reason) { reject(reason); }
    };
    input.click();
  });
  // #endif
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.os.name === 'Android') return chooseAndroidTaskAttachment();
  if (typeof plus !== 'undefined' && typeof uni.chooseFile === 'function') return new Promise((resolve, reject) => {
    uni.chooseFile({ count: 1, type: 'all', extension: ['txt', 'md'], success: result => {
      const file = (Array.isArray(result.tempFiles) ? result.tempFiles[0] : result.tempFiles) as { path?: string; name?: string; size: number } | undefined;
      if (!file || !file.path) return reject(new Error('未能读取文件，请使用粘贴资料'));
      if (file.size > 65536) return reject(new Error('资料最多 64 KiB，请缩减内容'));
      plus.io.resolveLocalFileSystemURL(file.path, entry => {
        if (!entry.isFile) return reject(new Error('请选择文本文件'));
        (entry as unknown as PlusIoFileEntry).file(local => {
          const reader = new plus.io.FileReader();
          reader.onloadend = () => {
            try {
              if (String(reader.result || '').includes('\uFFFD')) throw new Error('文件编码无法可靠读取，请使用 UTF-8 文件或粘贴资料');
              const attachment = { name: file.name || entry.name || '资料.txt', content: String(reader.result || '') };
              validateTaskAttachment(attachment); resolve(attachment);
            } catch (reason) { reject(reason); }
          };
          reader.onerror = () => reject(new Error('文件读取失败，请使用粘贴资料'));
          reader.readAsText(local, 'utf-8');
        }, () => reject(new Error('文件读取失败，请使用粘贴资料')));
      }, () => reject(new Error('文件读取失败，请使用粘贴资料')));
    }, fail: reason => {
      if (/cancel/i.test(reason.errMsg || '')) resolve(undefined);
      else reject(new Error('当前平台无法选择文件，请使用粘贴资料'));
    } });
  });
  // #endif
  throw new Error('当前平台无法选择文件，请使用粘贴资料');
}

export async function saveTaskArtifact(artifact: AgentArtifact): Promise<void> {
  const name = artifact.name.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-120) || '跟进建议.md';
  // #ifdef H5
  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mime_type || 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  // #endif
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined') {
    const path = await new Promise<string>((resolve, reject) => {
      plus.io.requestFileSystem(plus.io.PRIVATE_DOC, fs => {
        if (!fs.root) return reject(new Error('结果保存失败，请复制内容'));
        fs.root.getDirectory('ai-task-results', { create: true }, directory => {
        directory.getFile(`${Date.now()}-${name}`, { create: true, exclusive: true }, file => file.createWriter(writer => {
          writer.onwrite = () => resolve(file.toLocalURL());
          writer.onerror = () => reject(new Error('结果保存失败，请复制内容')); writer.write(artifact.content);
        }, () => reject(new Error('结果保存失败，请复制内容'))), () => reject(new Error('结果保存失败，请复制内容')));
        }, () => reject(new Error('结果保存失败，请复制内容')));
      }, () => reject(new Error('结果保存失败，请复制内容')));
    });
    plus.runtime.openFile(path, {}, () => uni.showToast({ title: '已保存，未找到文本阅读器；可复制结果', icon: 'none' }));
    return;
  }
  // #endif
  throw new Error('当前平台暂不支持保存文件，请复制结果内容');
}
