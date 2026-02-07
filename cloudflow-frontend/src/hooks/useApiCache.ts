import { useState, useEffect, useCallback } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface UseApiCacheOptions {
  cacheTime?: number; // 缓存时间（毫秒），默认 5 分钟
  staleTime?: number; // 数据过期时间（毫秒），默认 30 秒
  refetchOnMount?: boolean; // 组件挂载时是否重新获取
  refetchOnFocus?: boolean; // 窗口获得焦点时是否重新获取
}

/**
 * API 缓存 Hook
 * 提供简单的 API 请求缓存机制，减少不必要的网络请求
 */
export const useApiCache = <T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseApiCacheOptions = {}
) => {
  const {
    cacheTime = 5 * 60 * 1000, // 5 分钟
    staleTime = 30 * 1000, // 30 秒
    refetchOnMount = true,
    refetchOnFocus = false,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // 从缓存中获取数据
  const getCachedData = useCallback((): CacheEntry<T> | null => {
    try {
      const cached = localStorage.getItem(`api_cache_${key}`);
      if (!cached) return null;

      const entry: CacheEntry<T> = JSON.parse(cached);
      
      // 检查缓存是否过期
      if (Date.now() > entry.expiresAt) {
        localStorage.removeItem(`api_cache_${key}`);
        return null;
      }

      return entry;
    } catch {
      return null;
    }
  }, [key]);

  // 设置缓存数据
  const setCachedData = useCallback((newData: T) => {
    const entry: CacheEntry<T> = {
      data: newData,
      timestamp: Date.now(),
      expiresAt: Date.now() + cacheTime,
    };

    try {
      localStorage.setItem(`api_cache_${key}`, JSON.stringify(entry));
    } catch (error) {
      console.warn('Failed to cache data:', error);
    }
  }, [key, cacheTime]);

  // 检查数据是否过期
  const isStale = useCallback((entry: CacheEntry<T>): boolean => {
    return Date.now() - entry.timestamp > staleTime;
  }, [staleTime]);

  // 获取数据
  const fetchData = useCallback(async (force = false) => {
    // 如果不是强制刷新，先检查缓存
    if (!force) {
      const cached = getCachedData();
      if (cached) {
        setData(cached.data);
        
        // 如果数据未过期，直接返回
        if (!isStale(cached)) {
          return cached.data;
        }
      }
    }

    // 数据过期或不存在，重新获取
    setIsFetching(true);
    if (!data) {
      setIsLoading(true);
    }

    try {
      const newData = await fetcher();
      setData(newData);
      setError(null);
      setCachedData(newData);
      return newData;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [data, fetcher, getCachedData, isStale, setCachedData]);

  // 手动刷新数据
  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  // 清除缓存
  const clearCache = useCallback(() => {
    localStorage.removeItem(`api_cache_${key}`);
    setData(null);
  }, [key]);

  // 初始加载
  useEffect(() => {
    if (refetchOnMount) {
      fetchData();
    } else {
      // 即使不自动刷新，也尝试从缓存加载
      const cached = getCachedData();
      if (cached) {
        setData(cached.data);
      }
    }
  }, [fetchData, getCachedData, refetchOnMount]);

  // 窗口获得焦点时刷新
  useEffect(() => {
    if (!refetchOnFocus) return;

    const handleFocus = () => {
      const cached = getCachedData();
      if (cached && isStale(cached)) {
        fetchData();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetchOnFocus, fetchData, getCachedData, isStale]);

  return {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
    clearCache,
  };
};

/**
 * 清除所有 API 缓存
 */
export const clearAllApiCache = () => {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('api_cache_')) {
      localStorage.removeItem(key);
    }
  });
};
