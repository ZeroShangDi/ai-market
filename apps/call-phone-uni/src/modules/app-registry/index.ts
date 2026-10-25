import pluginPages from '../plugin-pages/catalog.json';
import { hasUnfinishedCall } from '@/services/calls';
import { ensureSession } from '@/services/session';
import { toast } from '@/ui/format';

export type MobileAppId = string;
export type MobileAppType = 'uni' | 'h5';
export interface MobileApp {
  id: MobileAppId;
  name: string;
  description: string;
  summary: string;
  type: MobileAppType;
  route: string;
  icon: 'app-ai' | 'app-phone';
  iconAsset: string;
  color: string;
  background: string;
  category: string;
  defaultFavorite: boolean;
  keywords: readonly string[];
}

// The host owns discovery and navigation; each app keeps its own business pages.
export const mobileApps: readonly MobileApp[] = [
  ...pluginPages.map(page => ({ id: page.id, name: page.name, description: page.summary, summary: page.summary,
    type: 'uni' as const, route: page.route, icon: 'app-ai' as const,
    iconAsset: '', color: '#294fdb', background: '#eef2ff', category: '自动化', defaultFavorite: false, keywords: [page.name] })),
  {
    id: 'ai-assistant',
    name: 'AI 对话',
    description: '写作、问答和内容梳理',
    summary: '写作与问答',
    type: 'uni',
    route: '/pages/ai-chat/index',
    icon: 'app-ai',
    iconAsset: 'apps.ai-assistant.icon',
    color: '#294fdb',
    background: '#eef2ff',
    category: '智能助手',
    defaultFavorite: true,
    keywords: ['AI', '人工智能', '对话', '聊天', '助手', '写作', '邮件', '办公', '总结'],
  },
  {
    id: 'dialer',
    name: '拨号',
    description: '联系客户，记录每一次沟通',
    summary: '拨号与记录',
    type: 'uni',
    route: '/pages/customers/index',
    icon: 'app-phone',
    iconAsset: 'apps.dialer.icon',
    color: '#149877',
    background: '#e8f6f0',
    category: '客户沟通',
    defaultFavorite: true,
    keywords: ['客户', '电话', '通话', '拨号', '跟进', '联系'],
  },
];

export function openMobileApp(id: MobileAppId): boolean {
  const app = mobileApps.find(item => item.id === id);
  if (!app) return false;
  if (hasUnfinishedCall()) {
    toast('请先完成当前通话并保存结果');
    return false;
  }
  if (!ensureSession()) return false;
  // H5 hosting is a separate capability and is not introduced by these entries.
  if (app.type !== 'uni') {
    toast('此应用暂未接入');
    return false;
  }
  uni.navigateTo({ url: app.route });
  return true;
}
