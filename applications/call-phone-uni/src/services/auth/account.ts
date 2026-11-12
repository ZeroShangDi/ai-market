import {settings,saveSettings,signIn} from '@/platform';
import {resolveTenant} from '../login';
import type {LoginProvider,AccountCredentials} from './types';
export async function prepareAccountLogin() {
  const tenant = await resolveTenant(import.meta.env.VITE_LOGIN_TENANT_NAME || '容器');
  if (tenant !== settings.tenantId) saveSettings(settings.baseUrl, tenant);
}
export const accountLogin: LoginProvider<AccountCredentials> = {
  id: 'account',
  async authenticate(credentials) {
    await prepareAccountLogin();
    await signIn(credentials.username, credentials.password, credentials.captchaVerification);
  },
};
