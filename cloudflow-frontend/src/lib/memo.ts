/**
 * React.memo 性能优化工具
 * 提供通用的 memo 包装器和比较函数
 */

import React from 'react';

/**
 * 浅比较函数
 * 用于 React.memo 的自定义比较
 */
export function shallowEqual<T extends Record<string, unknown>>(
  prevProps: T,
  nextProps: T
): boolean {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);

  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of prevKeys) {
    if (prevProps[key] !== nextProps[key]) return false;
  }

  return true;
}

/**
 * 深比较函数（仅比较一层深度）
 * 适用于包含对象属性的组件
 */
export function deepEqual<T extends Record<string, unknown>>(
  prevProps: T,
  nextProps: T
): boolean {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);

  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of prevKeys) {
    const prev = prevProps[key];
    const next = nextProps[key];

    if (prev === next) continue;

    // 函数引用比较（忽略函数变化）
    if (typeof prev === 'function' && typeof next === 'function') continue;

    // 数组浅比较
    if (Array.isArray(prev) && Array.isArray(next)) {
      if (prev.length !== next.length) return false;
      for (let i = 0; i < prev.length; i++) {
        if (prev[i] !== next[i]) return false;
      }
      continue;
    }

    // 对象浅比较
    if (
      typeof prev === 'object' &&
      prev !== null &&
      typeof next === 'object' &&
      next !== null
    ) {
      const prevObj = prev as Record<string, unknown>;
      const nextObj = next as Record<string, unknown>;
      const objKeys = Object.keys(prevObj);
      if (objKeys.length !== Object.keys(nextObj).length) return false;
      let equal = true;
      for (const k of objKeys) {
        if (prevObj[k] !== nextObj[k]) {
          equal = false;
          break;
        }
      }
      if (equal) continue;
    }

    return false;
  }

  return true;
}

/**
 * 创建忽略指定 props 变化的比较函数
 * @param ignoreKeys 要忽略的 prop 名称列表
 */
export function ignoreProps<T extends Record<string, unknown>>(
  ...ignoreKeys: string[]
): (prev: T, next: T) => boolean {
  const ignoreSet = new Set(ignoreKeys);
  return (prev: T, next: T) => {
    const keys = Object.keys(prev).filter((k) => !ignoreSet.has(k));
    for (const key of keys) {
      if (prev[key] !== next[key]) return false;
    }
    return true;
  };
}

/**
 * 创建仅比较指定 props 的比较函数
 * @param pickKeys 要比较的 prop 名称列表
 */
export function pickProps<T extends Record<string, unknown>>(
  ...pickKeys: string[]
): (prev: T, next: T) => boolean {
  return (prev: T, next: T) => {
    for (const key of pickKeys) {
      if (prev[key] !== next[key]) return false;
    }
    return true;
  };
}
