<template>
  <view class="call-page">
    <view class="remote">
      <view class="glow glow-a" /><view class="glow glow-b" />
      <view class="remote-center">
        <ChatAvatar :name="peerName" :color="peerColor" :size="92" :radius="26" />
      </view>
    </view>

    <view class="local" :class="{ hidden: !connected || !cameraOn }">
      <ChatAvatar name="我" color="#294fdb" :size="44" :radius="13" />
    </view>

    <view class="back-wrap">
      <view class="collapse" role="button" aria-label="收起" @tap="hangup">
        <ChatIcon name="back" :size="20" color="rgba(255,255,255,0.9)" />
      </view>
    </view>

    <view class="top">
      <view class="head">
        <text class="name">{{ peerName }}</text>
        <text class="status">{{ statusLabel }}</text>
      </view>
    </view>

    <view class="bottom">
      <view v-if="!incoming" class="controls">
        <view class="ctrl" @tap="muted = !muted">
          <view class="ctrl-btn" :class="{ on: muted }">
            <ChatIcon :name="muted ? 'mic' : 'mute'" :size="24" :color="muted ? '#1a1f2e' : '#fff'" />
          </view>
          <text class="ctrl-label">{{ muted ? '取消静音' : '静音' }}</text>
        </view>

        <view class="ctrl" @tap="hangup">
          <view class="ctrl-btn hangup"><ChatIcon name="hangup" :size="28" color="#fff" /></view>
          <text class="ctrl-label">挂断</text>
        </view>

        <view class="ctrl" @tap="cameraOn = !cameraOn">
          <view class="ctrl-btn" :class="{ on: !cameraOn }">
            <ChatIcon name="video" :size="24" :color="cameraOn ? '#fff' : '#1a1f2e'" />
          </view>
          <text class="ctrl-label">{{ cameraOn ? '关摄像头' : '开摄像头' }}</text>
        </view>

        <view class="ctrl" @tap="switchCamera">
          <view class="ctrl-btn"><ChatIcon name="switchCamera" :size="24" color="#fff" /></view>
          <text class="ctrl-label">翻转</text>
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
import ChatAvatar from '@/components/chat/ChatAvatar.vue';
import ChatIcon from '@/components/chat/ChatIcon.vue';
import { clock } from '@/components/chat/format';

const peerName = ref('研究 Agent');
const peerColor = ref('#5b7cfa');
const incoming = ref(false);
const connected = ref(false);
const muted = ref(false);
const cameraOn = ref(true);
const seconds = ref(0);

let connectTimer: ReturnType<typeof setTimeout> | undefined;
let tickTimer: ReturnType<typeof setInterval> | undefined;

const statusLabel = computed(() => {
  if (connected.value) return clock(seconds.value);
  return incoming.value ? '邀请你视频通话…' : '正在等待对方接受邀请…';
});

onLoad((options = {}) => {
  if (options.name) peerName.value = decodeURIComponent(options.name);
  if (options.color) peerColor.value = decodeURIComponent(options.color);
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

function switchCamera() {
  uni.showToast({ title: '切换摄像头待接入', icon: 'none' });
}
</script>

<style scoped lang="scss">
.call-page {
  position: relative;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #0d1119;
  color: #fff;
}
.remote {
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, #1b2735 0%, #223a55 48%, #141e30 100%);
  overflow: hidden;
}
.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.5;
}
.glow-a {
  width: 300px;
  height: 300px;
  background: #294fdb;
  left: -90px;
  top: 120px;
}
.glow-b {
  width: 260px;
  height: 260px;
  background: #7b5cff;
  right: -80px;
  bottom: 140px;
}
.remote-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
}
.local {
  position: absolute;
  right: 14px;
  top: calc(env(safe-area-inset-top) + 78px);
  width: 84px;
  height: 122px;
  border-radius: 16px;
  background: rgba(23, 31, 46, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
  transition: opacity 0.2s;
  backdrop-filter: blur(6px);
}
.local.hidden {
  opacity: 0;
}
.back-wrap {
  position: absolute;
  z-index: 2;
  top: calc(env(safe-area-inset-top) + 14px);
  left: 16px;
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
.top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: calc(env(safe-area-inset-top) + 18px) 20px 0;
  display: flex;
  justify-content: center;
}
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
}
.name {
  font-size: 18px;
  font-weight: 500;
}
.status {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  font-variant-numeric: tabular-nums;
}
.bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  padding: 0 16px calc(env(safe-area-inset-bottom) + 32px);
  background: linear-gradient(to top, rgba(5, 8, 14, 0.66), transparent);
}
.controls {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.controls.incoming {
  justify-content: space-around;
  padding: 0 44px;
}
.ctrl {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}
.ctrl-btn {
  width: 54px;
  height: 54px;
  border-radius: 27px;
  background: rgba(255, 255, 255, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ctrl-btn.on {
  background: #fff;
}
.ctrl-btn.hangup {
  width: 60px;
  height: 60px;
  border-radius: 30px;
  background: #f04438;
  box-shadow: 0 8px 24px rgba(240, 68, 56, 0.38);
}
.ctrl-btn.accept {
  width: 60px;
  height: 60px;
  border-radius: 30px;
  background: #12b76a;
  box-shadow: 0 8px 24px rgba(18, 183, 106, 0.32);
  animation: breathe 1.6s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
.ctrl-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
}
</style>
