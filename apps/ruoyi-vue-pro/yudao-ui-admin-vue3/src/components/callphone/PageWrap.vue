<script setup lang="ts">
defineOptions({ name: 'CallPhonePageWrap' })

defineProps<{ title: string; description: string }>()
</script>

<template>
  <div class="callphone-page-wrap">
    <section class="callphone-page-panel">
      <header class="page-header">
        <div class="page-title-row">
          <h1>{{ title }}</h1>
          <div class="page-title-extra"><slot name="titleExtra"></slot></div>
        </div>
        <div class="page-description-row">
          <p>{{ description }}</p>
          <div class="page-description-extra"><slot name="descriptionExtra"></slot></div>
        </div>
      </header>
      <div class="page-divider"></div>
      <section v-if="$slots.search" class="page-search"><slot name="search"></slot></section>
      <div v-if="$slots.search" class="page-divider search-divider"></div>
      <main class="page-body"><slot></slot></main>
    </section>
  </div>
</template>

<style scoped>
.callphone-page-wrap {
  width: 100%;
  height: calc(
    100vh - var(--top-tool-height) - var(--tags-view-height) - var(--app-footer-height) -
      var(--app-content-padding) - var(--app-content-padding)
  );
  min-height: 460px;
  padding: 18px;
  overflow: hidden;
  box-sizing: border-box;
}

.callphone-page-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 18px;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  box-sizing: border-box;
  flex-direction: column;
}

.page-header {
  flex: none;
}

.page-title-row,
.page-description-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-title-row h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.page-description-row {
  margin-top: 6px;
}

.page-description-row p {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.page-title-extra,
.page-description-extra {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.page-divider {
  flex: none;
  height: 1px;
  margin: 16px 0;
  background: var(--el-border-color-lighter);
}

.page-search {
  flex: none;
}

.search-divider {
  margin: 8px 0 14px;
}

.page-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

@media (height <= 650px) {
  .callphone-page-wrap {
    min-height: 0;
  }
}
</style>
