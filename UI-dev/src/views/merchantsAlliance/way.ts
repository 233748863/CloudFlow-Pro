import { ElMessage } from 'element-plus'

// 图片上传前校验
export function beforeLogoUpload(file: File) {
  const isLt2M = file.size / 1024 / 1024 < 2
  if (!isLt2M) {
    ElMessage.error('Logo图片大小不能超过 2MB!')
    return false
  }
  return true
}

export function beforeImageUpload(file: File) {
  const isLt5M = file.size / 1024 / 1024 < 5
  if (!isLt5M) {
    ElMessage.error('图片大小不能超过 5MB!')
    return false
  }
  return true
}

export function beforeLicenseImageUpload(file: File) {
  const isLt5M = file.size / 1024 / 1024 < 5
  if (!isLt5M) {
    ElMessage.error('资质图片大小不能超过 5MB!')
    return false
  }
  return true
}

export function beforeBannerImageUpload(file: File) {
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) {
    ElMessage.error('图片大小不能超过 10MB!')
    return false
  }
  return true
}

// 生成安全的随机字符串
export function generateSecureRandomString(length = 8) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const randomValues = new Uint8Array(length)
  window.crypto.getRandomValues(randomValues)

  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length]
  }
  return result
}

export function getImageUrl(url: string) {
  const baseURL = import.meta.env.VITE_API_URL
  if (!url) return ''
  if (url.includes('http')) {
    return url
  }
  return baseURL + url
}
