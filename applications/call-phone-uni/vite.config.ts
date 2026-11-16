import {sameOriginHost} from './shared/proxy-origin';
import { defineConfig, loadEnv } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import { readFileSync } from "node:fs";

const manifest = readFileSync(new URL("./src/manifest.json", import.meta.url), "utf8");
const versionName = manifest.match(/"versionName"\s*:\s*"([^"]+)"/)?.[1];
if (!versionName) throw new Error("manifest.json 缺少 versionName");

// Both development and the tailnet-only preview share the same public routes.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isolateCookies = (proxy: any) => {
    proxy.on('proxyReq', (request: any, incoming: any) => {
      request.removeHeader('cookie');
      const origin=incoming.headers.origin;
      // Same-origin browser traffic becomes an authenticated server-to-server request.
      if(sameOriginHost(origin,incoming.headers.host))request.removeHeader('origin');
    });
    proxy.on('proxyRes', (response: any) => delete response.headers['set-cookie']);
  };
  return {
    define: { __APP_VERSION_NAME__: JSON.stringify(versionName) },
    plugins: [uni()],
    server: {
      host: '127.0.0.1', port: 5192, strictPort: true,
      proxy: {
        '/admin-api': {
          target: env.CONTAINER_UPSTREAM || 'http://127.0.0.1:48090',
          configure: isolateCookies,
        },
        '/mobile-host': {
          target: env.MOBILE_HOST_UPSTREAM || 'http://127.0.0.1:5193',
          timeout: 180000, proxyTimeout: 180000,
          configure: isolateCookies,
        },
      },
    },
  };
});
