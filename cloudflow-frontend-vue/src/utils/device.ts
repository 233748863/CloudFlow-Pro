export const isMobileDevice = () => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  return mobileUa || (hasTouch && window.innerWidth <= 768)
}
