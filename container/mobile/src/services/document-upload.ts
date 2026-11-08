// #ifdef APP-PLUS
import { readDocument } from '@/uni_modules/document-reader';
// #endif
import { chooseAndroidDocument } from './android-document-picker';
export async function chooseDocument() {
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.os.name === 'Android') return chooseAndroidDocument(8 * 1024 * 1024,
    name => !!name && name.length <= 120 && !/[\\/\r\n\x00]/.test(name), (_android, uri, name) => ({name, contentBase64:readDocument(uri)}));
  // #endif
  throw new Error('当前平台暂不支持文档选择');
}
