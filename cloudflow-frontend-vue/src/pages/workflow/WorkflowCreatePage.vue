<script setup lang="ts">
import { ArrowRight, Layers3, PenTool } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { Button, Panel } from '@/components/common'

const router = useRouter()

const creationOptions = [
  {
    id: 'template',
    title: '从模板创建',
    details: [
      { label: '适用', value: '复用成熟流程' },
      { label: '入口', value: '模板中心' },
      { label: '落点', value: '草稿设计' }
    ],
    actionLabel: '进入模板中心',
    icon: Layers3
  },
  {
    id: 'blank',
    title: '空白创建',
    details: [
      { label: '适用', value: '新流程搭建' },
      { label: '入口', value: '空白设计' },
      { label: '落点', value: '直接编辑' }
    ],
    actionLabel: '进入空白设计',
    icon: PenTool
  }
] as const

function selectOption(id: 'template' | 'blank') {
  if (id === 'blank') {
    void router.push('/workflow/design?mode=blank&entry=create')
    return
  }
  void router.push('/templates?entry=create')
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        <PenTool class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
        Workflow Create
      </div>
      <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">发起流程</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">选择流程创建方式，进入模板中心或空白设计画布</p>
    </div>

    <Panel title="选择流程创建方式">
      <div class="divide-y divide-slate-200 dark:divide-slate-800">
        <section v-for="option in creationOptions" :key="option.id" class="py-5 first:pt-1 last:pb-1 sm:py-6">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0 flex-1">
              <div class="flex items-start gap-4">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <component :is="option.icon" class="h-4.5 w-4.5" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ option.title }}</div>
                  <dl class="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                    <div v-for="detail in option.details" :key="`${option.id}-${detail.label}`" class="min-w-0">
                      <dt class="text-[11px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{{ detail.label }}</dt>
                      <dd class="mt-1 truncate text-sm text-slate-700 dark:text-slate-200">{{ detail.value }}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
            <div class="flex shrink-0 items-center lg:pl-6">
              <Button :variant="option.id === 'template' ? 'secondary' : 'outline'" size="sm" @click="selectOption(option.id)">
                {{ option.actionLabel }}
                <ArrowRight class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>
    </Panel>
  </div>
</template>
