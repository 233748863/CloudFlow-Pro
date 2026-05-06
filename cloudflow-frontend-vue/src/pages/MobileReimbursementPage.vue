<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ChevronLeft, FileText, Loader2, X } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { Button, Input, TextArea } from '@/components/common'
import { expenseClaimApi } from '@/services/api/expense'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

type ExpenseType = 'travel' | 'meal' | 'accommodation' | 'transportation' | 'office' | 'other'

interface ExpenseItem {
  id: string
  type: ExpenseType
  amount: number
  date: string
  description: string
}

const expenseTypes: Array<{ value: ExpenseType; label: string }> = [
  { value: 'travel', label: '差旅费' },
  { value: 'meal', label: '餐饮费' },
  { value: 'accommodation', label: '住宿费' },
  { value: 'transportation', label: '交通费' },
  { value: 'office', label: '办公费' },
  { value: 'other', label: '其他' }
]

const router = useRouter()
const toast = useToastStore()
const step = ref(1)
const submitting = ref(false)
const form = reactive({
  items: [] as ExpenseItem[],
  bankAccount: '',
  remarks: ''
})
const currentItem = reactive({
  type: 'travel' as ExpenseType,
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  description: ''
})

const totalAmount = computed(() => form.items.reduce((sum, item) => sum + item.amount, 0))

function typeLabel(type: ExpenseType) {
  return expenseTypes.find((item) => item.value === type)?.label || type
}

function addItem() {
  const amount = Number(currentItem.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    toast.error('请输入有效的金额')
    return
  }
  if (!currentItem.description.trim()) {
    toast.error('请输入费用说明')
    return
  }
  form.items.push({
    id: String(Date.now()),
    type: currentItem.type,
    amount,
    date: currentItem.date,
    description: currentItem.description.trim()
  })
  currentItem.type = 'travel'
  currentItem.amount = ''
  currentItem.date = new Date().toISOString().slice(0, 10)
  currentItem.description = ''
  toast.success('费用项已添加')
}

function removeItem(id: string) {
  form.items = form.items.filter((item) => item.id !== id)
}

function nextStep() {
  if (step.value === 1 && form.items.length === 0) {
    toast.error('请至少添加一项费用')
    return
  }
  if (step.value === 2) {
    if (!form.bankAccount.trim()) {
      toast.error('请输入银行账号')
      return
    }
    if (form.bankAccount.trim().length < 10) {
      toast.error('请输入有效的银行账号')
      return
    }
  }
  step.value += 1
}

async function submitForm() {
  if (form.items.length === 0) {
    toast.error('请至少添加一项费用')
    return
  }
  if (form.bankAccount.trim().length < 10) {
    toast.error('请输入有效的银行账号')
    return
  }
  submitting.value = true
  try {
    const response = await expenseClaimApi.add({
      category: form.items[0]?.type || 'other',
      totalAmount: totalAmount.value,
      description: form.remarks || form.items.map((item) => item.description).join('；'),
      items: form.items.map((item) => ({
        expenseType: item.type,
        amount: item.amount,
        expenseDate: item.date,
        description: item.description
      }))
    })
    if (response?.id) await expenseClaimApi.submit(response.id)
    toast.success('报销申请已提交')
    await router.push('/dashboard')
  } catch (error) {
    toast.error(getErrorMessage(error, '提交失败，请稍后重试'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-20 dark:bg-slate-950">
    <header class="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <button type="button" class="-ml-1 p-1" aria-label="返回" @click="step > 1 ? step -= 1 : router.back()"><ChevronLeft class="h-6 w-6 text-slate-600" /></button>
      <h1 class="flex-1 text-lg font-semibold text-slate-900 dark:text-slate-100">报销申请</h1>
      <span class="text-sm text-slate-400">步骤 {{ step }}/3</span>
    </header>

    <div class="border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div class="flex gap-2"><div v-for="index in 3" :key="index" class="h-1.5 flex-1 rounded-full" :class="index <= step ? 'bg-teal-500' : 'bg-slate-200'" /></div>
      <div class="mt-2 flex justify-between text-xs text-slate-500"><span :class="step >= 1 ? 'font-medium text-teal-600' : ''">添加费用</span><span :class="step >= 2 ? 'font-medium text-teal-600' : ''">填写信息</span><span :class="step >= 3 ? 'font-medium text-teal-600' : ''">确认提交</span></div>
    </div>

    <main class="space-y-4 p-4">
      <template v-if="step === 1">
        <section class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <label class="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-200">费用类型</label>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="type in expenseTypes" :key="type.value" type="button" class="rounded-lg border-2 px-2 py-2 text-xs font-medium" :class="currentItem.type === type.value ? 'border-teal-500 bg-teal-50 text-teal-600 dark:bg-teal-950/30' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'" @click="currentItem.type = type.value">{{ type.label }}</button>
          </div>
        </section>
        <section class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="grid grid-cols-2 gap-3">
            <Input v-model="currentItem.amount" type="number" label="金额（元）" placeholder="0.00" />
            <Input v-model="currentItem.date" type="date" label="日期" />
          </div>
        </section>
        <section class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <TextArea v-model="currentItem.description" label="费用说明" placeholder="请输入费用说明" :rows="3"><template #prefix><FileText class="h-4 w-4" /></template></TextArea>
        </section>
        <Button class="w-full justify-center" @click="addItem">添加费用项</Button>
        <section v-if="form.items.length" class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-3 flex items-center justify-between"><h3 class="font-semibold text-slate-900 dark:text-slate-100">费用清单</h3><span class="text-lg font-bold text-teal-600">¥{{ totalAmount.toFixed(2) }}</span></div>
          <div class="space-y-2">
            <div v-for="item in form.items" :key="item.id" class="flex items-start justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <div class="flex-1">
                <div class="mb-1 flex items-center gap-2"><span class="rounded bg-teal-50 px-2 py-0.5 text-xs text-teal-600 dark:bg-teal-950/30">{{ typeLabel(item.type) }}</span><span class="text-sm font-semibold text-slate-900 dark:text-slate-100">¥{{ item.amount.toFixed(2) }}</span></div>
                <p class="text-xs text-slate-600 dark:text-slate-300">{{ item.description }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ item.date }}</p>
              </div>
              <button type="button" class="p-1 text-red-500" @click="removeItem(item.id)"><X class="h-4 w-4" /></button>
            </div>
          </div>
        </section>
        <Button v-if="form.items.length" class="w-full justify-center" variant="success" @click="nextStep">下一步</Button>
      </template>

      <template v-if="step === 2">
        <section class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Input v-model="form.bankAccount" label="银行账号" placeholder="请输入银行账号" required />
        </section>
        <section class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <TextArea v-model="form.remarks" label="备注说明" placeholder="请输入备注说明（选填）" :rows="3" />
        </section>
        <Button class="w-full justify-center" @click="nextStep">下一步</Button>
      </template>

      <template v-if="step === 3">
        <section class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 class="mb-4 font-semibold text-slate-900 dark:text-slate-100">确认报销信息</h3>
          <div class="space-y-2">
            <div v-for="item in form.items" :key="item.id" class="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <div><span class="rounded bg-teal-50 px-2 py-0.5 text-xs text-teal-600 dark:bg-teal-950/30">{{ typeLabel(item.type) }}</span><p class="mt-1 text-xs text-slate-600 dark:text-slate-300">{{ item.description }}</p></div>
              <span class="text-sm font-semibold text-slate-900 dark:text-slate-100">¥{{ item.amount.toFixed(2) }}</span>
            </div>
          </div>
          <div class="my-4 flex items-center justify-between border-t-2 border-slate-200 pt-3 dark:border-slate-800"><span class="font-semibold text-slate-900 dark:text-slate-100">总金额</span><span class="text-xl font-bold text-teal-600">¥{{ totalAmount.toFixed(2) }}</span></div>
          <div class="flex items-center justify-between border-t border-slate-100 py-2 text-sm dark:border-slate-800"><span class="text-slate-500">银行账号</span><span class="text-slate-900 dark:text-slate-100">{{ form.bankAccount }}</span></div>
          <div v-if="form.remarks" class="py-2 text-sm"><span class="mb-1 block text-slate-500">备注说明</span><span class="text-slate-900 dark:text-slate-100">{{ form.remarks }}</span></div>
        </section>
        <Button class="w-full justify-center" :disabled="submitting" @click="submitForm"><Loader2 v-if="submitting" class="h-4 w-4 animate-spin" />{{ submitting ? '提交中...' : '提交申请' }}</Button>
      </template>
    </main>
  </div>
</template>
