import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import { readFileSync } from "node:fs";

const manifest = readFileSync(new URL("./src/manifest.json", import.meta.url), "utf8");
const versionName = manifest.match(/"versionName"\s*:\s*"([^"]+)"/)?.[1];
if (!versionName) throw new Error("manifest.json 缺少 versionName");

// https://vitejs.dev/config/
export default defineConfig({
  define: { __APP_VERSION_NAME__: JSON.stringify(versionName) },
  plugins: [uni()],
});
