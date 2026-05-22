import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
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
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
  enumLabel,
  formatDateTimeValue,
  formatMoneyValue,
  hasWorkflowStatus,
  normalizeRows,
} from '../hrShared';

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  APPROVING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  PAID: '已发放',
  CANCELLED: '已取消',
};

const typeOptions = [
  { value: 'BENEFIT_CLAIM', label: '福利申领' },
  { value: 'POINT_TOPUP', label: '积分充值' },
  { value: 'POINT_ADJUST', label: '积分调整' },
];

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
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editing, setEditing] = useState<HrBenefitRequest | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<HrBenefitRequestPayload>>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await listBenefitRequests(params);
      setRows(normalizeRows<HrBenefitRequest>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载福利申领失败'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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

  const handleCancel = async (row: HrBenefitRequest) => {
    const reason = window.prompt('取消理由', '撤回');
    if (reason === null) return;
    try {
      await cancelBenefitRequest(row.id, reason || undefined);
      toast.success('已取消');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消失败'));
    }
  };

  const statusOptions = useMemo(
    () => [{ value: 'all', label: '全部' }, ...Object.entries(statusLabel).map(([value, label]) => ({ value, label }))],
    [],
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">福利申领审批</div>
          <div className="mt-1 text-xs text-slate-500">HR 视角统一查看与处理员工福利申领</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Label className="text-xs text-slate-500">状态</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>刷新</Button>
          <Button onClick={openCreate}>新建申领</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>申请编号</TableHead>
              <TableHead>员工 ID</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>金额 / 积分</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>申请时间</TableHead>
              <TableHead>发放时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm text-slate-400">暂无数据</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.requestNo}</TableCell>
                  <TableCell>{row.employeeId}</TableCell>
                  <TableCell>{enumLabel({ BENEFIT_CLAIM: '福利申领', POINT_TOPUP: '积分充值', POINT_ADJUST: '积分调整' }, row.requestType)}</TableCell>
                  <TableCell className="text-xs">
                    {row.amount ? formatMoneyValue(row.amount) : '-'}
                    {row.pointAmount ? ` / ${row.pointAmount} 分` : ''}
                  </TableCell>
                  <TableCell>{enumLabel(statusLabel, row.status)}</TableCell>
                  <TableCell className="text-xs">{formatDateTimeValue(row.createTime)}</TableCell>
                  <TableCell className="text-xs">{formatDateTimeValue(row.paidAt)}</TableCell>
                  <TableCell className="space-x-2 text-xs">
                    {hasWorkflowStatus(row.status, 'DRAFT') && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                        <Button size="sm" onClick={() => void handleSubmit(row)}>提交</Button>
                      </>
                    )}
                    {hasWorkflowStatus(row.status, 'DRAFT', 'SUBMITTED', 'APPROVING') && (
                      <Button size="sm" variant="outline" onClick={() => void handleCancel(row)}>取消</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

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
    </div>
  );
};

export default HrBenefitRequestPage;
