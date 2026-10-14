import { hasUnfinishedCall } from '@/services/calls';

export type RootTab = 'workbench' | 'apps' | 'mine';

const routes: Record<RootTab, string> = {
  workbench: '/pages/index/index',
  apps: '/pages/apps/index',
  mine: '/pages/mine/index',
};

let navigating = false;

// Each host tab is a root page. Recreate its page stack consistently on App/H5.
export function openRootTab(tab: RootTab) {
  if (hasUnfinishedCall()) {
    uni.showToast({ title: '请先完成当前通话并保存结果', icon: 'none' });
    return;
  }
  if (navigating) return;
  navigating = true;
  const failed = () => uni.showToast({ title: '页面打开失败，请重试', icon: 'none' });
  try {
    uni.reLaunch({
      url: routes[tab],
      fail: failed,
      complete() { navigating = false; },
    });
  } catch {
    navigating = false;
    failed();
  }
}
