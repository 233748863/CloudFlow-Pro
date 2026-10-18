import { lazy, type ComponentType, type ElementType } from 'react';
import {
  AlignLeft, BadgeDollarSign, Building2, Calendar, CalendarDays, CheckSquare, ChevronDown,
  CircleDot, Clock, Columns3, FileUp, Folder, GitBranch, Hash, Image, Info, List, ListChecks,
  Minus, PanelTop, Table2, TextCursorInput, ToggleLeft, Type, Users, Briefcase,
} from 'lucide-react';
import type { FormField, FormFieldType } from '../../types';
import type { FormScalarControlProps } from '../form-renderer/BuiltinFieldControl';
import type { FieldPropertyEditorProps } from './propertyTypes';

export type FieldGroup = 'text' | 'number' | 'date' | 'select' | 'org' | 'file' | 'static' | 'container';

export interface FieldTypeDefinition {
  type: FormFieldType;
  label: string;
  icon: ElementType;
  group: FieldGroup;
  defaultIdPrefix: string;
  defaultLabel: string;
  isMasterData: boolean;
  isContainer: boolean;
  allowedInSubTable: boolean;
  styleClass: string;
  defaults: Partial<FormField>;
  control: ComponentType<FormScalarControlProps>;
  preview: ComponentType<FormScalarControlProps>;
  propertyEditor: ComponentType<FieldPropertyEditorProps>;
}

const BuiltinControl = lazy(() => import('../form-renderer/BuiltinFieldControl').then((module) => ({ default: module.BuiltinFieldControl })));
const BuiltinPreview = lazy(() => import('../form-renderer/BuiltinFieldControl').then((module) => ({ default: module.BuiltinFieldPreview })));
const BuiltinProperties = lazy(() => import('./FieldPropertyEditor').then((module) => ({ default: module.FieldPropertyEditor })));

const groupStyles: Record<FieldGroup, string> = {
  text: 'border-cyan-200 text-cyan-700 dark:border-cyan-900 dark:text-cyan-200',
  number: 'border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-200',
  date: 'border-sky-200 text-sky-700 dark:border-sky-900 dark:text-sky-200',
  select: 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-200',
  org: 'border-violet-200 text-violet-700 dark:border-violet-900 dark:text-violet-200',
  file: 'border-teal-200 text-teal-700 dark:border-teal-900 dark:text-teal-200',
  static: 'border-[var(--cf-border)] text-[var(--cf-text-secondary)]',
  container: 'border-indigo-200 text-indigo-700 dark:border-indigo-900 dark:text-indigo-200',
};

const subTableTypes = new Set<FormFieldType>([
  'TEXT', 'NUMBER', 'AMOUNT', 'DATE', 'SELECT', 'DICT_SELECT', 'SWITCH', 'EMPLOYEE', 'DEPT', 'UPLOAD_FILE',
]);

const definition = (
  type: FormFieldType, label: string, group: FieldGroup, icon: ElementType,
  defaultIdPrefix: string, defaults: Partial<FormField> = {}, defaultLabel = label,
  components: Partial<Pick<FieldTypeDefinition, 'control' | 'preview' | 'propertyEditor'>> = {},
): FieldTypeDefinition => ({
  type, label, group, icon, defaultIdPrefix, defaultLabel,
  isMasterData: group === 'org',
  isContainer: group === 'container' && type !== 'SUB_TABLE',
  allowedInSubTable: subTableTypes.has(type),
  styleClass: `${groupStyles[group]} bg-[var(--cf-surface-strong)] dark:bg-slate-950`,
  defaults,
  control: components.control || BuiltinControl,
  preview: components.preview || BuiltinPreview,
  propertyEditor: components.propertyEditor || BuiltinProperties,
});

const selectionDefaults = { options: ['选项A', '选项B'] };

export const FIELD_REGISTRY: Record<FormFieldType, FieldTypeDefinition> = {
  TEXT: definition('TEXT', '单行文本', 'text', Type, 'textField'),
  TEXTAREA: definition('TEXTAREA', '多行文本', 'text', AlignLeft, 'description', { rows: 4 }, '说明'),
  RICH_TEXT: definition('RICH_TEXT', 'Markdown文本', 'text', TextCursorInput, 'richText', { rows: 6 }),
  NUMBER: definition('NUMBER', '数字', 'number', Hash, 'amount', {}, '金额'),
  AMOUNT: definition('AMOUNT', '金额', 'number', BadgeDollarSign, 'money', { precision: 2 }),
  DATE: definition('DATE', '日期', 'date', Calendar, 'date'),
  DATETIME: definition('DATETIME', '日期时间', 'date', CalendarDays, 'dateTime'),
  TIME: definition('TIME', '时间', 'date', Clock, 'time'),
  DATE_RANGE: definition('DATE_RANGE', '日期范围', 'date', CalendarDays, 'dateRange'),
  SELECT: definition('SELECT', '下拉选项', 'select', List, 'selectField', selectionDefaults, '选项'),
  MULTI_SELECT: definition('MULTI_SELECT', '多选下拉', 'select', ListChecks, 'multiSelect', { ...selectionDefaults, multiple: true }),
  RADIO_GROUP: definition('RADIO_GROUP', '单选组', 'select', CircleDot, 'radioGroup', selectionDefaults),
  CHECKBOX_GROUP: definition('CHECKBOX_GROUP', '复选组', 'select', CheckSquare, 'checkboxGroup', { ...selectionDefaults, multiple: true }),
  SWITCH: definition('SWITCH', '开关', 'select', ToggleLeft, 'enabled', { defaultValue: false }),
  DICT_SELECT: definition('DICT_SELECT', '字典选择', 'select', List, 'dictionary', { dictType: '' }),
  EMPLOYEE: definition('EMPLOYEE', '员工选择', 'org', Users, 'employeeId', {
    displayFieldId: 'employeeName',
    fillMappings: [
      { targetFieldId: 'employeeName', source: 'name' },
      { targetFieldId: 'employeeNo', source: 'employeeNo' },
      { targetFieldId: 'deptId', source: 'deptId' },
      { targetFieldId: 'deptName', source: 'deptName' },
      { targetFieldId: 'postId', source: 'postId' },
      { targetFieldId: 'postName', source: 'postName' },
      { targetFieldId: 'positionId', source: 'positionId' },
      { targetFieldId: 'positionName', source: 'positionName' },
    ],
  }, '员工'),
  DEPT: definition('DEPT', '部门选择', 'org', Building2, 'deptId', {
    displayFieldId: 'deptName', fillMappings: [{ targetFieldId: 'deptName', source: 'deptName' }],
  }, '部门'),
  POST: definition('POST', '岗位选择', 'org', Briefcase, 'postId', {
    displayFieldId: 'postName', fillMappings: [{ targetFieldId: 'postName', source: 'postName' }],
  }, '岗位'),
  POSITION: definition('POSITION', '职位选择', 'org', GitBranch, 'positionId', {
    displayFieldId: 'positionName',
    fillMappings: [
      { targetFieldId: 'positionName', source: 'positionName' },
      { targetFieldId: 'positionCode', source: 'positionCode' },
      { targetFieldId: 'postId', source: 'postId' },
      { targetFieldId: 'postName', source: 'postName' },
    ],
  }, '职位'),
  USER_MULTI: definition('USER_MULTI', '用户多选', 'org', Users, 'userIds', { multiple: true }),
  DEPT_MULTI: definition('DEPT_MULTI', '部门多选', 'org', Building2, 'deptIds', { multiple: true }),
  UPLOAD_FILE: definition('UPLOAD_FILE', '文件上传', 'file', FileUp, 'attachments', { maxSize: 10, maxCount: 5 }),
  UPLOAD_IMAGE: definition('UPLOAD_IMAGE', '图片上传', 'file', Image, 'images', { accept: 'image/*', maxSize: 5, maxCount: 5 }),
  DESCRIPTION: definition('DESCRIPTION', '说明文字', 'static', Info, 'instructions', { defaultValue: '' }),
  DIVIDER: definition('DIVIDER', '分隔线', 'static', Minus, 'divider'),
  GROUP: definition('GROUP', '分组', 'container', Folder, 'group', { children: [], title: '分组' }),
  GRID: definition('GRID', '网格', 'container', Columns3, 'grid', { children: [], columns: 2 }),
  TABS: definition('TABS', '标签页', 'container', PanelTop, 'tabs', { children: [] }),
  COLLAPSE: definition('COLLAPSE', '折叠面板', 'container', ChevronDown, 'collapse', { children: [], defaultExpanded: true }),
  SUB_TABLE: definition('SUB_TABLE', '明细子表', 'container', Table2, 'details', {
    columns: [], minRows: 0, maxRows: 100, allowAdd: true, allowDelete: true,
    allowSort: true, allowCopyRow: true, summaryColumns: [], emptyText: '暂无明细，请新增一条',
  }),
};

export const FIELD_GROUPS: Array<{ key: FieldGroup; label: string; types: FormFieldType[] }> = (
  [
    ['text', '文本'], ['number', '数值'], ['date', '日期'], ['select', '选择'],
    ['org', '组织'], ['file', '文件'], ['static', '静态'], ['container', '布局与明细'],
  ] as const
).map(([key, label]) => ({
  key, label, types: Object.values(FIELD_REGISTRY).filter((field) => field.group === key).map((field) => field.type),
}));

export const getFieldTypeDefinition = (type: string): FieldTypeDefinition | null =>
  Object.hasOwn(FIELD_REGISTRY, type) ? FIELD_REGISTRY[type as FormFieldType] : null;

export const createFormField = (type: FormFieldType, id: string): FormField => {
  const registered = getFieldTypeDefinition(type);
  if (!registered) throw new Error('不支持的字段类型');
  return { id, type, label: registered.defaultLabel, required: false, ...structuredClone(registered.defaults) };
};
