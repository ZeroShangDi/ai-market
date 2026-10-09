<template>
  <div class="config-page">
    <el-alert
      v-if="previewMode"
      class="preview-banner"
      title="本地预览模式"
      description="阶段和结果配置只修改当前浏览器中的演示数据。"
      type="warning"
      :closable="false"
    />
    <section class="page-intro"
      ><div
        ><h1>阶段与结果配置</h1
        ><p>统一维护客户阶段和通话结果。已被业务记录引用的选项应停用保留历史。</p></div
      ><el-tag effect="plain">配置中心</el-tag></section
    >
    <el-tabs v-model="activeTab" class="config-tabs" type="border-card">
      <el-tab-pane label="客户阶段" name="stages"><CustomerStagesPage /></el-tab-pane>
      <el-tab-pane label="通话结果与业务选项" name="results"
        ><BusinessDictionariesPage
      /></el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import CustomerStagesPage from '@/views/callphone/customer-stages/index.vue'
import BusinessDictionariesPage from '@/views/callphone/system/dictionaries/index.vue'
defineOptions({ name: 'CallPhonePhaseResultConfig' })
const route = useRoute(),
  previewMode = import.meta.env.DEV && route.query.preview === '1'
const activeTab = ref('stages')
</script>

<style scoped>
.config-page {
  padding: 20px;
}

.preview-banner {
  margin-bottom: 14px;
}

.page-intro {
  display: flex;
  padding: 20px 24px;
  margin-bottom: 14px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  justify-content: space-between;
  align-items: center;
}

.page-intro h1 {
  margin: 0;
  font-size: 20px;
}

.page-intro p {
  margin: 7px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.config-tabs :deep(.el-tab-pane) {
  min-height: 420px;
}
</style>
