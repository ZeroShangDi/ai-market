<template>
  <Layout />
</template>

<script setup lang="ts">
import { cloneDeep } from 'lodash-es'
import { onBeforeMount, onBeforeUnmount, onUnmounted } from 'vue'
import Layout from '@/layout/Layout.vue'
import remainingRouter from '@/router/modules/remaining'
import { useAppStore } from '@/store/modules/app'
import { usePermissionStore } from '@/store/modules/permission'
import { useTagsViewStore } from '@/store/modules/tagsView'

const appStore = useAppStore()
const permissionStore = usePermissionStore()
const tagsViewStore = useTagsViewStore()

const previewRoute = cloneDeep(remainingRouter.find((route) => route.name === 'CallPhonePreview')!)
previewRoute.meta = { ...previewRoute.meta, hidden: false, icon: 'ep:phone' }
previewRoute.children = previewRoute.children?.map((route) => ({
  ...route,
  meta: { ...route.meta, hidden: false, query: { ...route.meta?.query, preview: '1' } }
}))

const previousLayout = appStore.getLayout
const previousTagsView = appStore.getTagsView
const previousRouters = permissionStore.routers
const previousAddRouters = permissionStore.addRouters
const previousMenuRootPath = permissionStore.menuRootPath
const previousMenuTabRouters = permissionStore.menuTabRouters
const previousVisitedViews = [...tagsViewStore.visitedViews]
const previousCachedViews = new Set(tagsViewStore.cachedViews)
const previousSelectedTag = tagsViewStore.selectedTag

let restoreDark = false
let restoreLight = false

onBeforeMount(() => {
  const root = document.documentElement
  restoreDark = root.classList.contains('dark')
  restoreLight = root.classList.contains('light')
  // The isolated preview stays light even when the saved admin theme is dark.
  root.classList.remove('dark', 'light')
  root.classList.add('light')

  // Register only the preview routes while the isolated preview shell is active.
  permissionStore.routers = [previewRoute]
  permissionStore.addRouters = [previewRoute]
  permissionStore.setMenuRootPath('/callphone-preview')
  permissionStore.setMenuTabRouters(previewRoute.children || [])
  tagsViewStore.visitedViews = []
  tagsViewStore.cachedViews = new Set()
  tagsViewStore.selectedTag = undefined
  appStore.setLayout('header-mixed-nav')
  appStore.setTagsView(true)
})

onBeforeUnmount(() => {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  if (restoreDark) root.classList.add('dark')
  if (restoreLight) root.classList.add('light')
})

onUnmounted(() => {
  permissionStore.routers = previousRouters
  permissionStore.addRouters = previousAddRouters
  permissionStore.setMenuRootPath(previousMenuRootPath)
  permissionStore.setMenuTabRouters(previousMenuTabRouters)
  tagsViewStore.visitedViews = previousVisitedViews
  tagsViewStore.cachedViews = previousCachedViews
  tagsViewStore.selectedTag = previousSelectedTag
  appStore.setLayout(previousLayout)
  appStore.setTagsView(previousTagsView)
})
</script>
