import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
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
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
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

  const filters = (
    <FilterBar
      search={{
        value: query.requestNo,
        onChange: (value) => setQuery((q) => ({ ...q, requestNo: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '搜索申请编号',
        widthClassName: 'w-full sm:w-[200px]',
      }}
      filters={[
        <div key="type" className="w-full sm:w-40">
          <Select value={query.requestType || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, requestType: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部类型</SelectItem>
              {typeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
        <div key="status" className="w-full sm:w-36">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, requestNo: '', requestType: '', status: '' }))}>
                <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
              </Button>,
            ]
          : []),
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        <Button key="add" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />新建申领
        </Button>,
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>申请编号</TableHead>
              <TableHead>员工 ID</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>金额 / 积分</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>申请时间</TableHead>
              <TableHead>发放时间</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">暂无数据</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">{row.requestNo}</td>
                  <td className="px-4 py-3 text-sm">{row.employeeId}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_benefit_request_type" value={row.requestType} fallback="-" /></td>
                  <td className="px-4 py-3 text-xs">
                    {row.amount ? formatMoneyValue(row.amount) : '-'}
                    {row.pointAmount ? ` / ${row.pointAmount} 分` : ''}
                  </td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_benefit_request_status" value={row.status} fallback="-" /></td>
                  <td className="px-4 py-3 text-xs">{formatDateTimeValue(row.createTime)}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTimeValue(row.paidAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'edit', label: '编辑', semantic: 'edit', onClick: () => openEdit(row), hidden: !hasWorkflowStatus(row.status, 'DRAFT') },
                        { key: 'submit', label: '提交', semantic: 'submit', onClick: () => void handleSubmit(row), hidden: !hasWorkflowStatus(row.status, 'DRAFT') },
                        { key: 'cancel', label: '取消', semantic: 'void', onClick: () => { setCancelTarget(row); setCancelReason('撤回'); }, hidden: !hasWorkflowStatus(row.status, 'DRAFT', 'SUBMITTED', 'APPROVING') },
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

  const pagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} pagination={pagination} />

      <BaseDialog
        open={showForm}
        title={editing ? '编辑福利申领' : '新建福利申领'}
        onClose={() => setShowForm(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
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
            <div>
              <Label>方案 ID(可选)</Label>
              <Input
                type="number"
                value={String(form.schemeId ?? '')}
                onChange={(e) => setForm({ ...form, schemeId: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div>
              <Label>金额</Label>
              <Input
                type="number"
                value={String(form.amount ?? '')}
                onChange={(e) => setForm({ ...form, amount: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div>
              <Label>积分</Label>
              <Input
                type="number"
                value={String(form.pointAmount ?? '')}
                onChange={(e) => setForm({ ...form, pointAmount: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          </div>
          <div>
            <Label>申请理由</Label>
            <Textarea
              rows={3}
              value={form.reason ?? ''}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={cancelTarget !== null}
        title={`取消申领 · ${cancelTarget?.requestNo ?? ''}`}
        onClose={() => setCancelTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>关闭</Button>
            <Button onClick={() => void handleCancel()}>确认取消</Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label>取消理由</Label>
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="请输入取消理由" />
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrBenefitRequestPage;
