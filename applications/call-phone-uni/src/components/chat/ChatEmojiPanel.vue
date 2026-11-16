<template>
  <view class="emoji-panel">
    <scroll-view class="scroll" scroll-y :show-scrollbar="false">
      <view class="grid">
        <view v-for="(emoji, index) in emojis" :key="index" class="emoji" @tap="$emit('select', emoji)">
          <text>{{ emoji }}</text>
        </view>
      </view>
    </scroll-view>
    <view class="tools">
      <view class="delete" role="button" aria-label="删除" @tap="$emit('delete')">
        <text>⌫</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
const emojis = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😍','🥰','😘','😜','🤪',
  '🤨','🧐','🤓','😎','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩',
  '🥺','😢','😭','😤','😠','😡','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗',
  '🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😴','🤤','😪','😵','🤐','🥴',
  '🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','👍','👎','👏','🙏','💪','👌','✌️','🤝',
  '❤️','💔','💯','🔥','🎉','🌹','🍺','🍉'
];

defineEmits<{ (event: 'select', emoji: string): void; (event: 'delete'): void }>();
</script>

<style scoped lang="scss">
.emoji-panel {
  height: calc(236px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: #fff;
  border-top: 1px solid #eef1f6;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.scroll {
  flex: 1;
  height: 0;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  padding: 8px 8px 0;
}
.emoji {
  width: 12.5%;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  line-height: 1;
}
.tools {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 14px;
  border-top: 1px solid #eef1f6;
}
.delete {
  width: 42px;
  height: 30px;
  border-radius: 8px;
  background: #f2f4f8;
  color: #5b6678;
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
