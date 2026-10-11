<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { checkUpdates } from "@/services/updates";
import {
  startForeground,
  stopForeground,
  networkRestored,
} from "@/services/foreground";
onLaunch(() =>
  uni.onNetworkStatusChange((status) => {
    if (status.isConnected) networkRestored();
  }),
);
onShow(() => {
  startForeground();
  void checkUpdates();
});
onHide(stopForeground);
</script>
<style lang="scss">
page {
  background: #f7f8fc;
  color: #1a1f2e;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "PingFang SC",
    sans-serif;
}
view,
text {
  box-sizing: border-box;
}
</style>
