<template>
  <view class="page">
    <view class="wrap"
      ><MobileHeader
        title="工作台"
        action-icon="/static/figma/2-2-imgFrame.svg"
        action-label="扫码连接电脑"
        action-position="left"
        @action="scanComputer" /><PreviewBanner
    /></view>
    <TabBar current="workbench" />
  </view>
</template>
<script setup lang="ts">
import { scanAndPair } from "@/services/pairing-actions";
import { toast } from "@/ui/format";
import { messageOf } from "@/api/http";
import MobileHeader from "@/components/MobileHeader.vue";
import TabBar from "@/components/TabBar.vue";
import PreviewBanner from "@/components/PreviewBanner.vue";
async function scanComputer() {
  try {
    if (await scanAndPair()) toast("手机已配对，电脑外呼将自动拨打");
  } catch (e) {
    toast(messageOf(e));
  }
}
</script>
<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: #f7f8fc;
}
.wrap {
  max-width: 500px;
  margin: auto;
}
.head {
  height: 46px;
  margin: 0 19px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 25px;
  font-weight: 500;
}
.action {
  width: 36px;
  height: 36px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
}
.action image {
  width: 20px;
  height: 20px;
}
</style>
