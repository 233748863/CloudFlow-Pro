<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Building2, Eye, EyeOff, Loader2, Lock, LogIn, Mail, ShieldAlert, UserPlus, Users } from 'lucide-vue-next'
import AuthCaptchaDialog from '@/components/auth/AuthCaptchaDialog.vue'
import { Select, type SelectOption } from '@/components/common'
import { getTenantOptions, login as apiLogin, register as apiRegister, type TenantOption } from '@/services/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import './auth-page.css'

type AuthMode = 'login' | 'register'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const mode = ref<AuthMode>(route.path === '/register' ? 'register' : 'login')
const captchaIntent = ref<AuthMode | null>(null)
const pending = ref<AuthMode | null>(null)
const error = ref('')
const tenantOptions = ref<TenantOption[]>([])
const tenantLoading = ref(true)
const tenantLoadError = ref('')
const showLoginPassword = ref(false)
const showRegisterPassword = ref(false)
const showRegisterConfirmPassword = ref(false)

const loginForm = ref({
  tenantCode: '',
  username: '',
  password: ''
})

const registerForm = ref({
  tenantCode: '',
  username: '',
  password: '',
  confirmPassword: '',
  email: ''
})

const isLogin = computed(() => mode.value === 'login')
const currentYear = computed(() => new Date().getFullYear())
const tenantSelectDisabled = computed(() => tenantLoading.value || tenantOptions.value.length === 0)
const tenantPlaceholder = computed(() => tenantLoading.value ? '租户加载中' : '请选择租户')
const tenantSelectOptions = computed<SelectOption[]>(() =>
  tenantOptions.value.map((tenant) => ({
    value: tenant.tenantCode,
    label: tenant.tenantName,
    description: tenant.tenantCode
  }))
)
const captchaTitle = computed(() => captchaIntent.value === 'register' ? '完成注册前验证' : '完成登录前验证')
const captchaDescription = computed(() =>
  captchaIntent.value === 'register'
    ? '请先完成滑块验证码，验证通过后继续创建账号。'
    : '请先完成滑块验证码，验证通过后继续登录系统。'
)

watch(
  () => route.path,
  (path) => {
    mode.value = path === '/register' ? 'register' : 'login'
    error.value = ''
    captchaIntent.value = null
  }
)

const switchMode = (nextMode: AuthMode) => {
  error.value = ''
  captchaIntent.value = null
  mode.value = nextMode
  void router.push(nextMode === 'login' ? '/login' : '/register')
}

const loadTenants = async () => {
  tenantLoading.value = true
  tenantLoadError.value = ''
  try {
    const options = await getTenantOptions()
    tenantOptions.value = options
    if (options.length === 1) {
      const tenantCode = options[0].tenantCode
      loginForm.value.tenantCode ||= tenantCode
      registerForm.value.tenantCode ||= tenantCode
    }
  } catch (err) {
    tenantLoadError.value = getErrorMessage(err, '租户列表加载失败')
  } finally {
    tenantLoading.value = false
  }
}

const validateLogin = () => {
  if (!loginForm.value.tenantCode) return '请选择租户'
  if (!loginForm.value.username.trim() || !loginForm.value.password) return '请输入账号和密码'
  return ''
}

const validateRegister = () => {
  if (!registerForm.value.tenantCode) return '请选择租户'
  if (!registerForm.value.username.trim() || !registerForm.value.password || !registerForm.value.confirmPassword) return '请完整填写注册信息'
  if (registerForm.value.password.length < 6) return '密码至少需要 6 个字符'
  if (registerForm.value.password !== registerForm.value.confirmPassword) return '两次输入的密码不一致'
  return ''
}

const handleLogin = () => {
  error.value = validateLogin()
  if (error.value) return
  captchaIntent.value = 'login'
}

const handleRegister = () => {
  error.value = validateRegister()
  if (error.value) return
  captchaIntent.value = 'register'
}

const handleCaptchaVerify = async (captchaToken: string) => {
  const intent = captchaIntent.value
  captchaIntent.value = null
  if (!intent) return

  pending.value = intent
  error.value = ''
  try {
    if (intent === 'login') {
      const response = await apiLogin(loginForm.value.tenantCode, loginForm.value.username.trim(), loginForm.value.password, captchaToken)
      if (!response?.token) throw new Error('登录失败，未获取到有效凭证')
      await auth.loginWithToken(response.token)
      toast.success('登录成功')
      void router.push(String(route.query.redirect || '/'))
      return
    }

    await apiRegister({
      tenantCode: registerForm.value.tenantCode,
      username: registerForm.value.username.trim(),
      password: registerForm.value.password,
      confirmPassword: registerForm.value.confirmPassword,
      email: registerForm.value.email.trim(),
      captchaToken
    })
    loginForm.value = {
      tenantCode: registerForm.value.tenantCode,
      username: registerForm.value.username.trim(),
      password: ''
    }
    registerForm.value.password = ''
    registerForm.value.confirmPassword = ''
    toast.success('注册成功，请登录')
    switchMode('login')
  } catch (err) {
    error.value = getErrorMessage(err, intent === 'login' ? '登录失败，请检查账号和密码' : '注册失败，请稍后重试')
    toast.error(error.value)
  } finally {
    pending.value = null
  }
}

const setLoginTenant = (value: string | number | boolean | null) => {
  loginForm.value.tenantCode = String(value || '')
}

const setRegisterTenant = (value: string | number | boolean | null) => {
  registerForm.value.tenantCode = String(value || '')
}

onMounted(() => {
  void loadTenants()
})
</script>

<template>
  <div class="cf-auth-page">
    <div class="cf-auth-bg" />
    <div class="cf-auth-decor">
      <div class="cf-auth-orb cf-auth-orb--top" />
      <div class="cf-auth-orb cf-auth-orb--bottom" />
      <div class="cf-auth-orb cf-auth-orb--center" />
      <div class="cf-auth-grid" />
    </div>

    <div class="cf-auth-container">
      <div class="cf-auth-brand">
        <div class="cf-auth-brand__logo">
          <img src="/icon.svg" alt="CloudFlow Pro" class="cf-auth-brand__image" />
        </div>
        <h1 class="cf-auth-brand__title">CloudFlow Pro</h1>
        <p class="cf-auth-brand__subtitle">社区协同办公统一入口</p>
      </div>

      <div class="cf-auth-card">
        <div class="cf-auth-card__section">
          <div class="cf-auth-card__header">
            <h2 class="cf-auth-card__title">{{ isLogin ? '欢迎回来' : '创建账号' }}</h2>
            <p class="cf-auth-card__description">{{ isLogin ? '登录以继续进入社区工作台' : '注册后开始使用社区工作台' }}</p>
          </div>

          <form v-if="isLogin" class="cf-auth-form" @submit.prevent="handleLogin">
            <div>
              <label class="cf-auth-label">租户</label>
              <div class="cf-auth-input-wrap">
                <div class="cf-auth-input-icon">
                  <Building2 :size="18" />
                </div>
                <Select
                  :model-value="loginForm.tenantCode"
                  :options="tenantSelectOptions"
                  :disabled="tenantSelectDisabled"
                  :placeholder="tenantPlaceholder"
                  searchable
                  trigger-class="cf-auth-select-trigger"
                  @update:model-value="setLoginTenant"
                >
                  <template #option="{ option, selected }">
                    <div class="min-w-0 flex-1">
                      <div class="truncate">{{ option.label }}</div>
                      <div class="truncate text-[11px] text-slate-400">{{ option.description }}</div>
                    </div>
                    <span v-if="selected" class="text-xs font-semibold text-teal-600">已选</span>
                  </template>
                </Select>
              </div>
              <p v-if="tenantLoadError" class="cf-auth-hint cf-auth-hint--error">{{ tenantLoadError }}</p>
            </div>

            <div>
              <label for="auth-login-username" class="cf-auth-label">账号</label>
              <div class="cf-auth-input-wrap">
                <div class="cf-auth-input-icon">
                  <Users :size="18" />
                </div>
                <input id="auth-login-username" v-model="loginForm.username" class="cf-auth-input" autocomplete="username" placeholder="请输入账号" />
              </div>
            </div>

            <div>
              <label for="auth-login-password" class="cf-auth-label">密码</label>
              <div class="cf-auth-input-wrap">
                <div class="cf-auth-input-icon">
                  <Lock :size="18" />
                </div>
                <input id="auth-login-password" v-model="loginForm.password" class="cf-auth-input cf-auth-input--password" :type="showLoginPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="请输入密码" />
                <button type="button" class="cf-auth-input-toggle" :aria-label="showLoginPassword ? '隐藏密码' : '显示密码'" @click="showLoginPassword = !showLoginPassword">
                  <EyeOff v-if="showLoginPassword" :size="18" />
                  <Eye v-else :size="18" />
                </button>
              </div>
            </div>

            <div v-if="error" class="cf-auth-error">
              <ShieldAlert :size="18" class="cf-auth-error__icon" />
              <p>{{ error }}</p>
            </div>

            <button type="submit" class="cf-auth-submit" :disabled="pending === 'login'">
              <Loader2 v-if="pending === 'login'" :size="16" class="cf-auth-spin" />
              <LogIn v-else :size="16" />
              {{ pending === 'login' ? '正在登录' : '登录' }}
            </button>
          </form>

          <form v-else class="cf-auth-form" @submit.prevent="handleRegister">
            <div>
              <label class="cf-auth-label">租户</label>
              <div class="cf-auth-input-wrap">
                <div class="cf-auth-input-icon">
                  <Building2 :size="18" />
                </div>
                <Select
                  :model-value="registerForm.tenantCode"
                  :options="tenantSelectOptions"
                  :disabled="tenantSelectDisabled"
                  :placeholder="tenantPlaceholder"
                  searchable
                  trigger-class="cf-auth-select-trigger"
                  @update:model-value="setRegisterTenant"
                >
                  <template #option="{ option, selected }">
                    <div class="min-w-0 flex-1">
                      <div class="truncate">{{ option.label }}</div>
                      <div class="truncate text-[11px] text-slate-400">{{ option.description }}</div>
                    </div>
                    <span v-if="selected" class="text-xs font-semibold text-teal-600">已选</span>
                  </template>
                </Select>
              </div>
              <p v-if="tenantLoadError" class="cf-auth-hint cf-auth-hint--error">{{ tenantLoadError }}</p>
            </div>

            <div>
              <label for="auth-register-username" class="cf-auth-label">用户名</label>
              <div class="cf-auth-input-wrap">
                <div class="cf-auth-input-icon">
                  <Users :size="18" />
                </div>
                <input id="auth-register-username" v-model="registerForm.username" class="cf-auth-input" autocomplete="username" placeholder="请输入用户名" />
              </div>
            </div>

            <div>
              <label for="auth-register-password" class="cf-auth-label">密码</label>
              <div class="cf-auth-input-wrap">
                <div class="cf-auth-input-icon">
                  <Lock :size="18" />
                </div>
                <input id="auth-register-password" v-model="registerForm.password" class="cf-auth-input cf-auth-input--password" :type="showRegisterPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="请输入密码" />
                <button type="button" class="cf-auth-input-toggle" :aria-label="showRegisterPassword ? '隐藏密码' : '显示密码'" @click="showRegisterPassword = !showRegisterPassword">
                  <EyeOff v-if="showRegisterPassword" :size="18" />
                  <Eye v-else :size="18" />
                </button>
              </div>
              <p class="cf-auth-hint">至少 6 个字符</p>
            </div>

            <div>
              <label for="auth-register-confirm" class="cf-auth-label">确认密码</label>
              <div class="cf-auth-input-wrap">
                <div class="cf-auth-input-icon">
                  <Lock :size="18" />
                </div>
                <input id="auth-register-confirm" v-model="registerForm.confirmPassword" class="cf-auth-input cf-auth-input--password" :type="showRegisterConfirmPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="请再次输入密码" />
                <button type="button" class="cf-auth-input-toggle" :aria-label="showRegisterConfirmPassword ? '隐藏确认密码' : '显示确认密码'" @click="showRegisterConfirmPassword = !showRegisterConfirmPassword">
                  <EyeOff v-if="showRegisterConfirmPassword" :size="18" />
                  <Eye v-else :size="18" />
                </button>
              </div>
            </div>

            <div>
              <label for="auth-register-email" class="cf-auth-label">
                邮箱
                <span class="cf-auth-label__optional">（可选）</span>
              </label>
              <div class="cf-auth-input-wrap">
                <div class="cf-auth-input-icon">
                  <Mail :size="18" />
                </div>
                <input id="auth-register-email" v-model="registerForm.email" class="cf-auth-input" type="email" autocomplete="email" placeholder="请输入邮箱（可选）" />
              </div>
            </div>

            <div v-if="error" class="cf-auth-error">
              <ShieldAlert :size="18" class="cf-auth-error__icon" />
              <p>{{ error }}</p>
            </div>

            <button type="submit" class="cf-auth-submit" :disabled="pending === 'register'">
              <Loader2 v-if="pending === 'register'" :size="16" class="cf-auth-spin" />
              <UserPlus v-else :size="16" />
              {{ pending === 'register' ? '正在创建' : '创建账号' }}
            </button>
          </form>
        </div>
      </div>

      <div class="cf-auth-footer">
        <p v-if="isLogin">
          还没有账号？
          <button type="button" class="cf-auth-footer__link" @click="switchMode('register')">立即注册</button>
        </p>
        <p v-else>
          已有账号？
          <button type="button" class="cf-auth-footer__link" @click="switchMode('login')">返回登录</button>
        </p>
      </div>

      <div class="cf-auth-copyright">© {{ currentYear }} CloudFlow Pro. All rights reserved.</div>
    </div>
  </div>

  <AuthCaptchaDialog
    :open="captchaIntent !== null"
    :title="captchaTitle"
    :description="captchaDescription"
    @close="captchaIntent = null"
    @verify="handleCaptchaVerify"
  />
</template>
