/// <reference types="vite/client" />

interface ImportMetaEnv {
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
