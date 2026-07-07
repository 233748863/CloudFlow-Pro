import type { HrPagedResult } from './types';

export const withList = <T>(value: T[] | HrPagedResult<T>) =>
  Array.isArray(value) ? value : (value.records || value.rows || []);

export const normalizeJsonArray = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value);
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return value;
};

export const normalizeStringArray = (value: unknown): string[] => {
  const normalized = normalizeJsonArray(value);
  if (Array.isArray(normalized)) {
    return normalized.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof normalized === 'string') {
    return normalized.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

export const parseMaybeJson = <T = unknown>(value: unknown, fallback: T): T => {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
