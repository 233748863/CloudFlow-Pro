import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { BadgeCheck, Clock3, Edit, Eye, Plus, RefreshCw, RotateCcw, Search, Send, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, ConfirmDialog, DatePicker, Input, Label, ListResultFooter, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import AttachmentLinks, { getAttachmentList } from '@/components/AttachmentLinks';
import FileUpload from '@/components/FileUpload';
import { licenseApi, licenseBorrowApi, OaLicense, OaLicenseBorrow } from '@/services/api/sealLicense';
import { useAuth } from '@/context/AuthContext';
import { PageResult } from '@/types';
import { formatDateTimeDisplay, toBackendDateString, toLocalDatetimeString } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import './LicenseBorrowPage.css';

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

const getStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_license_borrow_status" value={String(status || 'DRAFT')} />
);

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-cf-title">{title}</div>
      </div>
    </td>
  </tr>
);

export const LicenseBorrowPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const statusDict = useDict('oa_license_borrow_status');
  const [rows, setRows] = useState<OaLicenseBorrow[]>([]);
  const [licenses, setLicenses] = useState<OaLicense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), status: '', licenseName: '' });
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
  const activeFilterCount = useMemo(() => [query.status, query.licenseName].filter(Boolean).length, [query.licenseName, query.status]);
  const resultSummary = activeFilterCount > 0 ? `筛选 ${activeFilterCount} 项` : '全部证照借用';
  const stats = useMemo(() => [
    { label: '借用申请', value: String(total), meta: `当前页 ${rows.length}`, icon: <BadgeCheck size={18} />, tone: 'blue' },
    { label: '草稿', value: String(draftCount), meta: '待提交', icon: <Edit size={18} />, tone: 'amber' },
    { label: '审批中', value: String(pendingCount), meta: '流程处理中', icon: <Clock3 size={18} />, tone: 'violet' },
    { label: '已通过', value: String(approvedCount), meta: `第 ${query.pageNum} / ${totalPages} 页`, icon: <BadgeCheck size={18} />, tone: 'green' },
  ], [approvedCount, draftCount, pendingCount, query.pageNum, rows.length, total, totalPages]);

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

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">LICENSE BORROW</p>
          <h2>证照借用</h2>
          <span>提交证照借用申请、跟踪审批状态和归还计划</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchRows()} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!hasPermission('oa:license:add')}>
            <Plus size={16} />
            新建申请
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-borrow-request-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">证照名称</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={query.licenseName}
              onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, licenseName: event.target.value }))}
              placeholder="按证照名称搜索"
              type="search"
            />
          </div>
        </label>
        <label>
          <span className="input-label">状态</span>
          <Select value={query.status || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, status: value === 'ALL' ? '' : value }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {statusDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), status: '', licenseName: '' })} disabled={activeFilterCount === 0}>
            <RotateCcw size={14} className="mr-1.5" />
            重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-license-borrow-table-panel">
      <table className="unity-data-table admin-source-table admin-seal-license-table min-w-[1160px]">
          <thead>
            <tr>
              <th>借用编号</th>
              <th>证照</th>
              <th>用途</th>
              <th>申请人 / 部门</th>
              <th>预计借还</th>
              <th>附件</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={8} title="正在加载证照借用..." loading />
            ) : rows.length === 0 ? (
              <TableStateRow colSpan={8} title="暂无证照借用申请" />
            ) : rows.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="font-medium text-cf-title">{item.borrowNo || '-'}</div>
                  <div className="mt-1 text-xs text-cf-faint">{formatDateTimeDisplay(item.createTime)}</div>
                </td>
                <td>{item.licenseName || '-'}</td>
                <td className="max-w-xs truncate">{item.purpose || '-'}</td>
                <td>
                  <div>{item.userName || '-'}</div>
                  <div className="mt-1 text-xs text-cf-faint">{item.deptName || '-'}</div>
                </td>
                <td>
                  <div>{formatDateTimeDisplay(item.expectedBorrowTime)}</div>
                  <div className="mt-1 text-xs text-cf-faint">{formatDateTimeDisplay(item.expectedReturnTime)}</div>
                </td>
                <td>
                  {getAttachmentList(item.attachmentUrl).length ? `${getAttachmentList(item.attachmentUrl).length} 个` : '-'}
                </td>
                <td>{getStatusBadge(item.status)}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void openDetail(item)}><Eye size={15} /></button>
                    {item.status === 'DRAFT' && hasPermission('oa:license:edit') ? <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => openEdit(item)}><Edit size={15} /></button> : null}
                    {item.status === 'DRAFT' && hasPermission('oa:license:submit') ? <button type="button" data-tooltip="提交" aria-label="提交" onClick={() => setConfirmState({ type: 'submit', id: item.id!, title: '提交证照借用申请', message: '提交后将进入证照借用审批流程。', confirmText: '提交' })}><Send size={15} /></button> : null}
                    {item.status === 'PENDING' && hasPermission('oa:license:cancel') ? <button type="button" data-tooltip="取消" aria-label="取消" onClick={() => setConfirmState({ type: 'cancel', id: item.id!, title: '取消证照借用申请', message: '取消后该申请不再继续审批。', confirmText: '取消' })}><XCircle size={15} /></button> : null}
                    {item.status === 'DRAFT' && hasPermission('oa:license:remove') ? <button type="button" className="danger" data-tooltip="删除" aria-label="删除" onClick={() => setConfirmState({ type: 'delete', id: item.id!, title: '删除证照借用申请', message: '删除后当前草稿不可恢复。', confirmText: '删除', danger: true })}><Trash2 size={15} /></button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = (
    <ListResultFooter
      total={total}
      page={query.pageNum}
      pageSize={query.pageSize}
      summary={resultSummary}
      onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))}
    />
  );

  return (
    <>
      <section className="admin-source-page admin-seal-license-page admin-license-borrow-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={form.id ? '编辑证照借用申请' : '新建证照借用申请'}
        onClose={closeDialog}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>取消</Button>
            <Button onClick={() => void saveForm()} disabled={saving || !hasPermission(form.id ? 'oa:license:edit' : 'oa:license:add')}>保存</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>证照</Label>
              <Select value={form.licenseId ? String(form.licenseId) : ''} onValueChange={(value) => setForm((prev) => ({ ...prev, licenseId: Number(value) }))}>
                <SelectTrigger className="h-11"><SelectValue placeholder="选择证照" /></SelectTrigger>
                <SelectContent>
                  {licenses.map((license) => <SelectItem key={license.licenseId} value={String(license.licenseId)}>{license.licenseName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>预计借出时间</Label>
              <DatePicker className="h-11" type="datetime-local" value={form.expectedBorrowTime || ''} onChange={(event) => setForm((prev) => ({ ...prev, expectedBorrowTime: event.target.value }))} />
            </div>
            <div className="admin-dialog-field">
              <Label>预计归还时间</Label>
              <DatePicker className="h-11" type="datetime-local" value={form.expectedReturnTime || ''} onChange={(event) => setForm((prev) => ({ ...prev, expectedReturnTime: event.target.value }))} />
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>借用用途</Label>
            <Textarea className="min-h-[120px] resize-none" value={form.purpose} onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))} />
          </div>
          <div className="admin-dialog-field">
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
        panelClassName="max-h-[92vh]"
        headerAside={detailBorrow && !detailLoading ? getStatusBadge(detailBorrow.status) : null}
        bodyClassName="admin-dialog-stack admin-license-borrow-detail-dialog-body"
        footer={<Button variant="outline" onClick={() => setDetailBorrow(null)}>关闭</Button>}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-cf-subtle">
            <Clock3 className="mr-2 h-4 w-4 animate-spin" />
            正在加载证照借用详情...
          </div>
        ) : detailBorrow ? (
            <div className="admin-license-borrow-detail-stack">
            <div className="admin-license-borrow-detail-grid grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
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
                <div key={label} className="border-b border-slate-200 pb-3 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-cf-faint">{label}</div>
                  <div className="mt-1.5 text-sm leading-6 text-cf-title">{value || '-'}</div>
                </div>
              ))}
            </div>
            <section className="card admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>借用用途</h3>
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-cf-muted">{detailBorrow.purpose || '-'}</div>
            </section>
            <section className="card admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>附件</h3>
                </div>
              </div>
              <div>
                <AttachmentLinks value={detailBorrow.attachmentUrl} />
              </div>
            </section>
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
    </>
  );
};

export default LicenseBorrowPage;
