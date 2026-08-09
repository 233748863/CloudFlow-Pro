import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Ban, Edit, LoaderCircle, Plus, RefreshCcw, RotateCcw, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  cancelBenefitRequest,
  createBenefitRequest,
  listBenefitRequests,
  submitBenefitRequest,
  updateBenefitRequest,
  type HrBenefitRequest,
  type HrBenefitRequestPayload,
} from '@/services/api/hr';
import {
  formatDateTimeValue,
  formatMoneyValue,
  hasWorkflowStatus,
  normalizeRows,
} from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';

const emptyForm: Partial<HrBenefitRequestPayload> = {
  requestType: 'BENEFIT_CLAIM',
  amount: undefined,
  pointAmount: undefined,
  reason: '',
  schemeId: undefined,
};

export const HrBenefitRequestPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<HrBenefitRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({ requestNo: '', requestType: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [editing, setEditing] = useState<HrBenefitRequest | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<HrBenefitRequestPayload>>(emptyForm);
  const [cancelTarget, setCancelTarget] = useState<HrBenefitRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('撤回');

  const { getOptions: getTypeOptions } = useDict('hr_benefit_request_type');
  const { getOptions: getStatusOptions } = useDict('hr_benefit_request_status');
  const typeOptions = getTypeOptions();
  const statusOptions = getStatusOptions();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.requestNo) params.requestNo = query.requestNo;
      if (query.requestType) params.requestType = query.requestType;
      if (query.status) params.status = query.status;
      const res = await listBenefitRequests(params);
      setRows(normalizeRows<HrBenefitRequest>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载福利申领失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (row: HrBenefitRequest) => {
    setEditing(row);
    setForm({
      requestType: row.requestType,
      schemeId: row.schemeId,
      amount: row.amount,
      pointAmount: row.pointAmount,
      reason: row.reason,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await updateBenefitRequest(editing.id, form);
        toast.success('已更新');
      } else {
        await createBenefitRequest(form as HrBenefitRequestPayload);
        toast.success('已创建');
      }
      setShowForm(false);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleSubmit = async (row: HrBenefitRequest) => {
    try {
      await submitBenefitRequest(row.id);
      toast.success('已提交审批');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交失败'));
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelBenefitRequest(cancelTarget.id, cancelReason.trim() || undefined);
      toast.success('已取消');
      setCancelTarget(null);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消失败'));
    }
  };

  const hasFilters = Boolean(query.requestNo || query.requestType || query.status);

  const draftCount = rows.filter((row) => hasWorkflowStatus(row.status, 'DRAFT')).length;
  const approvingCount = rows.filter((row) => hasWorkflowStatus(row.status, 'SUBMITTED', 'APPROVING')).length;
  const paidCount = rows.filter((row) => hasWorkflowStatus(row.status, 'PAID', 'COMPLETED')).length;

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">benefit request</p>
          <h2>福利申领</h2>
          <span>管理员工福利申请、审批提交、取消和发放状态。</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />新建申领
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><Plus size={18} /></span>
          <div><p>申领总数</p><strong>{total}</strong><span>当前查询范围</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><Edit size={18} /></span>
          <div><p>草稿</p><strong>{draftCount}</strong><span>待编辑提交</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><Send size={18} /></span>
          <div><p>审批中</p><strong>{approvingCount}</strong><span>已提交待处理</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><RefreshCcw size={18} /></span>
          <div><p>已发放</p><strong>{paidCount}</strong><span>完成发放记录</span></div>
        </article>
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form
        className="admin-users-filter-grid"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery((q) => ({ ...q, pageNum: 1 }));
        }}
      >
        <label>
          <span>申请编号</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={query.requestNo}
              onChange={(event) => setQuery((q) => ({ ...q, requestNo: event.target.value }))}
              className="cf-control"
              placeholder="搜索申请编号"
            />
          </div>
        </label>
        <label>
          <span>类型</span>
          <Select value={query.requestType || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, requestType: v === '__all' ? '' : v }))}>
            <SelectTrigger className="cf-control"><SelectValue placeholder="全部类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部类型</SelectItem>
              {typeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>状态</span>
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="cf-control"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button type="submit" size="sm">查询</Button>
          {hasFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, requestNo: '', requestType: '', status: '' }))}>
              <RotateCcw className="h-4 w-4" />清空条件
            </Button>
          ) : null}
          <span className="admin-users-filter-count">共 {total} 条</span>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
      <table className="unity-data-table admin-source-table min-w-[1080px]">
        <thead>
          <tr>
            <th>申请编号</th>
            <th>员工 ID</th>
            <th>类型</th>
            <th>金额 / 积分</th>
            <th>状态</th>
            <th>申请时间</th>
            <th>发放时间</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8} className="py-10 text-center text-sm text-cf-faint">
                <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-10 text-center text-sm text-cf-faint">暂无数据</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs">{row.requestNo}</td>
                <td className="text-sm">{row.employeeId}</td>
                <td className="text-sm"><DictLabel dictType="hr_benefit_request_type" value={row.requestType} fallback="-" /></td>
                <td className="text-xs">
                  {row.amount ? formatMoneyValue(row.amount) : '-'}
                  {row.pointAmount ? ` / ${row.pointAmount} 分` : ''}
                </td>
                <td className="text-sm"><DictLabel dictType="hr_benefit_request_status" value={row.status} fallback="-" /></td>
                <td className="text-xs">{formatDateTimeValue(row.createTime)}</td>
                <td className="text-xs">{formatDateTimeValue(row.paidAt)}</td>
                <td>
                  <div className="admin-users-row-actions">
                    {hasWorkflowStatus(row.status, 'DRAFT') ? (
                      <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => openEdit(row)}><Edit size={15} /></button>
                    ) : null}
                    {hasWorkflowStatus(row.status, 'DRAFT') ? (
                      <button type="button" data-tooltip="提交" aria-label="提交" onClick={() => void handleSubmit(row)}><Send size={15} /></button>
                    ) : null}
                    {hasWorkflowStatus(row.status, 'DRAFT', 'SUBMITTED', 'APPROVING') ? (
                      <button type="button" className="danger" data-tooltip="取消" aria-label="取消" onClick={() => { setCancelTarget(row); setCancelReason('撤回'); }}><Ban size={15} /></button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
    />
  ) : null;

  return (
    <section className="admin-source-page hr-benefit-request-page">
      <TablePageLayout
        className="hr-benefit-request-layout"
        actions={pageActions}
        filters={pageFilters}
        table={pageTable}
        pagination={pagePagination}
      />

      <BaseDialog
        open={showForm}
        title={editing ? '编辑福利申领' : '新建福利申领'}
        onClose={() => setShowForm(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="admin-dialog-field">
            <Label>类型</Label>
            <Select value={String(form.requestType ?? 'BENEFIT_CLAIM')} onValueChange={(v) => setForm({ ...form, requestType: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>方案 ID(可选)</Label>
              <Input
                type="number"
                value={String(form.schemeId ?? '')}
                onChange={(e) => setForm({ ...form, schemeId: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>金额</Label>
              <Input
                type="number"
                value={String(form.amount ?? '')}
                onChange={(e) => setForm({ ...form, amount: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>积分</Label>
              <Input
                type="number"
                value={String(form.pointAmount ?? '')}
                onChange={(e) => setForm({ ...form, pointAmount: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>申请理由</Label>
            <Textarea
              rows={3}
              value={form.reason ?? ''}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
      </BaseDialog>

      <BaseDialog
        open={cancelTarget !== null}
        title={`取消申领 · ${cancelTarget?.requestNo ?? ''}`}
        onClose={() => setCancelTarget(null)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>关闭</Button>
            <Button onClick={() => void handleCancel()}>确认取消</Button>
          </div>
        }
      >
        <div className="admin-dialog-field">
          <Label>取消理由</Label>
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="请输入取消理由" />
        </div>
      </BaseDialog>
    </section>
  );
};

export default HrBenefitRequestPage;
