import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Ban,
  Check,
  Copy,
  Download,
  Edit,
  ExternalLink,
  Eye,
  Plus,
  Power,
  RefreshCcw,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import {
  BaseDialog,
  Button,
  DatePicker,
  DeptSelector,
  EmployeeSelector,
  Input,
  Label,
  Pagination,
  PositionSelector,
  PostSelector,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  type TableRowActionItem,
} from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/cn';
import { HrRecord } from '@/services/api/hr';
import { HR_CITY_OPTIONS } from './hrShared';
import { HrStatusPill } from './hrReference';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

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
  /** 行操作: 返回 TableRowActionItem[],由目标图标按钮渲染 */
  actions?: (row: T) => TableRowActionItem[];
  minWidthClassName?: string;
  emptyTitle?: string;
  /** 客户端分页页大小;不传则不分页 */
  pageSize?: number;
}

export const statusTone = (status?: string | number | null) => {
  const normalized = String(status ?? '').toUpperCase();
  if (['ACTIVE', 'APPROVED', 'RECRUITING', 'ACCEPTED', 'EFFECTIVE', 'COMPLETED', 'NORMAL', 'PUBLISHED', 'TRUE', '1'].includes(normalized)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  if (['DRAFT', 'PENDING', 'SCHEDULED', 'SENT'].includes(normalized)) {
    return 'border-slate-200 bg-[var(--cf-surface-muted)] text-cf-body dark:border-slate-800 dark:bg-slate-900';
  }
  if (['APPROVING', 'SCREENING', 'INTERVIEW', 'OFFER'].includes(normalized)) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  if (['REJECTED', 'CANCELLED', 'RESIGNED', 'INACTIVE', 'ABSENT', 'FALSE', '0'].includes(normalized)) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
  }
  return 'border-slate-200 bg-[var(--cf-surface-muted)] text-cf-body dark:border-slate-800 dark:bg-slate-900';
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
  return labels[normalized] || '-';
};

const actionSemanticIconMap: Partial<Record<NonNullable<TableRowActionItem['semantic']>, React.ReactNode>> = {
  view: <Eye size={15} />,
  edit: <Edit size={15} />,
  confirm: <Check size={15} />,
  submit: <Send size={15} />,
  process: <Check size={15} />,
  bind: <ExternalLink size={15} />,
  writeoff: <Check size={15} />,
  send: <Send size={15} />,
  enable: <Power size={15} />,
  disable: <Power size={15} />,
  reset: <RotateCcw size={15} />,
  copy: <Copy size={15} />,
  open: <ExternalLink size={15} />,
  export: <Download size={15} />,
  archive: <Archive size={15} />,
  void: <Ban size={15} />,
  delete: <Trash2 size={15} />,
  custom: <Check size={15} />,
};

const isDangerAction = (action: TableRowActionItem) =>
  action.danger || action.tone === 'danger' || ['archive', 'void', 'delete'].includes(String(action.semantic || ''));

const resolveActionIcon = (action: TableRowActionItem) =>
  action.icon ?? actionSemanticIconMap[action.semantic || 'custom'] ?? <Check size={15} />;

export const HrTabList: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
}> = ({ value, onValueChange, items }) => (
  <Tabs value={value} onValueChange={onValueChange} className="flex flex-col gap-4">
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
  pageSize,
}: HrCrudPanelProps<T>) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [innerPageSize, setInnerPageSize] = useState(pageSize ?? 10);
  const canCreate = Boolean(createLabel && form && setForm && onCreate);
  const colCount = columns.length + (actions ? 1 : 0);
  const userPermissions = user?.permissions || [];
  const hasPermission = (permission?: string) =>
    !permission
    || userPermissions.includes(permission)
    || userPermissions.includes('*:*:*')
    || userPermissions.includes('*');

  const paged = Boolean(pageSize);
  const total = rows.length;
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / innerPageSize));
    if (page > maxPage) setPage(maxPage);
  }, [total, innerPageSize, page]);
  const visibleRows = useMemo(
    () => (paged ? rows.slice((page - 1) * innerPageSize, page * innerPageSize) : rows),
    [paged, rows, page, innerPageSize],
  );

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
    <InnerTableSurface>
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-cf-title">{title}</div>
          <div className="mt-1 text-xs text-cf-subtle">
            {loading ? '同步中' : `${total} 条`}
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

      <div className="admin-horizontal-scroll">
        <table className={cn('unity-data-table admin-source-table', minWidthClassName)}>
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.className}>{column.label}</th>
              ))}
              {actions ? <th className="text-right">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="py-10 text-center text-sm text-cf-faint">加载中…</td></tr>
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan={colCount} className="py-10 text-center text-sm text-cf-faint">{emptyTitle || '暂无数据'}</td></tr>
            ) : (
              visibleRows.map((row) => {
                const rowActions = actions
                  ? actions(row).filter((action) => !action.hidden && hasPermission(action.permissionKey))
                  : [];

                return (
                  <tr key={String(row.id || JSON.stringify(row))}>
                    {columns.map((column) => (
                      <td key={column.key} className={column.className}>
                        {column.render ? column.render(row) : row[column.key] ?? '-'}
                      </td>
                    ))}
                    {actions ? (
                      <td>
                        {rowActions.length ? (
                          <div className="admin-users-row-actions">
                            {rowActions.map((action, index) => {
                              const label = action.tooltip ?? action.title ?? action.label;

                              return (
                                <button
                                  key={action.key ?? `${action.label}-${index}`}
                                  type={action.type ?? 'button'}
                                  data-tooltip={label}
                                  aria-label={label}
                                  disabled={action.disabled}
                                  className={cn(isDangerAction(action) && 'danger', action.className)}
                                  onClick={action.onClick}
                                >
                                  {resolveActionIcon(action)}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-300">-</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {paged && total > 0 ? (
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <Pagination
            page={page}
            pageSize={innerPageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setInnerPageSize(size); setPage(1); }}
          />
        </div>
      ) : null}

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
              <div key={field.key} className={cn('admin-dialog-field', field.className)}>
                <Label className="text-sm font-semibold text-cf-body">
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
                            selectedValues.length ? 'text-cf-title' : 'text-cf-faint',
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
                            <div className="px-3 py-6 text-center text-sm text-cf-subtle">
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
    </InnerTableSurface>
  );
};
