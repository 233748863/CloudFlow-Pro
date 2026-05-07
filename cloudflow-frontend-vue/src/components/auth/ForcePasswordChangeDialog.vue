<script setup lang="ts">
import { ref } from 'vue'
import { BaseDialog, Button, Input } from '@/components/common'
import { changeProfilePassword } from '@/services/api/auth'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  changed: []
  logout: []
}>()

const toast = useToastStore()
const saving = ref(false)
const form = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })

async function submit() {
  if (!form.value.oldPassword.trim() || !form.value.newPassword.trim()) {
    toast.error('请完整填写密码')
    return
  }
  if (form.value.newPassword.length < 6) {
    toast.error('新密码至少 6 位')
    return
  }
  if (form.value.newPassword !== form.value.confirmPassword) {
    toast.error('两次输入的新密码不一致')
    return
  }
  saving.value = true
  try {
    await changeProfilePassword(form.value.oldPassword, form.value.newPassword)
    form.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    toast.success('密码已更新')
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error, '密码更新失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    :show="open"
    title="首次登录需修改密码"
    width="narrow"
    :close-on-escape="false"
    :close-on-click-outside="false"
    hide-close-button
    @close="() => {}"
  >
    <div class="space-y-4">
      <p class="text-sm text-slate-500 dark:text-slate-400">当前账号使用初始密码，完成修改后才能继续访问系统。</p>
      <Input v-model="form.oldPassword" type="password" label="当前密码" required autocomplete="current-password" />
      <Input v-model="form.newPassword" type="password" label="新密码" required autocomplete="new-password" />
      <Input v-model="form.confirmPassword" type="password" label="确认新密码" required autocomplete="new-password" />
    </div>
    <template #footer>
      <div class="flex w-full justify-between gap-3">
        <Button variant="outline" :disabled="saving" @click="emit('logout')">退出登录</Button>
        <Button :disabled="saving" @click="submit">{{ saving ? '提交中...' : '更新密码' }}</Button>
      </div>
    </template>
  </BaseDialog>
</template>
