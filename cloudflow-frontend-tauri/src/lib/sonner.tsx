import type { ReactNode } from 'react';
import { ToastViewport } from '@/components/common/Toast';
import {
  createToast,
  dismissToast,
  type ToastOptions,
} from '@/lib/toastStore';

type ToastHandler = (message: ReactNode, options?: ToastOptions) => string;

export type { ToastAction, ToastOptions } from '@/lib/toastStore';

export interface ToasterProps {
  position?: string;
  richColors?: boolean;
  expand?: boolean;
  duration?: number;
  closeButton?: boolean;
  theme?: string;
  toastOptions?: unknown;
}

interface ToastFn extends ToastHandler {
  success: ToastHandler;
  error: ToastHandler;
  warning: ToastHandler;
  info: ToastHandler;
  message: ToastHandler;
  dismiss: (id?: string | number) => void;
}

const baseToast: ToastHandler = (message, options) => createToast('info', message, options);

export const toast = Object.assign(baseToast, {
  success: (message: ReactNode, options?: ToastOptions) => createToast('success', message, options),
  error: (message: ReactNode, options?: ToastOptions) => createToast('error', message, options),
  warning: (message: ReactNode, options?: ToastOptions) => createToast('warning', message, options),
  info: (message: ReactNode, options?: ToastOptions) => createToast('info', message, options),
  message: (message: ReactNode, options?: ToastOptions) => createToast('info', message, options),
  dismiss: (id?: string | number) => dismissToast(id),
}) as ToastFn;

export function Toaster(_props: ToasterProps) {
  return <ToastViewport />;
}

