import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Clock3, Edit, Eye, Plus, RotateCcw, Send, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, ConfirmDialog, DatePicker, Input, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import AttachmentLinks, { getAttachmentList } from '@/components/AttachmentLinks';
import FileUpload from '@/components/FileUpload';
import { licenseApi, licenseBorrowApi, OaLicense, OaLicenseBorrow } from '@/services/api/sealLicense';
import { PageResult } from '@/types';
import { formatDateTimeDisplay, toBackendDateString, toLocalDatetimeString } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  BORROWED: '已借出',
  RETURNED: '已归还',
  OVERDUE: '已逾期',
  CANCELLED: '已取消',
};

interface ConfirmState {
  type: 'delete' | 'submit' | 'cancel';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const emptyForm: OaLicenseBorrow = {
  licenseId: 0,
  purpose: '',
  expectedReturnTime: '',
  attachmentUrl: '',
};

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const getStatusBadge = (status?: string) => {
  const toneMap: Record<string, string> = {
    DRAFT: 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    PENDING: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    APPROVED: 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    REJECTED: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    BORROWED: 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    RETURNED: 'border border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200',
    OVERDUE: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    CANCELLED: 'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'DRAFT'] || toneMap.DRAFT}`}>
      {STATUS_LABELS[status || 'DRAFT'] || status || '-'}
    </span>
  );
};

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

export const LicenseBorrowPage: React.FC = () => {
  const [rows, setRows] = useState<OaLicenseBorrow[]>([]);
  const [licenses, setLicenses] = useState<OaLicense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, status: '', licenseName: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OaLicenseBorrow>(emptyForm);
  const [detailBorrow, setDetailBorrow] = useState<OaLicenseBorrow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await licenseBorrowApi.list({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        status: query.status || undefined,
        licenseName: query.licenseName || undefined,
      });
      setRows(normalizeRows(result));
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取证照借用列表失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  const fetchLicenses = useCallback(async () => {
    try {
      setLicenses(await licenseApi.available());
    } catch (error) {
      toast.error(getErrorMessage(error, '加载证照列表失败'));
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    void fetchLicenses();
  }, [fetchLicenses]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const draftCount = useMemo(() => rows.filter((item) => item.status === 'DRAFT').length, [rows]);
  const pendingCount = useMemo(() => rows.filter((item) => item.status === 'PENDING').length, [rows]);
  const approvedCount = useMemo(() => rows.filter((item) => item.status === 'APPROVED').length, [rows]);

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: OaLicenseBorrow) => {
    setForm({
      ...item,
      expectedBorrowTime: item.expectedBorrowTime ? toLocalDatetimeString(item.expectedBorrowTime) : '',
      expectedReturnTime: item.expectedReturnTime ? toLocalDatetimeString(item.expectedReturnTime) : '',
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setForm(emptyForm);
  };

  const openDetail = async (item: OaLicenseBorrow) => {
    setDetailBorrow(item);
    setDetailLoading(true);
    try {
      setDetailBorrow(await licenseBorrowApi.getInfo(item.id!));
    } catch (error) {
      toast.error(getErrorMessage(error, '获取证照借用详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const saveForm = async () => {
    if (!form.licenseId || !form.purpose.trim() || !form.expectedReturnTime) {
      toast.warning('请补全证照、借用用途和预计归还时间');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        expectedBorrowTime: form.expectedBorrowTime ? toBackendDateString(form.expectedBorrowTime) : undefined,
        expectedReturnTime: toBackendDateString(form.expectedReturnTime),
      };
      if (payload.id) {
        await licenseBorrowApi.edit(payload);
      } else {
        await licenseBorrowApi.add(payload);
      }
      toast.success('保存成功');
      closeDialog();
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存证照借用申请失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    const current = confirmState;
    setConfirmState(null);
    try {
      if (current.type === 'delete') {
        await licenseBorrowApi.remove([current.id]);
        toast.success('删除成功');
      } else if (current.type === 'cancel') {
        await licenseBorrowApi.cancel(current.id);
        toast.success('取消成功');
      } else {
        await licenseBorrowApi.submit(current.id);
        toast.success('提交成功');
      }
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[180px]">
                <Select value={query.status || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, status: value === 'ALL' ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[220px]">
                <Input className="h-10" value={query.licenseName} onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, licenseName: event.target.value }))} placeholder="证照名称" />
              </div>
              <div className="flex min-w-[280px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>第 {query.pageNum} / {totalPages} 页</span>
                <span>共 {total} 条</span>
                <span>草稿 {draftCount}</span>
                <span>审批中 {pendingCount}</span>
                <span>已通过 {approvedCount}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: 10, status: '', licenseName: '' })}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} className="mr-1.5" />
                新建申请
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="px-4 py-3 text-left">借用编号</TableHead>
                    <TableHead className="px-4 py-3 text-left">证照</TableHead>
                    <TableHead className="px-4 py-3 text-left">用途</TableHead>
                    <TableHead className="px-4 py-3 text-left">申请人 / 部门</TableHead>
                    <TableHead className="px-4 py-3 text-left">预计借还</TableHead>
                    <TableHead className="px-4 py-3 text-left">附件</TableHead>
                    <TableHead className="px-4 py-3 text-left">状态</TableHead>
                    <TableActionHead className="w-40 px-4 py-3 text-right">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={8} title="正在加载证照借用..." loading />
                  ) : rows.length === 0 ? (
                    <TableStateRow colSpan={8} title="暂无证照借用申请" />
                  ) : rows.map((item) => (
                    <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.borrowNo || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.createTime)}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{item.licenseName || '-'}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{item.purpose || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{item.userName || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.deptName || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{formatDateTimeDisplay(item.expectedBorrowTime)}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.expectedReturnTime)}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {getAttachmentList(item.attachmentUrl).length ? `${getAttachmentList(item.attachmentUrl).length} 个` : '-'}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            { label: '详情', icon: <Eye size={14} />, onClick: () => void openDetail(item), tone: 'neutral' },
                            { label: '编辑', icon: <Edit size={14} />, onClick: () => openEdit(item), tone: 'primary', hidden: item.status !== 'DRAFT' },
                            { label: '提交', icon: <Send size={14} />, onClick: () => setConfirmState({ type: 'submit', id: item.id!, title: '提交证照借用申请', message: '提交后将进入证照借用审批流程。', confirmText: '提交' }), tone: 'success', hidden: item.status !== 'DRAFT' },
                            { label: '取消', icon: <XCircle size={14} />, onClick: () => setConfirmState({ type: 'cancel', id: item.id!, title: '取消证照借用申请', message: '取消后该申请不再继续审批。', confirmText: '取消' }), tone: 'warning', hidden: item.status !== 'PENDING' },
                            { label: '删除', icon: <Trash2 size={14} />, onClick: () => setConfirmState({ type: 'delete', id: item.id!, title: '删除证照借用申请', message: '删除后当前草稿不可恢复。', confirmText: '删除', danger: true }), tone: 'danger', hidden: item.status !== 'DRAFT' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TableSurfaceCard>)}
        pagination={total > 0 ? (
          <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} showPageSizeSelector={false} showJump={false} onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))} onPageSizeChange={() => {}} />
        ) : null}
      />

      <BaseDialog
        open={dialogOpen}
        title={form.id ? '编辑证照借用申请' : '新建证照借用申请'}
        onClose={closeDialog}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>取消</Button>
            <Button onClick={() => void saveForm()} disabled={saving}>保存</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>证照</Label>
              <Select value={form.licenseId ? String(form.licenseId) : ''} onValueChange={(value) => setForm((prev) => ({ ...prev, licenseId: Number(value) }))}>
                <SelectTrigger className="h-11"><SelectValue placeholder="选择证照" /></SelectTrigger>
                <SelectContent>
                  {licenses.map((license) => <SelectItem key={license.licenseId} value={String(license.licenseId)}>{license.licenseName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>预计借出时间</Label>
              <DatePicker className="h-11" type="datetime-local" value={form.expectedBorrowTime || ''} onChange={(event) => setForm((prev) => ({ ...prev, expectedBorrowTime: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>预计归还时间</Label>
              <DatePicker className="h-11" type="datetime-local" value={form.expectedReturnTime || ''} onChange={(event) => setForm((prev) => ({ ...prev, expectedReturnTime: event.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>借用用途</Label>
            <Textarea className="min-h-[120px] resize-none" value={form.purpose} onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>附件</Label>
            <FileUpload value={form.attachmentUrl || ''} onChange={(urls) => setForm((prev) => ({ ...prev, attachmentUrl: urls }))} maxCount={5} />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailBorrow)}
        title={detailBorrow?.borrowNo || '证照借用详情'}
        onClose={() => setDetailBorrow(null)}
        width="wide"
        headerAside={detailBorrow && !detailLoading ? getStatusBadge(detailBorrow.status) : null}
        footer={<Button variant="outline" onClick={() => setDetailBorrow(null)}>关闭</Button>}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-slate-400">
            <Clock3 className="mr-2 h-4 w-4 animate-spin" />
            正在加载证照借用详情...
          </div>
        ) : detailBorrow ? (
          <div className="space-y-4">
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['证照', detailBorrow.licenseName],
                ['申请人', detailBorrow.userName],
                ['所属部门', detailBorrow.deptName],
                ['预计借出', formatDateTimeDisplay(detailBorrow.expectedBorrowTime)],
                ['预计归还', formatDateTimeDisplay(detailBorrow.expectedReturnTime)],
                ['实际借出', formatDateTimeDisplay(detailBorrow.actualBorrowTime)],
                ['实际归还', formatDateTimeDisplay(detailBorrow.actualReturnTime)],
                ['经办人', detailBorrow.handlerName],
                ['流程实例', detailBorrow.instanceId],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
                  <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">借用用途</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{detailBorrow.purpose || '-'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">附件</div>
              <AttachmentLinks value={detailBorrow.attachmentUrl} />
            </div>
          </div>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || '确认操作'}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || '确定'}
        danger={confirmState?.danger}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default LicenseBorrowPage;

