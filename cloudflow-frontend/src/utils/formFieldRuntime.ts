import type { FormField } from '@/types';

const isEmptyValue = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const readPathValue = (source: unknown, path?: string): unknown => {
  if (!path || source === null || source === undefined) {
    return undefined;
  }

  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, source);
};

export const applyFieldFillMappings = (
  field: FormField,
  picked: unknown,
): Record<string, unknown> => {
  const updates: Record<string, unknown> = {};

  for (const mapping of field.fillMappings || []) {
    const value = readPathValue(picked, mapping.source);
    const fallback = isEmptyValue(value)
      ? readPathValue(picked, mapping.fallbackSource)
      : undefined;
    const nextValue = isEmptyValue(value) ? fallback : value;

    if (!isEmptyValue(nextValue)) {
      updates[mapping.targetFieldId] = nextValue;
      continue;
    }

    if (mapping.clearWhenEmpty !== false) {
      updates[mapping.targetFieldId] = '';
    }
  }

  return updates;
};

export const getFieldDisplayValue = (
  field: FormField,
  data: Record<string, any> | undefined,
  rawValue: unknown,
) => {
  if (field.displayFieldId && data && !isEmptyValue(data[field.displayFieldId])) {
    return data[field.displayFieldId];
  }
  return rawValue;
};

export const formatFormReadOnlyDate = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  // A date-only form value is a calendar day, so formatting must not shift it through UTC.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll('-', '/');
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  return String(value);
};

export const supportsMasterDataSelect = (field: FormField) =>
  field.type === 'EMPLOYEE' ||
  field.type === 'DEPT' ||
  field.type === 'POST' ||
  field.type === 'POSITION';
