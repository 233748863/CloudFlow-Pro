<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ChevronLeft, Loader2 } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { Button, Input, Select, TextArea, type SelectOption } from '@/components/common'
import { getAvailableVehicles, submitUsage, type SysVehicle } from '@/services/api/vehicle'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const step = ref(1)
const vehicles = ref<SysVehicle[]>([])
const loading = ref(false)
const submitting = ref(false)
const form = reactive({
  vehicleId: '',
  startTime: '',
  endTime: '',
  destination: '',
  reason: '',
  passengerCount: 1,
  passengers: ''
})

const vehicleOptions = computed<SelectOption[]>(() => vehicles.value.map((item) => ({
  value: String(item.vehicleId || ''),
  label: `${item.licensePlate} (${item.brand || item.model || '车辆'})`
})).filter((item) => item.value))

function normalizeDateTime(value: string) {
  return value ? `${value.replace('T', ' ')}:00`.slice(0, 19) : ''
}

function validateCurrentStep() {
  if (step.value === 1) {
    if (!form.vehicleId) return '请选择车辆'
    if (!form.startTime) return '请选择开始时间'
    if (!form.endTime) return '请选择结束时间'
    const start = new Date(form.startTime)
    const end = new Date(form.endTime)
    if (start.getTime() < Date.now() - 60000) return '开始时间不能早于当前时间'
    if (end <= start) return '结束时间必须晚于开始时间'
  }
  if (step.value === 2) {
    if (form.destination.trim().length < 2) return '请输入有效的目的地'
    if (form.reason.trim().length < 2) return '请输入有效的用车事由'
  }
  return ''
}

function nextStep() {
  const error = validateCurrentStep()
  if (error) {
    toast.error(error)
    return
  }
  step.value += 1
}

async function submitForm() {
  const error = validateCurrentStep()
  if (error) {
    toast.error(error)
    return
  }
  if (form.passengerCount < 1 || form.passengerCount > 50) {
    toast.error('人数必须在1-50之间')
    return
  }
  submitting.value = true
  try {
    await submitUsage({
      vehicleId: Number(form.vehicleId),
      applicantId: Number(auth.user?.id || 0),
      startTime: normalizeDateTime(form.startTime),
      endTime: normalizeDateTime(form.endTime),
      destination: form.destination.trim(),
      reason: form.reason.trim(),
      passengerCount: Number(form.passengerCount),
      passengers: form.passengers.trim()
    })
    toast.success('申请提交成功')
    await router.push('/dashboard')
  } catch (error) {
    toast.error(getErrorMessage(error, '提交失败，请稍后重试'))
  } finally {
    submitting.value = false
  }
}

async function loadVehicles() {
  loading.value = true
  try {
    vehicles.value = await getAvailableVehicles()
  } catch (error) {
    vehicles.value = []
    toast.error(getErrorMessage(error, '获取车辆列表失败'))
  } finally {
    loading.value = false
  }
}

onMounted(() => void loadVehicles())
</script>

<template>
  <div class="min-h-screen bg-white pb-20 dark:bg-slate-950">
    <header class="sticky top-0 z-30 flex h-12 items-center border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
      <button type="button" class="mr-4" aria-label="返回" @click="step > 1 ? step -= 1 : router.back()"><ChevronLeft class="h-6 w-6" /></button>
      <span class="text-lg font-bold text-slate-900 dark:text-slate-100">公务车申请</span>
    </header>

    <main class="p-4">
      <div class="mb-8 flex">
        <div v-for="index in 3" :key="index" class="h-1 flex-1" :class="step >= index ? 'bg-teal-500' : 'bg-slate-200'" />
      </div>

      <section v-if="step === 1" class="space-y-6">
        <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">选择车辆与时间</h2>
        <div v-if="loading" class="flex items-center justify-center py-8"><Loader2 class="h-8 w-8 animate-spin text-teal-500" /></div>
        <div v-else class="space-y-4">
          <label class="space-y-2"><span class="text-sm font-medium">车辆</span><Select v-model="form.vehicleId" :options="vehicleOptions" placeholder="请选择车辆" /></label>
          <Input v-model="form.startTime" type="datetime-local" label="开始时间" />
          <Input v-model="form.endTime" type="datetime-local" label="结束时间" />
        </div>
        <Button class="w-full justify-center" :disabled="loading" @click="nextStep">下一步</Button>
      </section>

      <section v-if="step === 2" class="space-y-6">
        <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">行程信息</h2>
        <Input v-model="form.destination" label="目的地" placeholder="请输入目的地" />
        <TextArea v-model="form.reason" label="用车事由" placeholder="外出开会、接待等" :rows="4" />
        <div class="flex gap-4"><Button variant="outline" class="flex-1 justify-center" @click="step = 1">上一步</Button><Button class="flex-1 justify-center" @click="nextStep">下一步</Button></div>
      </section>

      <section v-if="step === 3" class="space-y-6">
        <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">随行人员</h2>
        <Input v-model="form.passengerCount" type="number" label="人数" />
        <Input v-model="form.passengers" label="名单（选填）" placeholder="张三, 李四" />
        <div class="flex gap-4"><Button variant="outline" class="flex-1 justify-center" :disabled="submitting" @click="step = 2">上一步</Button><Button class="flex-1 justify-center" :disabled="submitting" @click="submitForm"><Loader2 v-if="submitting" class="h-4 w-4 animate-spin" />{{ submitting ? '提交中...' : '提交申请' }}</Button></div>
      </section>
    </main>
  </div>
</template>
