const BODY_SCROLL_LOCK_CLASS = 'modal-open';
const BODY_SCROLL_LOCK_ATTR = 'data-cf-scroll-lock-count';

function getLockCount(body: HTMLElement) {
  const rawValue = body.getAttribute(BODY_SCROLL_LOCK_ATTR);
  const parsedValue = Number(rawValue || '0');
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
}

function applyBodyScrollLock(body: HTMLElement) {
  body.classList.add(BODY_SCROLL_LOCK_CLASS);
}

function releaseBodyScrollLock(body: HTMLElement) {
  body.classList.remove(BODY_SCROLL_LOCK_CLASS);
  if (body.style.overflow === 'hidden') {
    body.style.removeProperty('overflow');
  }
}

export function lockBodyScroll() {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const body = document.body;
  const nextLockCount = getLockCount(body) + 1;

  // 用计数器管理全局滚动锁，避免多个弹层交错开关时把页面永久锁死。
  body.setAttribute(BODY_SCROLL_LOCK_ATTR, String(nextLockCount));
  applyBodyScrollLock(body);

  let released = false;

  return () => {
    if (released || typeof document === 'undefined') {
      return;
    }

    released = true;

    const currentLockCount = getLockCount(body);
    const nextCount = Math.max(0, currentLockCount - 1);

    if (nextCount === 0) {
      body.removeAttribute(BODY_SCROLL_LOCK_ATTR);
      releaseBodyScrollLock(body);
      return;
    }

    body.setAttribute(BODY_SCROLL_LOCK_ATTR, String(nextCount));
  };
}

export function restoreUnlockedBodyScroll() {
  if (typeof document === 'undefined') {
    return;
  }

  const body = document.body;
  if (getLockCount(body) === 0) {
    releaseBodyScrollLock(body);
  }
}
