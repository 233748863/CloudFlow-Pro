<script setup lang="ts">
import { ref } from 'vue'
import { Users, DollarSign, ShoppingCart } from 'lucide-vue-next'

const stats = ref([
  { label: '总用户', value: '12,345', icon: Users, trend: '+12%' },
  { label: '总收入', value: '¥89.6万', icon: DollarSign, trend: '+8%' },
  { label: '订单数', value: '1,234', icon: ShoppingCart, trend: '+15%' }
])
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 md:grid-cols-3">
      <div v-for="stat in stats" :key="stat.label" class="rounded-lg border p-6 text-center dark:border-gray-700">
        <component :is="stat.icon" class="mx-auto h-8 w-8 text-primary-600" />
        <p class="mt-2 text-3xl font-bold">{{ stat.value }}</p>
        <p class="text-sm text-gray-500">{{ stat.label }}</p>
        <p class="mt-1 text-sm text-green-600">{{ stat.trend }}</p>
      </div>
    </div>
  </div>
</template>
