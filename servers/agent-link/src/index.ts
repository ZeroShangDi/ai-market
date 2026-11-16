export { createPhoneServer, lanAddress } from './server.js';
export { PhoneStore } from './store.js';
export { PairingSessions } from './pairing.js';
export { qrSvg } from './qr.js';
export type { PhoneLink, PhoneLinkOptions, StoredMessage } from './types.js';

import { createPhoneServer } from './server.js';

/**
 * 创建一个手机配对通道。宿主只关心 onMessage（手机→Agent）与 send（Agent→手机）。
 */
export function createPhoneLink(options: import('./types.js').PhoneLinkOptions): import('./types.js').PhoneLink {
  return createPhoneServer(options);
}
