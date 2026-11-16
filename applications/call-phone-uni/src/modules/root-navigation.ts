export type RootTab = 'workbench' | 'agent' | 'mine';

const routes: Record<RootTab, string> = {
  workbench: '/pages/index/index',
  agent: '/pages/agent/index',
  mine: '/pages/mine/index',
};

let navigating = false;

// Each host tab is a root page. Recreate its page stack consistently on App/H5.
export function openRootTab(tab: RootTab) {
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
