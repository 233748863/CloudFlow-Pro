import type { FormField } from '../types';
import type { FieldPermission } from '../types/workflowSemantic';
import { decimalAmount } from './amountValue';
import { evaluateFormExpression } from './formExpression';
import { getFormValueFields, getSubTableColumns, isLayoutField, isStaticField, listFormFields } from './formTree';

export interface FormRuntimeOptions {
  permissions?: FieldPermission[];
  nodeKey?: string;
  readonly?: boolean;
}

export interface FormRuntimeState {
  visible: boolean;
  readonly: boolean;
  required: boolean;
}

export const formHasValue = (value: unknown): boolean => value !== null && value !== undefined
  && (typeof value !== 'string' || value.trim() !== '') && (!Array.isArray(value) || value.length > 0);

export const formExpressionData = (fields: FormField[], data: Record<string, unknown>): Record<string, unknown> => {
  const values = { ...data };
  for (const field of getFormValueFields(fields)) {
    if (field.type === 'NUMBER' || field.type === 'AMOUNT') {
      const value = values[field.id];
      values[field.id] = typeof value === 'string' || typeof value === 'number' ? decimalAmount(value) : null;
    }
  }
  return values;
};

export const formDeclaredFields = (fields: FormField[]): Set<string> => new Set(listFormFields(fields)
  .filter((location) => !location.path.includes('.')).map((location) => location.field.id));

export const formDerivedFields = (fields: FormField[]): Set<string> => new Set(getFormValueFields(fields).flatMap((field) =>
  ['EMPLOYEE', 'DEPT', 'POST', 'POSITION'].includes(field.type)
    ? [...(field.displayFieldId ? [field.displayFieldId] : []), ...(field.fillMappings || []).map((mapping) => mapping.targetFieldId)] : []));

export const formScopeValues = (fields: FormField[], data: Record<string, unknown>, rootValues: Record<string, unknown>): Record<string, unknown> => {
  const values = { ...rootValues };
  for (const field of getFormValueFields(fields)) values[field.id] = data[field.id];
  return formExpressionData(fields, values);
};

export const formFieldState = (
  field: FormField, path: string, values: Record<string, unknown>, declared: ReadonlySet<string>, options: FormRuntimeOptions = {},
): FormRuntimeState => {
  const permission = options.permissions?.find((item) => item.nodeKey === (options.nodeKey || '__START__') && item.fieldId === path);
  if (permission?.visibleFlag === false) return { visible: false, readonly: true, required: false };
  const visible = field.visibleExpr ? evaluateFormExpression(field.visibleExpr, values, declared) : { valid: true, value: true };
  const disabled = field.disabledExpr ? evaluateFormExpression(field.disabledExpr, values, declared) : { valid: true, value: false };
  return {
    visible: visible.valid && visible.value,
    readonly: options.readonly === true || field.readonly === true || permission?.editableFlag === false || !disabled.valid || disabled.value,
    required: permission?.requiredFlag ?? field.required,
  };
};

const safePattern = (expression: string): RegExp | null => {
  if (expression.length > 512 || !expression.startsWith('^') || !expression.endsWith('$') || /[()|]/.test(expression) || /\\[1-9]/.test(expression)) return null;
  let repetitions = 0;
  let escaped = false;
  let characterClass = false;
  for (const character of expression) {
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character === '[') characterClass = true;
    else if (character === ']') characterClass = false;
    else if (!characterClass && ['*', '+', '?', '{'].includes(character)) repetitions += 1;
  }
  if (repetitions > 1) return null;
  try { return new RegExp(expression); } catch { return null; }
};

const dateValid = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === value;
};

export const validateFormValue = (field: FormField, value: unknown, required: boolean, column = false): string | null => {
  const type = field.type;
  if (!formHasValue(value)) {
    if (required) return '此项必填';
    if (value === undefined || value === null) return null;
    const array = ['SUB_TABLE', 'DATE_RANGE', 'MULTI_SELECT', 'CHECKBOX_GROUP', 'USER_MULTI', 'DEPT_MULTI', 'UPLOAD_FILE', 'UPLOAD_IMAGE'].includes(type)
      || type === 'DICT_SELECT' && field.multiple;
    return array ? Array.isArray(value) ? null : '字段必须为数组' : typeof value === 'string' && type !== 'SWITCH' ? null : '字段类型不符合定义';
  }
  if (type === 'NUMBER' || type === 'AMOUNT') {
    const amount = typeof value === 'string' || typeof value === 'number' ? decimalAmount(value) : null;
    if (!amount) return '请输入有效数字';
    if (amount.decimalPlaces() > (field.precision ?? (type === 'AMOUNT' ? 2 : 18))) return '数值超过允许的小数精度';
    const minimum = decimalAmount(field.min);
    const maximum = decimalAmount(field.max);
    if (minimum && amount.lessThan(minimum)) return '数值低于最小值';
    if (maximum && amount.greaterThan(maximum)) return '数值超过最大值';
  } else if (type === 'SWITCH') {
    if (typeof value !== 'boolean') return '开关值必须为布尔值';
  } else if (type === 'DATE' && !dateValid(value)) return '请选择有效日期';
  else if (type === 'DATE_RANGE') {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(dateValid) || value[0] > value[1]) return '请选择有效起止日期';
  } else if (type === 'DATETIME' || type === 'TIME') {
    if (typeof value !== 'string') return '请选择有效日期时间';
    const parts = value.replace(' ', 'T').split('T');
    const time = type === 'DATETIME' ? parts[1] : value;
    if (!time || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(time)) return '请选择有效时间';
    if (type === 'DATETIME' && (parts.length !== 2 || !dateValid(parts[0]))) return '请选择有效日期';
  } else if (['SELECT', 'RADIO_GROUP', 'MULTI_SELECT', 'CHECKBOX_GROUP', 'DICT_SELECT'].includes(type)) {
    const multiple = ['MULTI_SELECT', 'CHECKBOX_GROUP'].includes(type) || type === 'DICT_SELECT' && field.multiple;
    const values = multiple ? value : [value];
    if (!Array.isArray(values) || values.some((item) => typeof item !== 'string') || new Set(values).size !== values.length) return '请选择有效且不重复的选项';
    if (type !== 'DICT_SELECT' && values.some((item) => !field.options?.includes(item))) return '选项已失效，请重新选择';
  } else if (['EMPLOYEE', 'DEPT', 'POST', 'POSITION', 'USER_MULTI', 'DEPT_MULTI', 'UPLOAD_FILE', 'UPLOAD_IMAGE'].includes(type)) {
    const multiple = type.endsWith('_MULTI') || type.startsWith('UPLOAD_');
    const values = multiple ? value : [value];
    if (!Array.isArray(values) || values.some((item) => !/^[1-9]\d{0,18}$/.test(String(item)) || typeof item === 'number' && !Number.isSafeInteger(item)
      || BigInt(String(item)) > 9223372036854775807n) || new Set(values.map(String)).size !== values.length) return '请重新选择有效记录';
    if (type.startsWith('UPLOAD_') && values.length > (field.maxCount ?? (column ? 1 : 5))) return '附件数量超过上限';
  } else if (type !== 'SUB_TABLE' && typeof value !== 'string') return '请输入文字';
  if (field.regex) {
    const pattern = safePattern(field.regex);
    if (!pattern) return '字段校验配置无效';
    if (String(value).length > 10_000 || !pattern.test(String(value))) return field.errorMsg || '字段未通过格式校验';
  }
  return null;
};

export const validateFormInput = (fields: FormField[], data: Record<string, unknown>, options: FormRuntimeOptions = {}): Record<string, string> => {
  const errors: Record<string, string> = {};
  const rootValues = formExpressionData(fields, data);
  const rootDeclared = formDeclaredFields(fields);
  const walk = (items: FormField[], values: Record<string, unknown>, prefix: string, errorPrefix: string, parentReadonly: boolean, derived: ReadonlySet<string>) => {
    const declared = new Set([...rootDeclared, ...formDeclaredFields(items)]);
    const scope = formScopeValues(items, values, rootValues);
    for (const field of items) {
      const state = formFieldState(field, prefix + field.id, scope, declared, { ...options, readonly: parentReadonly });
      if (!state.visible || isStaticField(field)) continue;
      if (isLayoutField(field)) { walk(field.children || [], values, prefix, errorPrefix, state.readonly, derived); continue; }
      const value = values[field.id];
      const errorPath = errorPrefix + field.id;
      if (field.type === 'SUB_TABLE') {
        if (!Array.isArray(value)) {
          if (formHasValue(value) || state.required || (field.minRows ?? 0) > 0) errors[errorPath] = '请填写明细记录';
          continue;
        }
        if (value.length < (field.minRows ?? 0) || value.length > (field.maxRows ?? 100) || value.length > 500) errors[errorPath] = '明细行数不符合限制';
        if (state.required && !value.length) errors[errorPath] = '此项必填';
        const rowIds = new Set<string>();
        value.slice(0, 500).forEach((row, index) => {
          const rowPath = `${errorPath}[${index}].`;
          if (!row || typeof row !== 'object' || Array.isArray(row)) { errors[rowPath] = '明细行必须为对象'; return; }
          if (row._rowId !== undefined) {
            if (typeof row._rowId !== 'string' || !row._rowId || row._rowId.length > 100 || rowIds.has(row._rowId)) errors[`${rowPath}_rowId`] = '明细行标识无效或重复';
            else rowIds.add(row._rowId);
          }
          walk(getSubTableColumns(field), row, `${field.id}.`, rowPath, state.readonly, formDerivedFields(getSubTableColumns(field)));
        });
      } else if (!state.readonly && !derived.has(field.id)) {
        const message = validateFormValue(field, value, state.required, Boolean(prefix));
        if (message) errors[errorPath] = message;
      }
    }
  };
  walk(fields, data, '', '', options.readonly === true, formDerivedFields(fields));
  return errors;
};

export const projectFormInput = (fields: FormField[], data: Record<string, unknown>, options: FormRuntimeOptions = {}): Record<string, unknown> => {
  const rootValues = formExpressionData(fields, data);
  const rootDeclared = formDeclaredFields(fields);
  const walk = (items: FormField[], values: Record<string, unknown>, prefix: string, parentReadonly: boolean, derived: ReadonlySet<string>): Record<string, unknown> => {
    const output: Record<string, unknown> = {};
    const declared = new Set([...rootDeclared, ...formDeclaredFields(items)]);
    const scope = formScopeValues(items, values, rootValues);
    if (prefix && typeof values._rowId === 'string') output._rowId = values._rowId;
    for (const field of items) {
      const state = formFieldState(field, prefix + field.id, scope, declared, { ...options, readonly: parentReadonly });
      if (!state.visible || state.readonly || isStaticField(field) || derived.has(field.id)) continue;
      if (isLayoutField(field)) { Object.assign(output, walk(field.children || [], values, prefix, false, derived)); continue; }
      if (!Object.hasOwn(values, field.id) || values[field.id] === undefined) continue;
      const value = values[field.id];
      if (value === null || value === '') output[field.id] = value;
      else if (field.type === 'SUB_TABLE' && Array.isArray(value)) {
        output[field.id] = value.map((row) => row && typeof row === 'object' && !Array.isArray(row) ? walk(getSubTableColumns(field), row, `${field.id}.`, false, formDerivedFields(getSubTableColumns(field))) : row);
      } else if (['EMPLOYEE', 'DEPT', 'POST', 'POSITION'].includes(field.type)) {
        if (typeof value !== 'string' && typeof value !== 'number' || typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('记录编号精度无效');
        output[field.id] = String(value);
      } else output[field.id] = value;
    }
    return output;
  };
  return walk(fields, data, '', options.readonly === true, formDerivedFields(fields));
};

export const hasKnownFormDataShape = (fields: FormField[], data: Record<string, unknown>, column = false): boolean => {
  const values = getFormValueFields(fields);
  const known = new Set([...values.map((field) => field.id), ...formDerivedFields(fields), ...(column ? ['_rowId'] : [])]);
  if (Object.keys(data).some((fieldId) => !known.has(fieldId))) return false;
  return values.every((field) => field.type !== 'SUB_TABLE' || !Object.hasOwn(data, field.id)
    || Array.isArray(data[field.id]) && (data[field.id] as unknown[]).every((row) => row !== null && typeof row === 'object' && !Array.isArray(row)
      && hasKnownFormDataShape(getSubTableColumns(field), row as Record<string, unknown>, true)));
};
