import Decimal from 'decimal.js';
import type { FormField, FormFieldType } from '../types';
import { createFormField, getFieldTypeDefinition } from '../components/form-builder/fieldRegistry';
import { validateFormExpression } from './formExpression';

export interface FormFieldLocation {
  field: FormField;
  path: string;
  parentPath: string | null;
  ancestors: string[];
}

export interface FormSchemaIssue {
  fieldId: string;
  message: string;
}

const reservedFieldIds = new Set(['__proto__', 'prototype', 'constructor', '_rowId']);
const imSummaryTypes = new Set<FormFieldType>(['TEXT', 'TEXTAREA', 'NUMBER', 'AMOUNT', 'DATE', 'DATETIME', 'TIME', 'SELECT', 'RADIO_GROUP', 'SWITCH']);

export const supportsImSummary = (field: FormField, path: string): boolean => !path.includes('.') && imSummaryTypes.has(field.type);

export const isLayoutField = (field: FormField): boolean => getFieldTypeDefinition(field.type)?.isContainer === true;
export const isStaticField = (field: FormField): boolean => getFieldTypeDefinition(field.type)?.group === 'static';
export const getSubTableColumns = (field: FormField): FormField[] => Array.isArray(field.columns) ? field.columns : [];

export const getNestedFields = (field: FormField): FormField[] =>
  field.type === 'SUB_TABLE' ? getSubTableColumns(field) : isLayoutField(field) && Array.isArray(field.children) ? field.children : [];

export const listFormFields = (fields: FormField[]): FormFieldLocation[] => {
  const locations: FormFieldLocation[] = [];
  const visiting = new Set<FormField>();
  const walk = (items: FormField[], parentPath: string | null, ancestors: string[], columnScope?: string) => {
    for (const field of items) {
      if (visiting.has(field)) throw new Error('表单定义存在循环嵌套');
      visiting.add(field);
      const path = columnScope ? `${columnScope}.${field.id}` : field.id;
      locations.push({ field, path, parentPath, ancestors });
      walk(getNestedFields(field), path, [...ancestors, path], field.type === 'SUB_TABLE' ? path : columnScope);
      visiting.delete(field);
    }
  };
  walk(fields, null, []);
  return locations;
};

export const getFormValueFields = (fields: FormField[]): FormField[] =>
  fields.flatMap((field) => isLayoutField(field) ? getFormValueFields(field.children || []) : isStaticField(field) ? [] : [field]);

export const findFormField = (fields: FormField[], path: string): FormFieldLocation | undefined =>
  listFormFields(fields).find((location) => location.path === path);

const mapTree = (
  fields: FormField[], transform: (field: FormField, path: string) => FormField | null, columnScope?: string,
): FormField[] => {
  let changed = false;
  const result: FormField[] = [];
  for (const field of fields) {
    const path = columnScope ? `${columnScope}.${field.id}` : field.id;
    const transformed = transform(field, path);
    if (transformed === null) { changed = true; continue; }
    const children = getNestedFields(transformed);
    const mapped = mapTree(children, transform, transformed.type === 'SUB_TABLE' ? path : columnScope);
    const next = mapped === children ? transformed : transformed.type === 'SUB_TABLE'
      ? { ...transformed, columns: mapped } : { ...transformed, children: mapped };
    changed ||= next !== field;
    result.push(next);
  }
  return changed ? result : fields;
};

export const updateFormField = (fields: FormField[], path: string, patch: Partial<FormField>): FormField[] =>
  mapTree(fields, (field, currentPath) => currentPath === path ? { ...field, ...patch } : field);

export const removeFormFields = (fields: FormField[], paths: Iterable<string>): FormField[] => {
  const removed = new Set(paths);
  return mapTree(fields, (field, path) => removed.has(path) ? null : field);
};

export const uniqueFieldId = (fields: FormField[], prefix: string): string => {
  const used = new Set(listFormFields(fields).map(({ field }) => field.id));
  if (!used.has(prefix)) return prefix;
  let suffix = 2;
  while (used.has(`${prefix}${suffix}`)) suffix += 1;
  return `${prefix}${suffix}`;
};

export const insertFormField = (
  fields: FormField[], parentPath: string | null, index: number, field: FormField,
): FormField[] => {
  let result: FormField[];
  if (parentPath === null) {
    result = [...fields];
    result.splice(Math.max(0, Math.min(index, result.length)), 0, field);
  } else {
    const parent = findFormField(fields, parentPath)?.field;
    if (!parent || !isLayoutField(parent) && parent.type !== 'SUB_TABLE') throw new Error('只能将字段放入布局或明细子表');
    if (parent.type === 'SUB_TABLE' && !getFieldTypeDefinition(field.type)?.allowedInSubTable) throw new Error('明细子表不支持此列类型');
    const children = [...getNestedFields(parent)];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, field);
    result = updateFormField(fields, parentPath, parent.type === 'SUB_TABLE' ? { columns: children } : { children });
  }
  const issues = validateFormTree(result, true);
  if (issues.length) throw new Error(issues[0].message);
  return result;
};

export const moveFormField = (
  fields: FormField[], path: string, parentPath: string | null, index: number,
): FormField[] => {
  const source = findFormField(fields, path);
  if (!source) throw new Error('待移动字段不存在');
  const destination = parentPath ? findFormField(fields, parentPath) : undefined;
  if (parentPath === path || destination?.ancestors.includes(path)) throw new Error('字段不能移入自身或其子级');
  return insertFormField(removeFormFields(fields, [path]), parentPath, index, source.field);
};

export const copyFormField = (fields: FormField[], path: string): FormField[] => {
  const source = findFormField(fields, path);
  if (!source) throw new Error('待复制字段不存在');
  const copy = structuredClone(source.field);
  const reserved = new Set(listFormFields(fields).map(({ field }) => field.id));
  const renamed = new Map<string, string>();
  const rename = (field: FormField, isColumn = false) => {
    if (!isColumn) {
      let suffix = 2;
      const prefix = field.id;
      while (reserved.has(`${prefix}${suffix}`)) suffix += 1;
      field.id = `${prefix}${suffix}`;
      reserved.add(field.id);
      renamed.set(prefix, field.id);
    }
    for (const child of getNestedFields(field)) rename(child, field.type === 'SUB_TABLE');
  };
  rename(copy, source.parentPath !== null && findFormField(fields, source.parentPath)?.field.type === 'SUB_TABLE');
  if (source.parentPath && findFormField(fields, source.parentPath)?.field.type === 'SUB_TABLE') {
    copy.id = uniqueFieldId(getSubTableColumns(findFormField(fields, source.parentPath)!.field), copy.id);
  }
  for (const { field } of listFormFields([copy])) {
    for (const key of ['visibleExpr', 'disabledExpr'] as const) {
      if (field[key]) field[key] = field[key]!.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
        (match, fieldId: string) => renamed.has(fieldId) ? `\${${renamed.get(fieldId)}}` : match);
    }
    if (field.filterByDeptFieldId && renamed.has(field.filterByDeptFieldId)) field.filterByDeptFieldId = renamed.get(field.filterByDeptFieldId);
    if (field.displayFieldId && renamed.has(field.displayFieldId)) field.displayFieldId = renamed.get(field.displayFieldId);
    field.fillMappings = field.fillMappings?.map((mapping) => ({ ...mapping, targetFieldId: renamed.get(mapping.targetFieldId) || mapping.targetFieldId }));
  }
  const siblings = source.parentPath ? getNestedFields(findFormField(fields, source.parentPath)!.field) : fields;
  return insertFormField(fields, source.parentPath, siblings.indexOf(source.field) + 1, copy);
};

export const validateFormTree = (fields: FormField[], allowIncomplete = false): FormSchemaIssue[] => {
  const issues: FormSchemaIssue[] = [];
  const ids = new Set<string>();
  const visiting = new Set<FormField>();
  const issue = (fieldId: string, message: string) => issues.push({ fieldId, message });
  const walk = (items: FormField[], depth: number, columnScope?: string) => {
    const localIds = columnScope ? new Set<string>() : ids;
    for (const field of items) {
      const path = columnScope ? `${columnScope}.${field.id}` : field.id;
      if (visiting.has(field)) { issue(path, '表单定义存在循环嵌套'); continue; }
      visiting.add(field);
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(field.id) || reservedFieldIds.has(field.id)) issue(path, '字段ID须为100字符以内的字母、数字或下划线，且不能为保留名称');
      if (columnScope && path.length > 100) issue(path, '子表ID与列ID组成的完整字段标识不能超过100字符');
      if (localIds.has(field.id)) issue(path, '同一数据范围的字段ID不能重复');
      localIds.add(field.id);
      const registered = getFieldTypeDefinition(field.type);
      if (!registered) { issue(path, '不支持的字段类型'); visiting.delete(field); continue; }
      if (!allowIncomplete && !field.label?.trim()) issue(path, '字段标签不能为空');
      if (columnScope && !registered.allowedInSubTable) issue(path, '明细子表不支持此列类型');
      if (field.imSummaryAllowed !== undefined && typeof field.imSummaryAllowed !== 'boolean') issue(path, '企业微信摘要开关必须为布尔值');
      if (field.imSummaryAllowed === true && !supportsImSummary(field, path)) issue(path, '此字段不支持显示在企业微信待办摘要');
      if (field.type === 'DICT_SELECT' && !allowIncomplete && !field.dictType?.trim()) issue(path, '字典选择字段必须指定字典类型');
      if (registered.isContainer) {
        if (depth >= 3) issue(path, '布局容器最多嵌套3层');
        if (!Array.isArray(field.children) || !allowIncomplete && !field.children.length) issue(path, '布局容器至少需要一个子字段');
        if (field.type === 'GRID' && ![2, 3, 4].includes(Number(field.columns))) issue(path, '网格列数必须为2、3或4');
        walk(Array.isArray(field.children) ? field.children : [], depth + 1, columnScope);
      } else if (field.type === 'SUB_TABLE') {
        const columns = getSubTableColumns(field);
        if (!allowIncomplete && !columns.length) issue(path, '明细子表至少需要一列');
        const minimum = field.minRows ?? 0;
        const maximum = field.maxRows ?? 100;
        if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < 1 || minimum > maximum || maximum > 500) issue(path, '明细行数须满足0≤最少行数≤最多行数≤500');
        walk(columns, depth, path);
        const summaries = new Set<string>();
        for (const summary of field.summaryColumns || []) {
          const column = columns.find((item) => item.id === summary.columnId);
          if (!column || !['NUMBER', 'AMOUNT'].includes(column.type) || !['SUM', 'COUNT', 'AVG'].includes(summary.aggregation)) issue(path, '合计项必须引用数值列并选择SUM、COUNT或AVG');
          if (summaries.has(summary.columnId)) issue(path, '同一列不能重复配置合计');
          summaries.add(summary.columnId);
        }
      } else if (field.children?.length || Array.isArray(field.columns) && field.columns.length) issue(path, '普通字段不能包含子字段');
      if (columnScope && field.type === 'UPLOAD_FILE' && (field.maxCount ?? 1) !== 1) issue(path, '明细附件每行只允许一个文件');
      if (field.precision !== undefined && (!Number.isInteger(field.precision) || field.precision < 0 || field.precision > 18)) issue(path, '小数精度须为0至18的整数');
      for (const expression of [field.visibleExpr, field.disabledExpr]) {
        if (expression && expression.length > 500) issue(path, '条件表达式最多500字符');
      }
      visiting.delete(field);
    }
  };
  walk(fields, 0);
  if (!issues.length) {
    const locations = listFormFields(fields);
    const declared = new Set(locations.filter((location) => !location.path.includes('.')).map((location) => location.field.id));
    for (const location of locations) {
      const scope = new Set(declared);
      if (location.path.includes('.')) {
        const tableId = location.path.split('.')[0];
        locations.filter((candidate) => candidate.path.startsWith(`${tableId}.`)).forEach((candidate) => scope.add(candidate.field.id));
      }
      for (const property of ['visibleExpr', 'disabledExpr'] as const) {
        const expression = location.field[property];
        if (expression === undefined || expression === null) continue;
        if (typeof expression !== 'string') { issue(location.path, '字段条件必须为文字'); continue; }
        if (!expression.trim()) continue;
        const error = validateFormExpression(expression, scope);
        if (error) issue(location.path, error);
      }
    }
  }
  return issues;
};

export const defaultFieldValue = (field: FormField): unknown => {
  if (field.defaultValue !== undefined) return structuredClone(field.defaultValue);
  if (field.type === 'SWITCH') return false;
  if (field.type === 'SUB_TABLE') return Array.from({ length: Math.max(0, Math.min(field.minRows || 0, 500)) }, () => createSubTableRow(field));
  if (field.multiple || ['MULTI_SELECT', 'CHECKBOX_GROUP', 'USER_MULTI', 'DEPT_MULTI', 'UPLOAD_FILE', 'UPLOAD_IMAGE', 'DATE_RANGE'].includes(field.type)) return [];
  return '';
};

export const createSubTableRow = (field: FormField, rowId: string = crypto.randomUUID()): Record<string, unknown> =>
  Object.fromEntries([['_rowId', rowId], ...getSubTableColumns(field).map((column) => [column.id, defaultFieldValue(column)])]);

export const createFormDefaults = (fields: FormField[]): Record<string, unknown> =>
  Object.fromEntries(getFormValueFields(fields).map((field) => [field.id, defaultFieldValue(field)]));

export const calculateSubTableSummary = (field: FormField, rows: Array<Record<string, unknown>>): Record<string, string> => {
  const columns = getSubTableColumns(field);
  return Object.fromEntries((field.summaryColumns || []).map((summary) => {
    const column = columns.find((candidate) => candidate.id === summary.columnId);
    if (!column || !['NUMBER', 'AMOUNT'].includes(column.type)) throw new Error('合计列必须为数值类型');
    const values = rows.flatMap((row) => {
      const value = row[column.id];
      if (value === undefined || value === null || value === '') return [];
      if (typeof value !== 'string' && typeof value !== 'number') throw new Error('合计列包含非法数值');
      const decimal = new Decimal(value);
      if (!decimal.isFinite()) throw new Error('合计列包含非法数值');
      return [decimal];
    });
    if (summary.aggregation === 'COUNT') return [column.id, String(values.length)];
    const integerDigits = Math.max(1, ...values.map((value) => value.e + 1));
    const fractionalDigits = Math.max(column.precision ?? (column.type === 'AMOUNT' ? 2 : 18), ...values.map((value) => value.decimalPlaces()));
    // Preserve every input digit, row-count carry, and guard digits before the final display rounding.
    const SummaryDecimal = Decimal.clone({ precision: Math.max(80, integerDigits + fractionalDigits + String(Math.max(1, values.length)).length + 2), rounding: Decimal.ROUND_HALF_UP });
    const sum = values.reduce((total, value) => total.plus(value), new SummaryDecimal(0));
    const value = summary.aggregation === 'AVG' && values.length ? sum.div(values.length) : sum;
    const precision = column.precision ?? (column.type === 'AMOUNT' ? 2 : Math.min(value.decimalPlaces(), 18));
    if (!Number.isInteger(precision) || precision < 0 || precision > 18) throw new Error('合计精度配置无效');
    return [column.id, value.toFixed(precision)];
  }));
};

export const newFieldForParent = (fields: FormField[], type: FormFieldType, parentPath: string | null): FormField => {
  const registered = getFieldTypeDefinition(type);
  if (!registered) throw new Error('不支持的字段类型');
  const field = createFormField(type, uniqueFieldId(fields, registered.defaultIdPrefix));
  if (parentPath && findFormField(fields, parentPath)?.field.type === 'SUB_TABLE' && type === 'UPLOAD_FILE') field.maxCount = 1;
  return field;
};
