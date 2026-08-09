import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Check, Download, Edit, ExternalLink, Eye, MoreHorizontal, Plus, Power, RefreshCcw, Search, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  UserSelector,
  type TableRowActionItem,
} from '@/components/common';
import { type BaseDialogWidth } from '@/components/common/BaseDialog';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useDict } from '@/hooks/useDict';
import { normalizeRows } from '../hrShared';

export interface SubRecordColumn<T> {
  header: string;
  className?: string;
  render: (row: T) => React.ReactNode;
}

export type SubRecordField<F> =
  | { type: 'text' | 'number' | 'date' | 'datetime' | 'textarea'; key: keyof F; label: string; colSpan?: 1 | 2; rows?: number }
  | { type: 'select'; key: keyof F; label: string; colSpan?: 1 | 2; options?: Record<string, string>; dictType?: string }
  | { type: 'user'; key: keyof F; label: string; colSpan?: 1 | 2 }
  | { type: 'custom'; key: keyof F; label: string; colSpan?: 1 | 2; render: (form: Partial<F>, setForm: (next: Partial<F>) => void) => React.ReactNode };

export interface SubRecordApi<F> {
  list: (parentId: number) => Promise<unknown>;
  create: (parentId: number, payload: F) => Promise<unknown>;
  update: (parentId: number, id: number, payload: Partial<F>) => Promise<unknown>;
}

const SubRecordSelectField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options?: Record<string, string>;
  dictType?: string;
}> = ({ value, onChange, options, dictType }) => {
  const { getOptions } = useDict(dictType ?? '', { enabled: !!dictType });
  const entries: Array<[string, string]> = dictType
    ? getOptions().map((o) => [o.value, o.label])
    : Object.entries(options ?? {});
  const first = entries[0]?.[0] ?? '';
  return (
    <Select value={value || first} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {entries.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

const actionIconMap: Record<string, React.ReactNode> = {
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
  reset: <RefreshCcw size={15} />,
  copy: <MoreHorizontal size={15} />,
  open: <ExternalLink size={15} />,
  export: <Download size={15} />,
  archive: <Ban size={15} />,
  void: <Ban size={15} />,
  delete: <Trash2 size={15} />,
  custom: <MoreHorizontal size={15} />,
};

const isDangerAction = (action: TableRowActionItem) =>
  action.danger || action.semantic === 'delete' || action.semantic === 'void' || action.semantic === 'archive';

export interface HrSubRecordCrudPageProps<T extends { id: number }, F> {
  parentLabel: string;
  parentPayloadKey: keyof F;
  api: SubRecordApi<F>;
  columns: SubRecordColumn<T>[];
  fields: SubRecordField<F>[];
  emptyForm: Partial<F>;
  toEditForm: (row: T) => Partial<F>;
  createLabel: string;
  editTitle: string;
  createTitle: string;
  dialogWidth?: BaseDialogWidth;
  permissionKeyEdit?: string;
  extraActions?: (row: T, parentId: number, reload: () => void) => TableRowActionItem[];
}

export function HrSubRecordCrudPage<T extends { id: number }, F>({
  parentLabel,
  parentPayloadKey,
  api,
  columns,
  fields,
  emptyForm,
  toEditForm,
  createLabel,
  editTitle,
  createTitle,
  dialogWidth,
  permissionKeyEdit,
  extraActions,
}: HrSubRecordCrudPageProps<T, F>) {
  const { user } = useAuth();
  const [parentId, setParentId] = useState('');
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Partial<F>>(emptyForm);

  const load = useCallback(async () => {
    if (!parentId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.list(Number(parentId));
      setRows(normalizeRows<T>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [api, parentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: T) => {
    setEditing(row);
    setForm(toEditForm(row));
    setOpen(true);
  };

  const handleSave = async () => {
    if (!parentId) {
      toast.error(`请填写${parentLabel}`);
      return;
    }
    try {
      if (editing) {
        await api.update(Number(parentId), editing.id, form);
        toast.success('已更新');
      } else {
        await api.create(Number(parentId), { ...form, [parentPayloadKey]: Number(parentId) } as F);
        toast.success('已创建');
      }
      setOpen(false);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const getVal = (key: keyof F): unknown => (form as Record<string, unknown>)[key as string];
  const setVal = (key: keyof F, value: unknown) => setForm({ ...form, [key]: value } as Partial<F>);
  const userPermissions = user?.permissions || [];
  const hasPermission = (permission?: string) => {
    if (!permission) return true;
    return userPermissions.includes(permission) || userPermissions.includes('*:*:*') || userPermissions.includes('*');
  };

  const renderRowActions = (row: T) => {
    const actions = [
      { key: 'edit', semantic: 'edit' as const, label: '编辑', onClick: () => openEdit(row), permissionKey: permissionKeyEdit },
      ...(extraActions?.(row, Number(parentId), () => void load()) ?? []),
    ].filter((action) => !action.hidden && hasPermission(action.permissionKey));

    if (!actions.length) {
      return <span className="admin-users-muted">-</span>;
    }

    return (
      <div className="admin-users-row-actions">
        {actions.map((action, index) => (
          <button
            key={action.key ?? `${action.label}-${index}`}
            type={action.type ?? 'button'}
            className={isDangerAction(action) ? 'danger' : undefined}
            data-tooltip={action.tooltip ?? action.title ?? action.label}
            aria-label={action.tooltip ?? action.title ?? action.label}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.icon ?? actionIconMap[action.semantic ?? 'custom'] ?? actionIconMap.custom}
          </button>
        ))}
      </div>
    );
  };

  const colCount = columns.length + 1;

  return (
    <section className="admin-source-page hr-sub-record-page">
      <TablePageLayout
        className="hr-sub-record-layout"
        actions={
          <>
            <header className="admin-source-header">
              <div>
                <p className="admin-source-kicker">HR SUB RECORDS</p>
                <h2>{createTitle.replace(/^新增/, '') || '子记录维护'}</h2>
                <span>按{parentLabel}查询并维护明细记录</span>
              </div>
              <div className="admin-source-controls">
                <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || !parentId}>
                  <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
                </Button>
                <Button size="sm" onClick={openCreate} disabled={!parentId}>
                  <Plus className="mr-1.5 h-4 w-4" />{createLabel}
                </Button>
              </div>
            </header>

            <section className="admin-source-stat-grid">
              <article className="card admin-source-stat admin-source-tone-blue">
                <div className="admin-source-stat-icon"><Search size={18} /></div>
                <div><p>查询对象</p><strong>{parentId || '-'}</strong><span>{parentLabel}</span></div>
              </article>
              <article className="card admin-source-stat admin-source-tone-green">
                <div className="admin-source-stat-icon"><Plus size={18} /></div>
                <div><p>当前记录</p><strong>{rows.length}</strong><span>查询结果总数</span></div>
              </article>
            </section>
          </>
        }
        filters={
          <section className="card admin-users-toolbar hr-sub-record-toolbar">
            <div className="admin-users-filter-grid">
              <label className="admin-source-search">
                <span className="input-label">{parentLabel}</span>
                <div className="admin-source-search-field">
                  <Search size={16} />
                  <Input
                    className="h-auto"
                    type="search"
                    value={parentId}
                    onChange={(event) => setParentId(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void load();
                    }}
                    placeholder={`输入${parentLabel}查询`}
                  />
                </div>
              </label>
            </div>
            <div className="admin-users-toolbar-actions">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || !parentId}>
                <Search className="mr-1.5 h-4 w-4" />查询
              </Button>
              <span className="admin-users-filter-count">共 {rows.length} 条</span>
            </div>
          </section>
        }
        table={
          <InnerTableSurface className="card admin-source-panel no-padding hr-sub-record-table-panel flex min-h-0 flex-1 flex-col">
            <table className="unity-data-table admin-source-table min-w-[720px]">
              <thead>
                <tr>
                  {columns.map((c) => <th key={c.header}>{c.header}</th>)}
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={colCount} className="admin-settings-empty">加载中...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={colCount} className="admin-settings-empty">{parentId ? '暂无记录' : `请输入${parentLabel}`}</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      {columns.map((c) => (
                        <td key={c.header} className={c.className}>{c.render(row)}</td>
                      ))}
                      <td>{renderRowActions(row)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </InnerTableSurface>
        }
      />

      <BaseDialog
        open={open}
        title={editing ? editTitle : createTitle}
        width={dialogWidth}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="admin-dialog-stack">
          <div className="grid grid-cols-2 gap-3">
            {fields.map((field) => {
              const span = field.colSpan === 2 ? 'col-span-2' : '';
              if (field.type === 'textarea') {
                return (
                  <div key={String(field.key)} className="admin-dialog-field col-span-2">
                    <Label>{field.label}</Label>
                    <Textarea rows={field.rows ?? 3} value={String(getVal(field.key) ?? '')} onChange={(e) => setVal(field.key, e.target.value)} />
                  </div>
                );
              }
              if (field.type === 'select') {
                return (
                  <div key={String(field.key)} className={cn('admin-dialog-field', span)}>
                    <Label>{field.label}</Label>
                    <SubRecordSelectField
                      value={String(getVal(field.key) ?? '')}
                      onChange={(v) => setVal(field.key, v)}
                      options={field.options}
                      dictType={field.dictType}
                    />
                  </div>
                );
              }
              if (field.type === 'user') {
                const raw = getVal(field.key);
                return (
                  <div key={String(field.key)} className={span}>
                    <Label>{field.label}</Label>
                    <UserSelector single allowClear value={raw == null ? null : String(raw)} onChange={(id) => setVal(field.key, id ? Number(id) : undefined)} placeholder={field.label} />
                  </div>
                );
              }
              if (field.type === 'custom') {
                return (
                  <div key={String(field.key)} className={span}>
                    <Label>{field.label}</Label>
                    {field.render(form, setForm)}
                  </div>
                );
              }
              const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text';
              const sliceLen = field.type === 'date' ? 10 : field.type === 'datetime' ? 16 : undefined;
              const rawVal = getVal(field.key);
              const display = sliceLen ? String(rawVal ?? '').slice(0, sliceLen) : String(rawVal ?? '');
              return (
                <div key={String(field.key)} className={span}>
                  <Label>{field.label}</Label>
                  <Input
                    type={inputType}
                    value={display}
                    onChange={(e) => {
                      const v = e.target.value;
                      setVal(field.key, field.type === 'number' ? (v ? Number(v) : undefined) : v);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </BaseDialog>
    </section>
  );
}

export default HrSubRecordCrudPage;
