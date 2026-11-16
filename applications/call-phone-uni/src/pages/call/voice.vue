<template>
  <view class="call-page">
    <view class="glow glow-a" />
    <view class="glow glow-b" />

    <view class="top">
      <view class="collapse" role="button" aria-label="收起" @tap="hangup">
        <ChatIcon name="back" :size="20" color="rgba(255,255,255,0.9)" />
      </view>
    </view>

    <view class="head">
      <text class="name">{{ peerName }}</text>
      <text class="status">{{ statusLabel }}</text>
    </view>

    <view class="avatar-area">
      <view class="ring r1" /><view class="ring r2" /><view class="ring r3" />
    </view>

    <view class="bottom">
      <view v-if="!incoming" class="controls">
        <view class="ctrl" @tap="muted = !muted">
          <view class="ctrl-btn" :class="{ on: muted }">
            <ChatIcon :name="muted ? 'mic' : 'mute'" :size="26" :color="muted ? '#1a1f2e' : '#fff'" />
          </view>
          <text class="ctrl-label">{{ muted ? '取消静音' : '静音' }}</text>
        </view>

        <view class="ctrl" @tap="speaker = !speaker">
          <view class="ctrl-btn" :class="{ on: speaker }">
            <ChatIcon name="speaker" :size="26" :color="speaker ? '#1a1f2e' : '#fff'" />
          </view>
          <text class="ctrl-label">免提</text>
        </view>

        <view class="ctrl" @tap="hangup">
          <view class="ctrl-btn hangup"><ChatIcon name="hangup" :size="28" color="#fff" /></view>
          <text class="ctrl-label">挂断</text>
        </view>
      </view>

      <view v-else class="controls incoming">
        <view class="ctrl" @tap="reject">
          <view class="ctrl-btn hangup"><ChatIcon name="hangup" :size="28" color="#fff" /></view>
          <text class="ctrl-label">拒绝</text>
        </view>
        <view class="ctrl" @tap="accept">
          <view class="ctrl-btn accept"><ChatIcon name="phone" :size="26" color="#fff" /></view>
          <text class="ctrl-label">接听</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import ChatIcon from '@/components/chat/ChatIcon.vue';
import { clock } from '@/components/chat/format';

const peerName = ref('研究 Agent');
const incoming = ref(false);
const connected = ref(false);
const muted = ref(false);
const speaker = ref(true);
const seconds = ref(0);

let connectTimer: ReturnType<typeof setTimeout> | undefined;
let tickTimer: ReturnType<typeof setInterval> | undefined;

const statusLabel = computed(() => {
  if (connected.value) return clock(seconds.value);
  return incoming.value ? '邀请你语音通话…' : '正在呼叫…';
});

onLoad((options = {}) => {
  if (options.name) peerName.value = decodeURIComponent(options.name);
  incoming.value = options.mode === 'incoming';
  if (!incoming.value) {
    // TODO: 接入 RTC 后改为进房成功后置为已连接，这里仅驱动 UI 演示。
    connectTimer = setTimeout(connect, 1500);
  }
});

onUnmounted(() => {
  clearTimeout(connectTimer);
  clearInterval(tickTimer);
});

function connect() {
  connected.value = true;
  tickTimer = setInterval(() => {
    seconds.value += 1;
  }, 1000);
}

function accept() {
  incoming.value = false;
  connect();
}

function reject() {
  hangup();
}

function hangup() {
  clearTimeout(connectTimer);
  clearInterval(tickTimer);
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/agent/index' }) });
}
</script>

<style scoped lang="scss">
.call-page {
  position: relative;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #fff;
  background: radial-gradient(120% 80% at 50% 0%, #27324a 0%, #171d2b 48%, #0e121b 100%);
}
.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.45;
  pointer-events: none;
}
.glow-a {
  width: 320px;
  height: 320px;
  background: #294fdb;
  left: -120px;
  top: 90px;
}
.glow-b {
  width: 280px;
  height: 280px;
  background: #7b5cff;
  right: -120px;
  bottom: 140px;
}
.top {
  position: relative;
  z-index: 2;
  padding: calc(env(safe-area-inset-top) + 14px) 16px 0;
}
.collapse {
  width: 34px;
  height: 34px;
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-90deg);
}
.head {
  position: relative;
  z-index: 2;
  padding: 46px 20px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
}
.name {
  font-size: 23px;
  font-weight: 500;
  letter-spacing: 0.5px;
}
.status {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
  font-variant-numeric: tabular-nums;
}
.avatar-area {
  position: relative;
  z-index: 2;
  margin-top: 70px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ring {
  position: absolute;
  width: 118px;
  height: 118px;
  border-radius: 50%;
  border: 1px solid rgba(91, 124, 250, 0.35);
  animation: pulse 2.6s ease-out infinite;
}
.r2 { animation-delay: 0.8s; }
.r3 { animation-delay: 1.6s; }
@keyframes pulse {
  0% { transform: scale(0.9); opacity: 0.8; }
  100% { transform: scale(2); opacity: 0; }
}
.bottom {
  position: relative;
  z-index: 2;
  margin-top: auto;
  padding: 0 34px calc(env(safe-area-inset-bottom) + 48px);
}
.controls {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.controls.incoming {
  justify-content: space-around;
  padding: 0 36px;
}
.ctrl {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
}
.ctrl-btn {
  width: 62px;
  height: 62px;
  border-radius: 31px;
  background: rgba(255, 255, 255, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ctrl-btn.on {
  background: #fff;
}
.ctrl-btn.hangup {
  width: 66px;
  height: 66px;
  border-radius: 33px;
  background: #f04438;
  box-shadow: 0 8px 24px rgba(240, 68, 56, 0.35);
}
.ctrl-btn.accept {
  width: 66px;
  height: 66px;
  border-radius: 33px;
  background: #12b76a;
  box-shadow: 0 8px 24px rgba(18, 183, 106, 0.35);
  animation: breathe 1.6s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
.ctrl-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
}
</style>
