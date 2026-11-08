<script setup lang="ts">
import { onShow,onHide,onError,onUnhandledRejection } from '@dcloudio/uni-app';
import { resumeLogging,pauseLogging,logger,runtimeFailure } from './services/logger';
import { checkUpdates } from './services/updates';
onShow(()=>{
  resumeLogging();
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.os.name === 'Android') void checkUpdates();
  // #endif
});
onHide(pauseLogging);
onError(reason=>logger.error('runtime','uncaught',runtimeFailure(reason)));
onUnhandledRejection(event=>logger.error('runtime','unhandled-rejection',runtimeFailure(event.reason)));
</script>
<style lang="scss">page{background:#f7f8fc;color:#1a1f2e;font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}view,text{box-sizing:border-box}button::after{border:0}</style>
