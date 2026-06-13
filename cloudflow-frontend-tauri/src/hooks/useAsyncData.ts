import { useState, useEffect, DependencyList } from 'react';
import { toast } from 'sonner';

/**
 * 自定义 Hook 用于异步数据获取
 * @template T 数据类型
 * @param fetchFn 数据获取函数
 * @param deps 依赖数组
 * @returns 包含 data, loading, error 和 refetch 的对象
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  deps: DependencyList = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchFn();
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          const error = err as Error;
          setError(error);
          toast.error('数据加载失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, deps);

  return { data, loading, error, refetch: fetchData };
}
