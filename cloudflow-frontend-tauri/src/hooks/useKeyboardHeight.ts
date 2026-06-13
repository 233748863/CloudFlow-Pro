import { useEffect, useState } from 'react';

/**
 * 键盘高度检测 Hook
 * 检测移动端虚拟键盘的显示和隐藏，返回键盘高度
 * 用于调整页面布局，防止内容被键盘遮挡
 */
export const useKeyboardHeight = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    // 仅在移动设备上启用
    if (typeof window === 'undefined' || !('visualViewport' in window)) {
      return;
    }

    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const handleResize = () => {
      // 计算键盘高度
      const windowHeight = window.innerHeight;
      const viewportHeight = visualViewport.height;
      const heightDiff = windowHeight - viewportHeight;

      // 如果高度差大于 150px，认为键盘已显示
      if (heightDiff > 150) {
        setKeyboardHeight(heightDiff);
        setIsKeyboardVisible(true);
      } else {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    };

    // 监听 visualViewport 的 resize 事件
    visualViewport.addEventListener('resize', handleResize);
    visualViewport.addEventListener('scroll', handleResize);

    // 初始检查
    handleResize();

    return () => {
      visualViewport.removeEventListener('resize', handleResize);
      visualViewport.removeEventListener('scroll', handleResize);
    };
  }, []);

  return {
    keyboardHeight,
    isKeyboardVisible,
  };
};

/**
 * 自动调整输入框位置的 Hook
 * 当输入框获得焦点时，自动滚动到可见区域
 */
export const useKeyboardAwareScroll = () => {
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      
      // 只处理输入元素
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // 延迟执行，等待键盘完全显示
        setTimeout(() => {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }, 300);
      }
    };

    document.addEventListener('focusin', handleFocus);

    return () => {
      document.removeEventListener('focusin', handleFocus);
    };
  }, []);
};
