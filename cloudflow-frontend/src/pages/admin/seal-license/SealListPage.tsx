import React, { useCallback, useEffect, useState } from 'react';
import { Edit, Plus, RotateCcw, Stamp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, ConfirmDialog, Input, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea, UserSelector } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { OaSeal, sealApi } from '@/services/api/sealLicense';
import { PageResult } from '@/types';
import type { UserBrief } from '@/types/workflow';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

const TYPE_LABELS: Record<string, string> = {
  COMPANY: '公章',
  FINANCE: '财务章',
  CONTRACT: '合同章',
  LEGAL: '法人章',
  OTHER: '其他',
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '可用',
  BORROWED: '借出',
  DISABLED: '停用',
};

const EDITABLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: STATUS_LABELS.AVAILABLE,
  DISABLED: STATUS_LABELS.DISABLED,
};

const emptyForm: OaSeal = {
  sealCode: '',
  sealName: '',
  sealType: 'COMPANY',
  status: 'AVAILABLE',
};

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const getStatusBadge = (status?: string) => {
  const toneMap: Record<string, string> = {
    AVAILABLE: 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    BORROWED: 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    DISABLED: 'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'AVAILABLE'] || toneMap.AVAILABLE}`}>
      {STATUS_LABELS[status || 'AVAILABLE'] || status || '-'}
    </span>
  );
};

const isBorrowLocked = (item: Pick<OaSeal, 'status'>) => item.status === 'BORROWED';

const TableStateRow: React.FC<{ colSpan: number; title: string }> = ({ colSpan, title }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          <Stamp className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

export const SealListPage: React.FC = () => {
  const [rows, setRows] = useState<OaSeal[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, sealName: '', status: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OaSeal>(emptyForm);
  const [selectedKeeperIds, setSelectedKeeperIds] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const result = await sealApi.list({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        sealName: query.sealName || undefined,
        status: query.status || undefined,
      });
      setRows(normalizeRows(result));
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取印章台账失败'));
    }
  }, [query]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const resetForm = () => {
    setForm(emptyForm);
    setSelectedKeeperIds([]);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (item: OaSeal) => {
    setForm({ ...item });
    setSelectedKeeperIds(item.keeperId ? [String(item.keeperId)] : []);
    setDialogOpen(true);
  };

  const handleKeeperSelectionChange = useCallback((userIds: string[]) => {
    setSelectedKeeperIds(userIds);
    if (userIds.length === 0) {
      setForm((prev) => ({
        ...prev,
        keeperId: undefined,
        keeperName: '',
      }));
    }
  }, []);

  const updateKeeper = useCallback((users: UserBrief[]) => {
    const user = users[0];
    if (!user) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      keeperId: Number(user.id) || undefined,
      keeperName: user.name,
    }));
  }, []);

  const save = async () => {
    if (!form.sealCode.trim() || !form.sealName.trim()) {
      toast.warning('请填写印章编码和名称');
      return;
    }
    try {
      if (form.sealId) {
        await sealApi.edit(form);
      } else {
        await sealApi.add(form);
      }
      toast.success('保存成功');
      setDialogOpen(false);
      resetForm();
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存印章失败'));
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await sealApi.remove([deleteId]);
      toast.success('删除成功');
      setDeleteId(null);
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除印章失败'));
    }
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[220px]">
                <Input className="h-10" value={query.sealName} onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, sealName: event.target.value }))} placeholder="印章名称" />
              </div>
              <div className="w-full sm:w-[160px]">
                <Select value={query.status || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, status: value === 'ALL' ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>共 {total} 条</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: 10, sealName: '', status: '' })}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} className="mr-1.5" />
                新增印章
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="px-4 py-3 text-left">编码</TableHead>
                    <TableHead className="px-4 py-3 text-left">名称 / 类型</TableHead>
                    <TableHead className="px-4 py-3 text-left">保管人 / 位置</TableHead>
                    <TableHead className="px-4 py-3 text-left">状态 / 预计归还</TableHead>
                    <TableHead className="px-4 py-3 text-left">创建时间</TableHead>
                    <TableActionHead className="w-32 px-4 py-3 text-right">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.length === 0 ? (
                    <TableStateRow colSpan={6} title="暂无印章" />
                  ) : rows.map((item) => (
                    <tr key={item.sealId} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{item.sealCode}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.sealName}</div>
                        <div className="mt-1 text-xs text-slate-400">{TYPE_LABELS[item.sealType] || item.sealType}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{item.keeperName || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.location || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(item.status)}
                        <div className="mt-1 text-xs text-slate-400">{item.borrowDueTime ? formatDateTimeDisplay(item.borrowDueTime) : '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{formatDateTimeDisplay(item.createTime)}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            { label: '编辑', icon: <Edit size={14} />, onClick: () => openEdit(item), tone: 'primary', hidden: isBorrowLocked(item) },
                            { label: '删除', icon: <Trash2 size={14} />, onClick: () => item.sealId && setDeleteId(item.sealId), tone: 'danger', hidden: isBorrowLocked(item) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        pagination={total > 0 ? (
          <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} showPageSizeSelector={false} showJump={false} onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))} onPageSizeChange={() => {}} />
        ) : null}
      />

      <BaseDialog
        open={dialogOpen}
        title={form.sealId ? '编辑印章' : '新增印章'}
        onClose={() => { setDialogOpen(false); resetForm(); }}
        maxWidthClassName="w-full sm:max-w-4xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="max-h-[74vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>取消</Button>
            <Button onClick={() => void save()}>保存</Button>
          </>
        )}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <h4 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">基础信息</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>编码</Label>
                  <Input className="h-11" value={form.sealCode} onChange={(event) => setForm((prev) => ({ ...prev, sealCode: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>名称</Label>
                  <Input className="h-11" value={form.sealName} onChange={(event) => setForm((prev) => ({ ...prev, sealName: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>类型</Label>
                  <Select value={form.sealType} onValueChange={(value) => setForm((prev) => ({ ...prev, sealType: value }))}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>状态</Label>
                  <Select value={form.status || 'AVAILABLE'} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as OaSeal['status'] }))}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(EDITABLE_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>存放位置</Label>
                  <Input className="h-11" value={form.location || ''} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="space-y-2">
                <Label>备注</Label>
                <Textarea className="min-h-[140px] resize-none" value={form.remark || ''} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="space-y-2">
                <Label>保管人</Label>
                <UserSelector
                  value={selectedKeeperIds}
                  onChange={handleKeeperSelectionChange}
                  onUsersChange={updateKeeper}
                  multiple={false}
                  placeholder="搜索姓名、邮箱或部门"
                  dropdownPlacement="bottom"
                />
              </div>
              {form.keeperName ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{form.keeperName}</div>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">印章摘要</h4>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">类型</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{TYPE_LABELS[form.sealType] || '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">状态</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{STATUS_LABELS[form.status || 'AVAILABLE'] || '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">预计归还</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{form.borrowDueTime ? formatDateTimeDisplay(form.borrowDueTime) : '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">位置</dt>
                  <dd className="max-w-[12rem] truncate font-medium text-slate-900 dark:text-slate-100">{form.location || '-'}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </BaseDialog>

      <ConfirmDialog open={Boolean(deleteId)} title="删除印章" message="删除后当前台账记录不可恢复；已有申请记录时后端会转为逻辑删除。" confirmText="删除" danger onConfirm={() => void remove()} onCancel={() => setDeleteId(null)} />
    </div>
  );
};

export default SealListPage;

