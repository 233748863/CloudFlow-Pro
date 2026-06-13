/**
 * 请求工具库
 * 提供错误重试、请求去重、增量更新等功能
 */

// ============================================================
// 1. 错误重试机制
// ============================================================

interface RetryOptions {
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 基础延迟时间（毫秒），默认 1000 */
  baseDelay?: number;
  /** 是否使用指数退避，默认 true */
  exponentialBackoff?: boolean;
  /** 可重试的错误判断函数 */
  retryCondition?: (error: unknown) => boolean;
  /** 重试前的回调 */
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * 带重试机制的异步函数执行器
 * @param fn 要执行的异步函数
 * @param options 重试配置
 * @returns 函数执行结果
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    exponentialBackoff = true,
    retryCondition = defaultRetryCondition,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !retryCondition(error)) {
        throw error;
      }

      const delay = exponentialBackoff
        ? baseDelay * Math.pow(2, attempt)
        : baseDelay;

      onRetry?.(attempt + 1, error);

      await sleep(Math.min(delay, 30000)); // 最大延迟 30 秒
    }
  }

  throw lastError;
}

/**
 * 默认的可重试错误判断
 * 网络错误和 5xx 服务器错误可重试
 */
function defaultRetryCondition(error: unknown): boolean {
  if (error instanceof Error) {
    // 网络错误
    if (error.message.includes('Network Error') || error.message.includes('timeout')) {
      return true;
    }
  }

  // HTTP 5xx 错误
  if (typeof error === 'object' && error !== null) {
    const status = (error as any)?.response?.status;
    if (status && status >= 500 && status < 600) {
      return true;
    }
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// 2. 请求去重
// ============================================================

const pendingRequests = new Map<string, Promise<any>>();

/**
 * 请求去重包装器
 * 相同 key 的请求在进行中时，后续请求会复用第一个请求的结果
 * @param key 请求唯一标识
 * @param fn 请求函数
 * @returns 请求结果
 */
export async function deduplicateRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // 如果已有相同 key 的请求在进行中，直接返回该 Promise
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  // 创建新请求
  const promise = fn().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}

/**
 * 清除所有待处理的请求
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}

// ============================================================
// 3. 增量更新机制
// ============================================================

interface IncrementalUpdateOptions<T> {
  /** 获取项目 ID 的函数 */
  getId: (item: T) => string;
  /** 合并策略：replace（替换）或 merge（合并） */
  strategy?: 'replace' | 'merge';
}

/**
 * 增量更新列表数据
 * @param currentList 当前列表
 * @param newItems 新数据
 * @param options 配置选项
 * @returns 更新后的列表
 */
export function incrementalUpdate<T extends Record<string, any>>(
  currentList: T[],
  newItems: T[],
  options: IncrementalUpdateOptions<T>
): T[] {
  const { getId, strategy = 'replace' } = options;
  const currentMap = new Map(currentList.map((item) => [getId(item), item]));

  for (const newItem of newItems) {
    const id = getId(newItem);
    if (strategy === 'merge' && currentMap.has(id)) {
      // 合并模式：保留旧数据，用新数据覆盖
      currentMap.set(id, { ...currentMap.get(id)!, ...newItem });
    } else {
      // 替换模式：直接替换
      currentMap.set(id, newItem);
    }
  }

  return Array.from(currentMap.values());
}

/**
 * 从列表中移除指定项目
 * @param currentList 当前列表
 * @param removeIds 要移除的 ID 列表
 * @param getId 获取 ID 的函数
 * @returns 移除后的列表
 */
export function removeFromList<T>(
  currentList: T[],
  removeIds: string[],
  getId: (item: T) => string
): T[] {
  const removeSet = new Set(removeIds);
  return currentList.filter((item) => !removeSet.has(getId(item)));
}

// ============================================================
// 4. 分页加载工具
// ============================================================

interface PaginationState<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
}

/**
 * 创建分页状态初始值
 */
export function createPaginationState<T>(pageSize = 20): PaginationState<T> {
  return {
    items: [],
    page: 1,
    pageSize,
    total: 0,
    hasMore: true,
    loading: false,
  };
}

/**
 * 更新分页状态（加载更多）
 */
export function appendPage<T>(
  state: PaginationState<T>,
  newItems: T[],
  total?: number
): PaginationState<T> {
  const updatedItems = [...state.items, ...newItems];
  const updatedTotal = total ?? state.total;

  return {
    ...state,
    items: updatedItems,
    page: state.page + 1,
    total: updatedTotal,
    hasMore: updatedItems.length < updatedTotal,
    loading: false,
  };
}

/**
 * 重置分页状态（刷新）
 */
export function resetPage<T>(
  state: PaginationState<T>,
  newItems: T[],
  total: number
): PaginationState<T> {
  return {
    ...state,
    items: newItems,
    page: 2,
    total,
    hasMore: newItems.length < total,
    loading: false,
  };
}
