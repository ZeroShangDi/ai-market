<template>
  <view v-if="message.type === 'time'" class="time-tip">
    <text>{{ chatTime(message.time) }}</text>
  </view>

  <view v-else-if="message.type === 'system'" class="system-tip">
    <text>{{ message.text }}</text>
  </view>

  <view v-else class="row" :class="message.side">
    <ChatAvatar
      :name="message.side === 'me' ? meName : peer.name"
      :color="message.side === 'me' ? meColor : peer.color"
      :src="message.side === 'me' ? '' : peer.avatar"
      :size="34"
      :radius="10"
    />

    <view class="content" @longpress="$emit('longpress', message)">
      <view v-if="message.type === 'text'" class="bubble" :class="{ self: message.side === 'me' }">
        <text class="text">{{ message.text }}</text>
      </view>

      <image
        v-else-if="message.type === 'image'"
        class="msg-image"
        :src="message.src"
        mode="widthFix"
        @tap="$emit('preview', message)"
      />

      <view
        v-else-if="message.type === 'voice'"
        class="bubble voice"
        :class="{ self: message.side === 'me' }"
        :style="{ width: voiceWidth(message.duration || 1) }"
        @tap="$emit('play-voice', message)"
      >
        <text v-if="message.side === 'me'" class="duration">{{ message.duration }}"</text>
        <view class="wave" :class="{ reverse: message.side === 'me' }">
          <view class="bar b1" /><view class="bar b2" /><view class="bar b3" />
        </view>
        <text v-if="message.side !== 'me'" class="duration">{{ message.duration }}"</text>
      </view>

      <view v-else-if="message.type === 'video'" class="msg-video" @tap="$emit('play-video', message)">
        <image v-if="message.src" class="poster" :src="message.src" mode="aspectFill" />
        <view v-else class="poster poster-fallback" />
        <view class="video-mask">
          <view class="play"><ChatIcon name="play" :size="20" color="#fff" /></view>
          <text class="video-duration">{{ clock(message.duration || 0) }}</text>
        </view>
      </view>

      <view v-else-if="message.type === 'file'" class="file-card" @tap="$emit('open-file', message)">
        <view class="file-copy">
          <text class="file-name">{{ message.name }}</text>
          <text class="file-size">{{ fileSize(message.size || 0) }}</text>
        </view>
        <view class="file-icon"><ChatIcon name="file" :size="24" color="#fff" /></view>
      </view>

      <view v-if="message.side === 'me' && message.read" class="read-tip"><text>已读</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import ChatAvatar from './ChatAvatar.vue';
import ChatIcon from './ChatIcon.vue';
import type { ChatMessage } from '@/types/chat';
import { chatTime, clock, fileSize } from './format';

withDefaults(
  defineProps<{
    message: ChatMessage;
    peer: { name: string; color: string; avatar?: string };
    meName?: string;
    meColor?: string;
  }>(),
  { meName: '我', meColor: '#294fdb' }
);

defineEmits<{
  (event: 'longpress', message: ChatMessage): void;
  (event: 'preview', message: ChatMessage): void;
  (event: 'play-voice', message: ChatMessage): void;
  (event: 'play-video', message: ChatMessage): void;
  (event: 'open-file', message: ChatMessage): void;
}>();

function voiceWidth(duration: number): string {
  return `${Math.min(190, 86 + duration * 5)}px`;
}
</script>

<style scoped lang="scss">
.row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 7px 14px;
  width: 100%;
}
.row.me {
  flex-direction: row-reverse;
}
.content {
  max-width: calc(100% - 96px);
  display: flex;
  flex-direction: column;
  margin-top: 1px;
}
.row.me .content {
  align-items: flex-end;
}
.bubble {
  position: relative;
  background: #fff;
  border-radius: 14px;
  padding: 9px 13px;
  min-height: 38px;
  display: flex;
  align-items: center;
  box-shadow: 0 1px 2px rgba(29, 42, 68, 0.04);
}
.bubble.self {
  background: #d9e6ff;
}
.bubble::before {
  content: '';
  position: absolute;
  top: 12px;
  left: -5px;
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-right: 6px solid #fff;
}
.bubble.self::before {
  left: auto;
  right: -5px;
  border-right: 0;
  border-left: 6px solid #d9e6ff;
}
.text {
  font-size: 15px;
  line-height: 22px;
  color: #1a1f2e;
  word-break: break-word;
  white-space: pre-wrap;
}
.msg-image {
  width: 180px;
  max-width: 100%;
  border-radius: 12px;
  display: block;
}
.voice {
  min-width: 86px;
  gap: 8px;
  justify-content: space-between;
}
.duration {
  font-size: 13px;
  color: #465268;
  flex-shrink: 0;
}
.wave {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 16px;
  flex: 1;
}
.wave.reverse {
  justify-content: flex-end;
}
.bar {
  width: 3px;
  border-radius: 2px;
  background: #465268;
  opacity: 0.7;
}
.b1 { height: 7px; }
.b2 { height: 13px; }
.b3 { height: 10px; }
.msg-video {
  width: 200px;
  height: 150px;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  background: #1b2735;
}
.poster {
  width: 100%;
  height: 100%;
}
.poster-fallback {
  background: linear-gradient(150deg, #263b56, #16233a 60%, #2c2447);
}
.video-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.play {
  width: 42px;
  height: 42px;
  border-radius: 21px;
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 3px;
}
.video-duration {
  position: absolute;
  right: 8px;
  bottom: 6px;
  font-size: 11px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
.file-card {
  width: 250px;
  max-width: 100%;
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 1px 2px rgba(29, 42, 68, 0.04);
}
.file-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.file-name {
  font-size: 14px;
  color: #1a1f2e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-size {
  font-size: 11px;
  color: #98a2b3;
}
.file-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: linear-gradient(135deg, #4267f5, #2f4fd8);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.read-tip {
  font-size: 10px;
  color: #a7b0c0;
  margin-top: 3px;
}
.time-tip {
  text-align: center;
  padding: 14px 0 6px;
  font-size: 11px;
  color: #98a2b3;
}
.system-tip {
  text-align: center;
  padding: 8px 44px;
  font-size: 11px;
  line-height: 17px;
  color: #98a2b3;
}
</style>
