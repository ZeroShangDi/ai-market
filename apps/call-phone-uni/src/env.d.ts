/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPDATE_MANIFEST_URL?: string;
  readonly VITE_UPDATE_PUBLIC_KEY?: string;
  readonly VITE_UPDATE_DOWNLOAD_ORIGINS?: string;
  readonly VITE_UPDATE_CHANNEL?: string;
  readonly VITE_CUSTOMER_TENANT_ID?: string;
  readonly VITE_MOBILE_MOCK?: string;
  readonly VITE_CUSTOMER_API_BASE_URL?: string;
}
declare const plus: any;

declare module "*.vue" {
  import { DefineComponent } from "vue";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
