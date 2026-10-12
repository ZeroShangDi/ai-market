<template>
  <view class="page">
    <view class="wrap"
      ><MobileHeader
        title="工作台"
        action-icon="/static/figma/2-2-imgFrame.svg"
        action-label="扫码连接电脑"
        action-position="right"
        @action="scanComputer" /><PreviewBanner
    />
      <view class="ai-entry" role="button" aria-label="打开 AI 助手" @tap="openAssistant">
        <view class="ai-mark">✦</view>
        <view class="ai-entry-copy">
          <view class="ai-entry-title">AI 助手<text class="ai-entry-tag">预览</text></view>
          <text class="ai-entry-description">理清客户需求，让每次跟进更从容</text>
          <text class="ai-entry-link">{{ hasConversation ? '继续对话' : '开始对话' }} <text>→</text></text>
        </view>
      </view>
    </view>
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
import { computed } from "vue";
import { aiChat } from "@/services/ai-chat";
import { hasUnfinishedCall } from "@/services/calls";
const hasConversation = computed(() => aiChat.state.conversations.some(item => item.messages.length));
function openAssistant() {
  if (hasUnfinishedCall()) return toast("请先完成当前通话并保存结果");
  uni.navigateTo({ url: "/pages/ai-chat/index" });
}
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
.ai-entry {
  margin: 24px 19px 120px;
  padding: 22px 20px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  border: 1px solid #e5eafa;
  border-radius: 22px;
  background: linear-gradient(120deg, #edf2ff, #fff 85%);
  box-shadow: 0 6px 18px rgba(41, 79, 219, .04);
}
.ai-mark { width: 46px; height: 46px; flex-shrink: 0; border-radius: 15px; background: #294fdb; color: white; display: flex; align-items: center; justify-content: center; font-size: 29px; }
.ai-entry-copy { flex: 1; }
.ai-entry-title { display: flex; align-items: center; gap: 8px; font-size: 19px; font-weight: 600; }
.ai-entry-tag { padding: 2px 6px; border-radius: 5px; background: #e5ebff; font-size: 10px; color: #6173b7; font-weight: 400; }
.ai-entry-description { display: block; margin-top: 7px; font-size: 12px; line-height: 1.7; color: #6c778c; }
.ai-entry-link { display: block; margin-top: 16px; font-size: 13px; font-weight: 500; color: #294fdb; }
.ai-entry-link text { margin-left: 6px; }
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
