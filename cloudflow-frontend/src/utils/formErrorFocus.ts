import type { FormField } from '../types';
import { getSubTableColumns, isLayoutField, isStaticField } from './formTree';
import { formDeclaredFields, formExpressionData, formFieldState, formScopeValues, type FormRuntimeOptions } from './formValueRuntime';

// Error maps may arrive in server order. Follow the visible schema and row order instead.
export function firstVisibleFormError(fields: FormField[], data: Record<string, unknown>, errors: Record<string, string>, options: FormRuntimeOptions): string | undefined {
  const rootValues = formExpressionData(fields, data);
  const rootDeclared = formDeclaredFields(fields);
  const walk = (items: FormField[], values: Record<string, unknown>, fieldPrefix: string, errorPrefix: string, readonly: boolean): string | undefined => {
    const declared = new Set([...rootDeclared, ...formDeclaredFields(items)]);
    const scope = formScopeValues(items, values, rootValues);
    for (const field of items) {
      const state = formFieldState(field, fieldPrefix + field.id, scope, declared, { ...options, readonly });
      if (!state.visible || isStaticField(field)) continue;
      if (isLayoutField(field)) {
        const nested = walk(field.children || [], values, fieldPrefix, errorPrefix, state.readonly);
        if (nested) return nested;
        continue;
      }
      const path = errorPrefix + field.id;
      if (errors[path]) return path;
      const rows = values[field.id];
      if (field.type === 'SUB_TABLE' && Array.isArray(rows)) {
        for (let index = 0; index < rows.length; index++) {
          const row = rows[index];
          if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
          const nested = walk(getSubTableColumns(field), row, `${field.id}.`, `${path}[${index}].`, state.readonly);
          if (nested) return nested;
        }
      }
    }
    return undefined;
  };
  return walk(fields, data, '', '', options.readonly === true);
}
