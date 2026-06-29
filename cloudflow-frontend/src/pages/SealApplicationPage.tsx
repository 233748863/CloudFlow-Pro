import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import { Clock3, Edit, Eye, FileText, Plus, RefreshCw, RotateCcw, Search, Send, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, ConfirmDialog, DatePicker, Input, Label, ListResultFooter, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import AttachmentLinks, { getAttachmentList } from '@/components/AttachmentLinks';
import FileUpload from '@/components/FileUpload';
import { contractApi, OaRiskAlert, OaTraceEvent } from '@/services/api/contractRisk';
import { OaSeal, OaSealApplication, sealApi, sealApplicationApi } from '@/services/api/sealLicense';
import { useAuth } from '@/context/AuthContext';
import { PageResult } from '@/types';
import { formatDateTimeDisplay, toBackendDateString, toLocalDatetimeString } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

interface ConfirmState {
  type: 'delete' | 'submit' | 'cancel';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const emptyForm: OaSealApplication = {
  sealId: 0,
  documentName: '',
  useScene: 'CONTRACT',
  copyCount: 1,
  purpose: '',
  expectedReturnTime: '',
  attachmentUrl: '',
};

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const getStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_seal_application_status" value={String(status || 'DRAFT')} />
);

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-6">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

export const SealApplicationPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const statusDict = useDict('oa_seal_application_status');
  const sceneDict = useDict('oa_seal_scene');
  const [rows, setRows] = useState<OaSealApplication[]>([]);
  const [seals, setSeals] = useState<OaSeal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), status: '', documentName: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OaSealApplication>(emptyForm);
  const [detailApplication, setDetailApplication] = useState<OaSealApplication | null>(null);
  const [contractTimeline, setContractTimeline] = useState<OaTraceEvent[]>([]);
  const [contractRisks, setContractRisks] = useState<OaRiskAlert[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sealApplicationApi.list({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        status: query.status || undefined,
        documentName: query.documentName || undefined,
      });
      setRows(normalizeRows(result));
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取用印申请列表失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  const fetchSeals = useCallback(async () => {
    try {
      setSeals(await sealApi.available());
    } catch (error) {
      toast.error(getErrorMessage(error, '加载印章列表失败'));
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    void fetchSeals();
  }, [fetchSeals]);

  const selectedSeal = useMemo(() => seals.find((item) => item.sealId === form.sealId), [form.sealId, seals]);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const draftCount = useMemo(() => rows.filter((item) => item.status === 'DRAFT').length, [rows]);
  const pendingCount = useMemo(() => rows.filter((item) => item.status === 'PENDING').length, [rows]);
  const approvedCount = useMemo(() => rows.filter((item) => item.status === 'APPROVED').length, [rows]);
  const activeFilterCount = useMemo(() => [query.status, query.documentName].filter(Boolean).length, [query.documentName, query.status]);
  const resultSummary = activeFilterCount > 0 ? `筛选 ${activeFilterCount} 项` : '全部用印';
  const stats = useMemo(() => [
    { label: '用印申请', value: String(total), meta: `当前页 ${rows.length}`, icon: <FileText size={18} />, tone: 'blue' },
    { label: '草稿', value: String(draftCount), meta: '待提交', icon: <Edit size={18} />, tone: 'amber' },
    { label: '审批中', value: String(pendingCount), meta: '流程处理中', icon: <Clock3 size={18} />, tone: 'violet' },
    { label: '已通过', value: String(approvedCount), meta: `第 ${query.pageNum} / ${totalPages} 页`, icon: <FileText size={18} />, tone: 'green' },
  ], [approvedCount, draftCount, pendingCount, query.pageNum, rows.length, total, totalPages]);

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: OaSealApplication) => {
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

  const openDetail = async (item: OaSealApplication) => {
    setDetailApplication(item);
    setContractTimeline([]);
    setContractRisks([]);
    setDetailLoading(true);
    try {
      const detail = await sealApplicationApi.getInfo(item.id!);
      setDetailApplication(detail);
      if (detail.contractId) {
        const [timelineResult, riskResult] = await Promise.all([
          contractApi.timeline(detail.contractId),
          contractApi.risks(detail.contractId),
        ]);
        setContractTimeline(timelineResult);
        setContractRisks(riskResult);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取用印申请详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const saveForm = async () => {
    if (!form.sealId || !form.documentName.trim() || !form.purpose.trim() || !form.expectedReturnTime) {
      toast.warning('请补全印章、文件名称、用途和预计归还时间');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        sealName: selectedSeal?.sealName,
        expectedBorrowTime: form.expectedBorrowTime ? toBackendDateString(form.expectedBorrowTime) : undefined,
        expectedReturnTime: toBackendDateString(form.expectedReturnTime),
      };
      if (payload.id) {
        await sealApplicationApi.edit(payload);
      } else {
        await sealApplicationApi.add(payload);
      }
      toast.success('保存成功');
      closeDialog();
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存用印申请失败'));
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
        await sealApplicationApi.remove([current.id]);
        toast.success('删除成功');
      } else if (current.type === 'cancel') {
        await sealApplicationApi.cancel(current.id);
        toast.success('取消成功');
      } else {
        await sealApplicationApi.submit(current.id);
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
          <p className="admin-source-kicker">SEAL APPLICATION</p>
          <h2>用印申请</h2>
          <span>提交用印需求、关联文件场景并跟踪审批状态</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchRows()} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!hasPermission('oa:seal:add')}>
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
          <span className="input-label">文件名称</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={query.documentName}
              onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, documentName: event.target.value }))}
              placeholder="按文件名称搜索"
              type="search"
            />
          </div>
        </label>
        <label>
          <span className="input-label">状态</span>
          <Select
            value={query.status || 'ALL'}
            onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, status: value === 'ALL' ? '' : value }))}
          >
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {statusDict.getOptions().map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), status: '', documentName: '' })} disabled={activeFilterCount === 0}>
            <RotateCcw size={14} className="mr-1.5" />
            重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-seal-application-table-panel">
      <table className="unity-data-table admin-source-table admin-seal-license-table min-w-[1160px]">
          <thead>
            <tr>
              <th>申请编号</th>
              <th>印章</th>
              <th>文件 / 场景</th>
              <th>申请人 / 部门</th>
              <th>预计借还</th>
              <th>附件</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={8} title="正在加载用印申请..." loading />
            ) : rows.length === 0 ? (
              <TableStateRow colSpan={8} title="暂无用印申请" />
            ) : rows.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{item.applicationNo || '-'}</div>
                  <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.createTime)}</div>
                </td>
                <td>{item.sealName || '-'}</td>
                <td>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{item.documentName || '-'}</div>
                  <div className="mt-1 text-xs text-slate-400">{sceneDict.getLabel(String(item.useScene ?? '')) || '-'}</div>
                </td>
                <td>
                  <div>{item.userName || '-'}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.deptName || '-'}</div>
                </td>
                <td>
                  <div>{formatDateTimeDisplay(item.expectedBorrowTime)}</div>
                  <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.expectedReturnTime)}</div>
                </td>
                <td>
                  {getAttachmentList(item.attachmentUrl).length ? `${getAttachmentList(item.attachmentUrl).length} 个` : '-'}
                </td>
                <td>{getStatusBadge(item.status)}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" title="详情" onClick={() => void openDetail(item)}><Eye size={15} /></button>
                    {item.status === 'DRAFT' && hasPermission('oa:seal:edit') ? <button type="button" title="编辑" onClick={() => openEdit(item)}><Edit size={15} /></button> : null}
                    {item.status === 'DRAFT' && hasPermission('oa:seal:submit') ? <button type="button" title="提交" onClick={() => setConfirmState({ type: 'submit', id: item.id!, title: '提交用印申请', message: '提交后将进入用印审批流程。', confirmText: '提交' })}><Send size={15} /></button> : null}
                    {item.status === 'PENDING' && hasPermission('oa:seal:cancel') ? <button type="button" title="取消" onClick={() => setConfirmState({ type: 'cancel', id: item.id!, title: '取消用印申请', message: '取消后该申请不再继续审批。', confirmText: '取消' })}><XCircle size={15} /></button> : null}
                    {item.status === 'DRAFT' && hasPermission('oa:seal:remove') ? <button type="button" className="danger" title="删除" onClick={() => setConfirmState({ type: 'delete', id: item.id!, title: '删除用印申请', message: '删除后当前草稿不可恢复。', confirmText: '删除', danger: true })}><Trash2 size={15} /></button> : null}
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
      <section className="admin-source-page admin-seal-license-page admin-seal-application-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={form.id ? '编辑用印申请' : '新建用印申请'}
        onClose={closeDialog}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>取消</Button>
            <Button onClick={() => void saveForm()} disabled={saving || !hasPermission(form.id ? 'oa:seal:edit' : 'oa:seal:add')}>保存</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>印章</Label>
              <Select value={form.sealId ? String(form.sealId) : ''} onValueChange={(value) => setForm((prev) => ({ ...prev, sealId: Number(value) }))}>
                <SelectTrigger className="h-11"><SelectValue placeholder="选择印章" /></SelectTrigger>
                <SelectContent>
                  {seals.map((seal) => <SelectItem key={seal.sealId} value={String(seal.sealId)}>{seal.sealName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>用印场景</Label>
              <Select value={form.useScene || 'CONTRACT'} onValueChange={(value) => setForm((prev) => ({ ...prev, useScene: value }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sceneDict.getOptions().map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>文件名称</Label>
              <Input className="h-11" value={form.documentName} onChange={(event) => setForm((prev) => ({ ...prev, documentName: event.target.value }))} />
            </div>
            <div className="admin-dialog-field">
              <Label>用印份数</Label>
              <Input className="h-11" type="number" min={1} value={form.copyCount || 1} onChange={(event) => setForm((prev) => ({ ...prev, copyCount: Number(event.target.value) || 1 }))} />
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
            <Label>用印用途</Label>
            <Textarea className="min-h-[120px] resize-none" value={form.purpose} onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))} />
          </div>
          <div className="admin-dialog-field">
            <Label>附件</Label>
            <FileUpload value={form.attachmentUrl || ''} onChange={(urls) => setForm((prev) => ({ ...prev, attachmentUrl: urls }))} maxCount={5} />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailApplication)}
        title={detailApplication?.applicationNo || '用印申请详情'}
        onClose={() => setDetailApplication(null)}
        width="wide"
        headerAside={detailApplication && !detailLoading ? getStatusBadge(detailApplication.status) : null}
        bodyClassName="admin-dialog-stack"
        footer={<Button variant="outline" onClick={() => setDetailApplication(null)}>关闭</Button>}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-slate-400">
            <Clock3 className="mr-2 h-4 w-4 animate-spin" />
            正在加载用印详情...
          </div>
        ) : detailApplication ? (
          <div className="admin-dialog-stack">
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['印章', detailApplication.sealName],
                ['关联合同', detailApplication.contractNo],
                ['文件名称', detailApplication.documentName],
                ['用印场景', sceneDict.getLabel(String(detailApplication.useScene ?? ''))],
                ['申请人', detailApplication.userName],
                ['所属部门', detailApplication.deptName],
                ['预计借出', formatDateTimeDisplay(detailApplication.expectedBorrowTime)],
                ['预计归还', formatDateTimeDisplay(detailApplication.expectedReturnTime)],
                ['实际借出', formatDateTimeDisplay(detailApplication.actualBorrowTime)],
                ['实际归还', formatDateTimeDisplay(detailApplication.actualReturnTime)],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-slate-200 pb-3 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
                  <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
                </div>
              ))}
            </div>
            <section className="card admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>用印用途</h3>
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{detailApplication.purpose || '-'}</div>
            </section>
            <section className="card admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>附件</h3>
                </div>
              </div>
              <div>
                <AttachmentLinks value={detailApplication.attachmentUrl} />
              </div>
            </section>
            {detailApplication.contractId ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="card admin-source-panel">
                  <div className="admin-source-panel-head">
                    <div>
                      <h3>合同风险</h3>
                    </div>
                  </div>
                  <div>
                    {contractRisks.length ? (
                      <div className="grid gap-2">
                        {contractRisks.slice(0, 5).map((risk) => (
                          <div key={risk.id} className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{risk.riskName}</div>
                            <div className="mt-1 text-xs text-slate-400">{risk.riskLevel} / {risk.riskStatus}</div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="py-6 text-center text-sm text-slate-400">暂无风险记录</div>}
                  </div>
                </section>
                <section className="card admin-source-panel">
                  <div className="admin-source-panel-head">
                    <div>
                      <h3>合同链路</h3>
                    </div>
                  </div>
                  <div>
                    {contractTimeline.length ? (
                      <div className="grid gap-2">
                        {contractTimeline.slice(-5).reverse().map((event) => (
                          <div key={event.id} className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-slate-900 dark:text-slate-100">{event.eventTitle}</span>
                              <span className="text-xs text-slate-400">{formatDateTimeDisplay(event.eventTime)}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-400">{event.eventContent || '-'}</div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="py-6 text-center text-sm text-slate-400">暂无链路事件</div>}
                  </div>
                </section>
              </div>
            ) : null}
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

export default SealApplicationPage;
