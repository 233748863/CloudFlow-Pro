import { AxiosError } from 'axios';
import { toast } from 'sonner';

export interface ApiErrorResponse {
  code: string;
  message: string;
  errors?: FieldError[];
  data?: Record<string, unknown>;
  timestamp?: string;
  path?: string;
}

export interface FieldError {
  field: string;
  message: string;
  rejectedValue?: unknown;
}

export interface ErrorHandlerOptions {
  silent?: boolean;
  customMessage?: string;
}

export function handleApiError(
  error: AxiosError<ApiErrorResponse>,
  options: ErrorHandlerOptions = {},
): void {
  if (options.silent) {
    return;
  }

  const errorData = error.response?.data;
  const message = options.customMessage || errorData?.message || error.message || '操作失败';

  if (errorData?.code === 'PERMISSION_DENIED') {
    toast.error(message, {
      duration: 4000,
      description: '请联系系统管理员确认权限',
    });
    return;
  }

  if (errorData?.code === 'INVALID_REQUEST' && errorData.errors?.length) {
    toast.error(message, {
      duration: 6000,
      description: errorData.errors.map((item) => `${item.field}: ${item.message}`).join('\n'),
    });
    return;
  }

  toast.error(message, {
    duration: 4000,
    description: errorData?.code ? `错误码：${errorData.code}` : undefined,
  });
}

export function withErrorHandler<T>(
  fn: () => Promise<T>,
  options: ErrorHandlerOptions = {},
): () => Promise<T | undefined> {
  return async () => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error && 'isAxiosError' in error) {
        handleApiError(error as AxiosError<ApiErrorResponse>, options);
      } else if (!options.silent) {
        toast.error(options.customMessage || (error instanceof Error ? error.message : '操作失败'));
      }
      return undefined;
    }
  };
}

export function showSuccess(message: string, description?: string): void {
  toast.success(message, { duration: 3000, description });
}

export function showWarning(message: string, description?: string): void {
  toast.warning(message, { duration: 4000, description });
}

export function showInfo(message: string, description?: string): void {
  toast.info(message, { duration: 3000, description });
}
