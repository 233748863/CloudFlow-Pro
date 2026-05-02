<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { allRouteCatalog } from '@/router/routeCatalog'
import { FileCode2 } from 'lucide-vue-next'

const route = useRoute()

const meta = computed(() => {
  const routePath = route.matched[route.matched.length - 1]?.path || route.path
  return allRouteCatalog.find((item) => item.path === routePath) || {
    title: String(route.meta.title || '未迁移页面'),
    group: 'CloudFlow Pro',
    source: '未找到对应 React 源页'
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="min-w-0">
      <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        <FileCode2 class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
        Vue Migration Placeholder
      </div>
      <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {{ meta.title }}
      </h1>
    </div>

    <section class="card p-6">
      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">
            该路由已在 Vue 3 版本中注册，当前页面保留为迁移占位，后续按同名 React 源页改写为 `.vue`。
          </p>
          <dl class="mt-5 grid gap-3 text-sm md:grid-cols-2">
            <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <dt class="text-xs text-slate-500">当前路径</dt>
              <dd class="mt-1 font-mono text-slate-900 dark:text-slate-100">{{ route.path }}</dd>
            </div>
            <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <dt class="text-xs text-slate-500">业务分组</dt>
              <dd class="mt-1 text-slate-900 dark:text-slate-100">{{ meta.group }}</dd>
            </div>
          </dl>
        </div>
        <div class="rounded-lg border border-dashed border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900 dark:bg-cyan-950/20">
          <div class="text-xs font-semibold text-cyan-700 dark:text-cyan-200">React 源页</div>
          <div class="mt-2 break-all font-mono text-xs leading-5 text-cyan-900 dark:text-cyan-100">
            {{ meta.source }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
