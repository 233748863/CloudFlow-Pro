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

export const supportsMasterDataSelect = (field: FormField) =>
  field.type === 'EMPLOYEE' ||
  field.type === 'DEPT' ||
  field.type === 'POST' ||
  field.type === 'POSITION';
