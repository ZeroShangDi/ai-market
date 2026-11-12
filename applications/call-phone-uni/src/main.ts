import { createSSRApp } from "vue";
import App from "./App.vue";
import { logger, runtimeFailure } from '@/services/logger';
export function createApp() {
  const app = createSSRApp(App);
  const previousErrorHandler = app.config.errorHandler;
  app.config.errorHandler = (reason, instance, phase) => {
    logger.error('runtime', 'vue.error', { ...runtimeFailure(reason), phase });
    previousErrorHandler?.(reason, instance, phase);
  };
  return {
    app,
  };
}
