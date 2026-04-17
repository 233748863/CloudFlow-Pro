import type { ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick?: () => void;
}

export interface ToastOptions {
  id?: string | number;
  title?: ReactNode;
  description?: ReactNode;
  duration?: number;
  action?: ToastAction;
}

export interface ToastRecord {
  id: string;
  type: ToastType;
  title?: ReactNode;
  message: ReactNode;
  duration?: number;
  action?: ToastAction;
  startTime?: number;
  removing?: boolean;
}

type ToastListener = () => void;

const listeners = new Set<ToastListener>();
const autoCloseTimers = new Map<string, ReturnType<typeof setTimeout>>();
const exitTimers = new Map<string, ReturnType<typeof setTimeout>>();
const EXIT_ANIMATION_MS = 200;

let toastCounter = 0;
let toastState: ToastRecord[] = [];

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setToastState(nextState: ToastRecord[]) {
  toastState = nextState;
  emitChange();
}

function clearToastTimers(id: string) {
  const autoCloseTimer = autoCloseTimers.get(id);
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimers.delete(id);
  }

  const exitTimer = exitTimers.get(id);
  if (exitTimer) {
    clearTimeout(exitTimer);
    exitTimers.delete(id);
  }
}

function getDefaultDuration(type: ToastType) {
  switch (type) {
    case 'success':
    case 'info':
      return 3000;
    case 'warning':
      return 4000;
    case 'error':
      return 5000;
    default:
      return 4000;
  }
}

function normalizeDuration(duration: number | undefined) {
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : undefined;
}

function normalizeToastContent(message: ReactNode, options?: ToastOptions) {
  if (options?.description !== undefined && options.description !== null) {
    return {
      title: options.title ?? message,
      message: options.description,
    };
  }

  return {
    title: options?.title,
    message,
  };
}

function scheduleAutoClose(id: string, duration?: number) {
  if (!duration) {
    return;
  }

  const timer = setTimeout(() => {
    dismissToast(id);
  }, duration);

  autoCloseTimers.set(id, timer);
}

export function createToast(type: ToastType, message: ReactNode, options?: ToastOptions) {
  const id = String(options?.id ?? `toast-${++toastCounter}`);
  const content = normalizeToastContent(message, options);
  const duration = normalizeDuration(options?.duration ?? getDefaultDuration(type));

  const nextToast: ToastRecord = {
    id,
    type,
    title: content.title,
    message: content.message,
    duration,
    action: options?.action,
    startTime: duration ? Date.now() : undefined,
    removing: false,
  };

  clearToastTimers(id);

  const existingIndex = toastState.findIndex((toast) => toast.id === id);
  if (existingIndex >= 0) {
    const nextState = [...toastState];
    nextState[existingIndex] = nextToast;
    setToastState(nextState);
  } else {
    setToastState([...toastState, nextToast]);
  }

  scheduleAutoClose(id, duration);
  return id;
}

export function dismissToast(id?: string | number) {
  if (id === undefined) {
    const removableIds = toastState.map((item) => item.id);
    if (removableIds.length === 0) {
      return;
    }

    removableIds.forEach((toastId) => clearToastTimers(toastId));
    setToastState(toastState.map((item) => ({ ...item, removing: true })));

    removableIds.forEach((toastId) => {
      const timer = setTimeout(() => {
        setToastState(toastState.filter((item) => item.id !== toastId));
        exitTimers.delete(toastId);
      }, EXIT_ANIMATION_MS);

      exitTimers.set(toastId, timer);
    });
    return;
  }

  const targetId = String(id);
  const target = toastState.find((item) => item.id === targetId);
  if (!target || target.removing) {
    return;
  }

  clearToastTimers(targetId);
  setToastState(
    toastState.map((item) =>
      item.id === targetId ? { ...item, removing: true } : item,
    ),
  );

  const timer = setTimeout(() => {
    setToastState(toastState.filter((item) => item.id !== targetId));
    exitTimers.delete(targetId);
  }, EXIT_ANIMATION_MS);

  exitTimers.set(targetId, timer);
}

export function subscribeToToasts(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastSnapshot() {
  return toastState;
}

