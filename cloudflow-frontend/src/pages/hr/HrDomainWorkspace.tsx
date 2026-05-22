import React, { useState } from 'react';
import { Check, Plus, RefreshCcw } from 'lucide-react';
import {
  BaseDialog,
  Button,
  DatePicker,
  DeptSelector,
  EmployeeSelector,
  Input,
  Label,
  PositionSelector,
  PostSelector,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/common';
import { cn } from '@/utils/cn';
import { HrRecord } from '@/services/api/hr';
import { HR_CITY_OPTIONS } from './hrShared';
import { HrStatusPill, HrTableStateRow } from './hrReference';

export interface HrSelectOption {
  label: React.ReactNode;
  value: string | number;
}

export interface HrFormField {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'number'
    | 'date'
    | 'time'
    | 'datetime-local'
    | 'textarea'
    | 'select'
    | 'city'
    | 'multiselect'
    | 'employee'
    | 'dept'
    | 'post'
    | 'position';
  options?: HrSelectOption[];
  placeholder?: string;
  required?: boolean;
  className?: string;
  valueType?: 'string' | 'number';
  onValueChange?: (value: string | number | Array<string | number>, form: HrRecord) => Partial<HrRecord> | void;
  /** employee/dept/post/position 选择器是否允许清空 */
  allowClear?: boolean;
  /** position 选择器按部门过滤时引用的部门字段 key */
  deptFieldKey?: string;
}

export interface HrTableColumn<T extends HrRecord = HrRecord> {
  key: string;
  label: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface HrPageHeaderProps {
  eyebrow: string;
  title: string;
  stats?: Array<{ label: string; value: React.ReactNode; tone?: 'default' | 'active' }>;
  actions?: React.ReactNode;
}

interface HrCrudPanelProps<T extends HrRecord = HrRecord> {
  title: string;
  rows: T[];
  columns: HrTableColumn<T>[];
  loading?: boolean;
  onRefresh?: () => void;
  createLabel?: string;
  dialogTitle?: string;
  form?: HrRecord;
  setForm?: React.Dispatch<React.SetStateAction<HrRecord>>;
  formFields?: HrFormField[];
  onCreate?: (form: HrRecord) => Promise<void> | void;
  resetForm?: () => HrRecord;
  actions?: (row: T) => React.ReactNode;
  minWidthClassName?: string;
  emptyTitle?: string;
}

export const statusTone = (status?: string | number | null) => {
  const normalized = String(status ?? '').toUpperCase();
  if (['ACTIVE', 'APPROVED', 'RECRUITING', 'ACCEPTED', 'EFFECTIVE', 'COMPLETED', 'NORMAL', 'PUBLISHED', 'TRUE', '1'].includes(normalized)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  if (['DRAFT', 'PENDING', 'SCHEDULED', 'SENT'].includes(normalized)) {
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
  if (['APPROVING', 'SCREENING', 'INTERVIEW', 'OFFER'].includes(normalized)) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  if (['REJECTED', 'CANCELLED', 'RESIGNED', 'INACTIVE', 'ABSENT', 'FALSE', '0'].includes(normalized)) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
  }
  return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
};

export const statusLabel = (status?: string | number | null) => {
  const normalized = String(status ?? '').toUpperCase();
  const labels: Record<string, string> = {
    ACTIVE: '启用',
    APPROVED: '已审批',
    APPROVING: '审批中',
    ACCEPTED: '已接受',
    ABSENT: '缺勤',
    CANCELLED: '已取消',
    COMPLETED: '已完成',
    DRAFT: '草稿',
    EARLY: '早退',
    EFFECTIVE: '已生效',
    INACTIVE: '停用',
    INTERVIEW: '面试中',
    LATE: '迟到',
    NORMAL: '正常',
    OFFER: 'Offer阶段',
    PENDING: '待处理',
    PUBLISHED: '已发布',
    RECRUITING: '招聘中',
    REJECTED: '已拒绝',
    SCHEDULED: '已排期',
    SCREENING: '筛选中',
    SENT: '已发送',
    TRUE: '启用',
    FALSE: '停用',
    '0': '停用',
    '1': '启用',
  };
  return labels[normalized] || (status == null || status === '' ? '-' : String(status));
};

export const HrPageHeader: React.FC<HrPageHeaderProps> = ({ eyebrow, title, stats = [], actions }) => (
  <div className="space-y-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          {eyebrow}
        </div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
    {stats.length ? (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        {stats.map((stat) => (
          <span
            key={stat.label}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs',
              stat.tone === 'active'
                ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
            )}
          >
            {stat.label} {stat.value}
          </span>
        ))}
      </div>
    ) : null}
  </div>
);

export const HrTabList: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
}> = ({ value, onValueChange, items }) => (
  <Tabs value={value} onValueChange={onValueChange} className="space-y-4">
    <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
      {items.map((item) => (
        <TabsTrigger key={item.value} value={item.value} className="flex-1 lg:flex-none">
          {item.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

export const renderStatus = (status?: string | number | null, label?: React.ReactNode) => (
  <HrStatusPill label={label || statusLabel(status)} className={statusTone(status)} />
);

const getFieldValue = (form: HrRecord, field: HrFormField) => {
  const value = form[field.key];
  if (value == null) return '';
  return String(value);
};

const getFieldArrayValue = (form: HrRecord, field: HrFormField) => {
  const value = form[field.key];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value == null || value === '') return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
};

const optionLabelText = (label: React.ReactNode) =>
  typeof label === 'string' || typeof label === 'number' ? String(label) : '';

const selectedOptionText = (field: HrFormField, selectedValues: string[]) => {
  const labels = selectedValues
    .map((value) => field.options?.find((option) => String(option.value) === value))
    .filter(Boolean)
    .map((option) => optionLabelText(option!.label) || String(option!.value));

  if (!labels.length) return '';
  if (labels.length <= 2) return labels.join('、');
  return `${labels.slice(0, 2).join('、')} 等 ${labels.length} 项`;
};

const setFieldValue = (
  setForm: React.Dispatch<React.SetStateAction<HrRecord>>,
  field: HrFormField,
  rawValue: string,
) => {
  const value = field.type === 'number' || field.valueType === 'number'
    ? Number(rawValue || 0)
    : rawValue;
  setForm((prev) => ({
    ...prev,
    [field.key]: value,
    ...(field.onValueChange?.(value, prev) || {}),
  }));
};

const setFieldArrayValue = (
  setForm: React.Dispatch<React.SetStateAction<HrRecord>>,
  field: HrFormField,
  values: string[],
) => {
  const value = field.valueType === 'number'
    ? values.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : values;
  setForm((prev) => ({
    ...prev,
    [field.key]: value,
    ...(field.onValueChange?.(value, prev) || {}),
  }));
};

export const HrCrudPanel = <T extends HrRecord = HrRecord>({
  title,
  rows,
  columns,
  loading = false,
  onRefresh,
  createLabel,
  dialogTitle,
  form,
  setForm,
  formFields = [],
  onCreate,
  resetForm,
  actions,
  minWidthClassName = 'min-w-[840px]',
  emptyTitle,
}: HrCrudPanelProps<T>) => {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const canCreate = Boolean(createLabel && form && setForm && onCreate);

  const closeDialog = () => {
    setOpen(false);
    if (setForm && resetForm) {
      setForm(resetForm());
    }
  };

  const submit = async () => {
    if (!form || !onCreate) return;
    setSubmitting(true);
    try {
      await onCreate(form);
      closeDialog();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {loading ? '同步中' : `${rows.length} 条`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh ? (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCcw size={14} className={cn('mr-1.5', loading && 'animate-spin')} />
              刷新
            </Button>
          ) : null}
          {canCreate ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus size={14} className="mr-1.5" />
              {createLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className={minWidthClassName}>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>{column.label}</TableHead>
              ))}
              {actions ? <TableHead className="text-right">操作</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <HrTableStateRow colSpan={columns.length + (actions ? 1 : 0)} title="正在加载..." loading />
            ) : rows.length === 0 ? (
              <HrTableStateRow colSpan={columns.length + (actions ? 1 : 0)} title={emptyTitle || '暂无数据'} />
            ) : (
              rows.map((row) => (
                <TableRow key={String(row.id || JSON.stringify(row))}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.render ? column.render(row) : row[column.key] ?? '-'}
                    </TableCell>
                  ))}
                  {actions ? <TableCell className="text-right">{actions(row)}</TableCell> : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canCreate && form && setForm ? (
        <BaseDialog
          open={open}
          title={dialogTitle || createLabel}
          onClose={closeDialog}
          width="wide"
          footer={(
            <>
              <Button variant="outline" onClick={closeDialog}>取消</Button>
              <Button disabled={submitting} onClick={() => void submit()}>
                {submitting ? '提交中...' : '保存'}
              </Button>
            </>
          )}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {formFields.map((field) => (
              <div key={field.key} className={cn('space-y-2', field.className)}>
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {field.label}
                </Label>
                {field.type === 'select' || field.type === 'city' ? (
                  <Select
                    value={getFieldValue(form, field)}
                    onValueChange={(value) => setFieldValue(setForm, field, value)}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder={field.placeholder || field.label} />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.type === 'city' ? HR_CITY_OPTIONS : field.options || []).map((option) => (
                        <SelectItem key={String(option.value)} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === 'employee' ? (
                  (() => {
                    const raw = form[field.key];
                    const idVal = raw == null || raw === '' ? null : Number(raw);
                    return (
                      <EmployeeSelector
                        single
                        allowClear={field.allowClear !== false}
                        value={Number.isFinite(idVal) ? idVal : null}
                        onChange={(id) => setFieldValue(setForm, field, id == null ? '' : String(id))}
                        placeholder={field.placeholder || field.label}
                      />
                    );
                  })()
                ) : field.type === 'dept' ? (
                  (() => {
                    const raw = form[field.key];
                    const idVal = raw == null || raw === '' ? null : Number(raw);
                    return (
                      <DeptSelector
                        single
                        allowClear={field.allowClear !== false}
                        value={Number.isFinite(idVal) ? idVal : null}
                        onChange={(id) => setFieldValue(setForm, field, id == null ? '' : String(id))}
                        placeholder={field.placeholder || field.label}
                      />
                    );
                  })()
                ) : field.type === 'post' ? (
                  (() => {
                    const raw = form[field.key];
                    const idVal = raw == null || raw === '' ? null : Number(raw);
                    return (
                      <PostSelector
                        single
                        allowClear={field.allowClear !== false}
                        value={Number.isFinite(idVal) ? idVal : null}
                        onChange={(id) => setFieldValue(setForm, field, id == null ? '' : String(id))}
                        placeholder={field.placeholder || field.label}
                      />
                    );
                  })()
                ) : field.type === 'position' ? (
                  (() => {
                    const raw = form[field.key];
                    const idVal = raw == null || raw === '' ? null : Number(raw);
                    const deptRaw = field.deptFieldKey ? form[field.deptFieldKey] : null;
                    const deptId = deptRaw == null || deptRaw === '' ? null : Number(deptRaw);
                    return (
                      <PositionSelector
                        single
                        allowClear={field.allowClear !== false}
                        deptId={Number.isFinite(deptId) ? deptId : null}
                        value={Number.isFinite(idVal) ? idVal : null}
                        onChange={(id) => setFieldValue(setForm, field, id == null ? '' : String(id))}
                        placeholder={field.placeholder || field.label}
                      />
                    );
                  })()
                ) : field.type === 'multiselect' ? (
                  (() => {
                    const selectedValues = getFieldArrayValue(form, field);
                    return (
                      <Select
                        value=""
                        onValueChange={(value) => {
                          const exists = selectedValues.includes(value);
                          const nextValues = exists
                            ? selectedValues.filter((item) => item !== value)
                            : [...selectedValues, value];
                          setFieldArrayValue(setForm, field, nextValues);
                        }}
                      >
                        <SelectTrigger className="h-11">
                          <span className={cn(
                            'min-w-0 flex-1 truncate text-left',
                            selectedValues.length ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500',
                          )}>
                            {selectedOptionText(field, selectedValues) || field.placeholder || field.label}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.length ? field.options.map((option) => {
                            const optionValue = String(option.value);
                            const checked = selectedValues.includes(optionValue);
                            return (
                              <SelectItem key={optionValue} value={optionValue} label={option.label}>
                                <span className="flex min-w-0 items-center gap-2">
                                  <Check size={14} className={cn('shrink-0', checked ? 'text-[color:var(--cf-primary-600)]' : 'text-transparent')} />
                                  <span className="truncate">{option.label}</span>
                                </span>
                              </SelectItem>
                            );
                          }) : (
                            <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                              暂无可选项
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    );
                  })()
                ) : field.type === 'textarea' ? (
                  <Textarea
                    rows={4}
                    value={getFieldValue(form, field)}
                    placeholder={field.placeholder}
                    onChange={(event) => setFieldValue(setForm, field, event.target.value)}
                  />
                ) : field.type === 'date' || field.type === 'time' || field.type === 'datetime-local' ? (
                  <DatePicker
                    type={field.type}
                    value={getFieldValue(form, field)}
                    placeholder={field.placeholder || field.label}
                    required={field.required}
                    onChange={(event) => setFieldValue(setForm, field, event.target.value)}
                    className="h-11"
                  />
                ) : (
                  <Input
                    type={field.type || 'text'}
                    value={getFieldValue(form, field)}
                    placeholder={field.placeholder}
                    onChange={(event) => setFieldValue(setForm, field, event.target.value)}
                    className="h-11"
                  />
                )}
              </div>
            ))}
          </div>
        </BaseDialog>
      ) : null}
    </div>
  );
};
