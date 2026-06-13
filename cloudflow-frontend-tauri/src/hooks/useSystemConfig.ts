import { useEffect, useState } from 'react';
import { getConfigByKey } from '../services/api/system';

/**
 * 系统配置缓存
 * 使用内存缓存避免重复请求，页面刷新后重新加载
 */
const configCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();

/**
 * 获取系统配置值（带缓存）
 * 优先从内存缓存读取，未命中时请求后端
 */
export const getConfig = async (configKey: string, defaultValue: string = ''): Promise<string> => {
  // 命中缓存直接返回
  if (configCache.has(configKey)) {
    return configCache.get(configKey) || defaultValue;
  }

  // 防止并发重复请求同一个 key
  if (pendingRequests.has(configKey)) {
    return pendingRequests.get(configKey)!;
  }

  const request = (async () => {
    try {
      const value = await getConfigByKey(configKey);
      const result = (typeof value === 'string' && value) ? value : defaultValue;
      configCache.set(configKey, result);
      return result;
    } catch {
      // 请求失败使用默认值，不缓存（下次重试）
      return defaultValue;
    } finally {
      pendingRequests.delete(configKey);
    }
  })();

  pendingRequests.set(configKey, request);
  return request;
};

/** 获取数值类型配置 */
export const getConfigInt = async (configKey: string, defaultValue: number): Promise<number> => {
  const value = await getConfig(configKey, String(defaultValue));
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
};

/**
 * 同步读 cache 中已加载的字符串配置（仅命中已预热的 key）。
 * 未命中时返回 defaultValue，不触发请求；适合 useState 初值场景。
 */
export const getConfigValueSync = (configKey: string, defaultValue: string = ''): string => {
  return configCache.get(configKey) ?? defaultValue;
};

/** 同步读 cache 中已加载的整数配置（未命中返回 defaultValue），适合 useState 初值。 */
export const getConfigIntSync = (configKey: string, defaultValue: number): number => {
  const cached = configCache.get(configKey);
  if (cached == null) return defaultValue;
  const num = parseInt(cached, 10);
  return isNaN(num) ? defaultValue : num;
};

/**
 * 启动期一次性预热常用配置 key，预热完成后页面通过 getConfigIntSync 即可拿到真实值。
 * 入参顺序无关；失败的 key 在下次访问时自动重试。
 */
export const preloadConfigs = async (keys: string[]): Promise<void> => {
  await Promise.all(keys.map(k => getConfig(k)));
};

/** 清空配置缓存（配置修改后调用） */
export const clearConfigCache = () => {
  configCache.clear();
};

/**
 * React Hook：获取单个系统配置值
 * @param configKey 配置键名
 * @param defaultValue 默认值
 * @returns [配置值, 是否加载中]
 */
export const useConfigValue = (configKey: string, defaultValue: string = ''): [string, boolean] => {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getConfig(configKey, defaultValue).then(v => {
      if (!cancelled) {
        setValue(v);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [configKey, defaultValue]);

  return [value, loading];
};

/**
 * React Hook：获取数值类型系统配置
 * @param configKey 配置键名
 * @param defaultValue 默认值
 * @returns [配置值, 是否加载中]
 */
export const useConfigInt = (configKey: string, defaultValue: number): [number, boolean] => {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getConfigInt(configKey, defaultValue).then(v => {
      if (!cancelled) {
        setValue(v);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [configKey, defaultValue]);

  return [value, loading];
};
