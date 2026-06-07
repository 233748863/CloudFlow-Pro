import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw, Search } from 'lucide-react';
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
  TableHead,
  TableHeader,
  TableRowActions,
  Textarea,
  UserSelector,
  type TableRowActionItem,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { type BaseDialogWidth } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import { normalizeRows } from '../hrShared';

export interface SubRecordColumn<T> {
  header: string;
  className?: string;
  render: (row: T) => React.ReactNode;
}

export type SubRecordField<F> =
  | { type: 'text' | 'number' | 'date' | 'datetime' | 'textarea'; key: keyof F; label: string; colSpan?: 1 | 2; rows?: number }
  | { type: 'select'; key: keyof F; label: string; colSpan?: 1 | 2; options: Record<string, string> }
  | { type: 'user'; key: keyof F; label: string; colSpan?: 1 | 2 }
  | { type: 'custom'; key: keyof F; label: string; colSpan?: 1 | 2; render: (form: Partial<F>, setForm: (next: Partial<F>) => void) => React.ReactNode };

export interface SubRecordApi<F> {
  list: (parentId: number) => Promise<unknown>;
  create: (parentId: number, payload: F) => Promise<unknown>;
  update: (parentId: number, id: number, payload: Partial<F>) => Promise<unknown>;
}

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

  const filters = (
    <FilterBar
      search={{
        value: parentId,
        onChange: setParentId,
        onSubmit: () => void load(),
        placeholder: `输入${parentLabel}查询`,
        widthClassName: 'w-full sm:w-[220px]',
      }}
      stats={[{ label: '', value: `共 ${rows.length} 条` }]}
      actions={[
        <Button key="query" variant="outline" size="sm" onClick={() => void load()} disabled={loading || !parentId}>
          <Search className="mr-1.5 h-4 w-4" />查询
        </Button>,
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading || !parentId}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        <Button key="add" size="sm" onClick={openCreate} disabled={!parentId}>
          <Plus className="mr-1.5 h-4 w-4" />{createLabel}
        </Button>,
      ]}
    />
  );

  const colCount = columns.length + 1;

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              {columns.map((c) => <TableHead key={c.header}>{c.header}</TableHead>)}
              <TableHead className="text-right">操作</TableHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={colCount} className="py-10 text-center text-sm text-slate-400">加载中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount} className="py-10 text-center text-sm text-slate-400">{parentId ? '暂无记录' : `请输入${parentLabel}`}</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  {columns.map((c) => (
                    <td key={c.header} className={c.className ?? 'px-4 py-3 text-sm'}>{c.render(row)}</td>
                  ))}
                  <td className="px-4 py-3">
                    <TableRowActions
                      actions={[
                        { key: 'edit', semantic: 'edit', label: '编辑', onClick: () => openEdit(row), permissionKey: permissionKeyEdit },
                        ...(extraActions?.(row, Number(parentId), () => void load()) ?? []),
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </TableSurfaceCard>
  );

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} />

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
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {fields.map((field) => {
              const span = field.colSpan === 2 ? 'col-span-2' : '';
              if (field.type === 'textarea') {
                return (
                  <div key={String(field.key)} className="col-span-2">
                    <Label>{field.label}</Label>
                    <Textarea rows={field.rows ?? 3} value={String(getVal(field.key) ?? '')} onChange={(e) => setVal(field.key, e.target.value)} />
                  </div>
                );
              }
              if (field.type === 'select') {
                const first = Object.keys(field.options)[0] ?? '';
                return (
                  <div key={String(field.key)} className={span}>
                    <Label>{field.label}</Label>
                    <Select value={String(getVal(field.key) ?? first)} onValueChange={(v) => setVal(field.key, v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(field.options).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
    </div>
  );
}

export default HrSubRecordCrudPage;
