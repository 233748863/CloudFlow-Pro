/**
 * 检测当前设备是否为移动设备
 * 综合考虑 User-Agent、屏幕尺寸和触摸支持
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  
  // 1. 检查 User-Agent 中的移动设备标识
  const isMobileUA = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  
  // 2. 检查屏幕宽度（移动设备通常小于 768px）
  const isMobileScreen = window.innerWidth < 768;
  
  // 3. 检查是否支持触摸
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // 4. 特殊处理 iPad（iOS 13+ 的 iPad 可能伪装成桌面设备）
  const isIPad = /ipad/i.test(userAgent.toLowerCase()) || 
                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  // 综合判断：
  // - 如果 UA 明确表明是移动设备，返回 true
  // - 如果是 iPad，返回 true
  // - 如果屏幕小且支持触摸，返回 true
  return isMobileUA || isIPad || (isMobileScreen && hasTouch);
};

/**
 * 检测是否为平板设备
 */
export const isTabletDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  
  // 检查 iPad
  const isIPad = /ipad/i.test(userAgent.toLowerCase()) || 
                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  // 检查 Android 平板（通常屏幕宽度在 768-1024px 之间）
  const isAndroidTablet = /android/i.test(userAgent.toLowerCase()) && 
                          !/mobile/i.test(userAgent.toLowerCase());
  
  return isIPad || isAndroidTablet;
};

/**
 * 获取设备类型
 */
export const getDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
  if (isTabletDevice()) return 'tablet';
  if (isMobileDevice()) return 'mobile';
  return 'desktop';
};
