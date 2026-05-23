import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, LoaderCircle, Plus, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DatePicker,
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
import FileUpload from '@/components/FileUpload';
import {
  hrAttendanceAppealApi,
  type AttendanceAppealReason,
  type AttendanceAppealStatus,
  type HrAttendanceAppeal,
} from '@/services/api/hr/batch2';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

const STATUS_LABELS: Record<AttendanceAppealStatus, { label: string; cls: string }> = {
  DRAFT: { label: '草稿', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
  SUBMITTED: { label: '已提交', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  MANAGER_REVIEWING: { label: '主管审核中', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  HR_REVIEWING: { label: 'HR 复核中', cls: 'border-violet-200 bg-violet-50 text-violet-700' },
  APPROVED: { label: '已通过', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  REJECTED: { label: '已驳回', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  CANCELLED: { label: '已撤回', cls: 'border-slate-200 bg-slate-50 text-slate-500' },
};

const REASON_LABELS: Record<AttendanceAppealReason, string> = {
  FORGOT_CLOCK: '忘记打卡',
  BUSINESS_TRIP: '外出公干',
  EQUIPMENT_FAULT: '设备故障',
  SYSTEM_ERROR: '系统异常',
  OTHER: '其他',
};

const emptyForm = (): HrAttendanceAppeal => ({
  attendanceDate: new Date().toISOString().slice(0, 10),
  appealReason: 'FORGOT_CLOCK',
  appealDetail: '',
  evidenceUrl: '',
  expectedClockIn: '',
  expectedClockOut: '',
});

const HrAttendanceAppealPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:attendance:edit') ?? true;

  const [rows, setRows] = useState<HrAttendanceAppeal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ employeeName: '', status: '', pageNum: 1, pageSize: 10 });

  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<HrAttendanceAppeal>(emptyForm);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const [pendingCancel, setPendingCancel] = useState<HrAttendanceAppeal | null>(null);

  const [managerOpen, setManagerOpen] = useState(false);
  const [managerForm, setManagerForm] = useState<{ id?: number; pass: boolean; remark: string }>({ pass: true, remark: '' });

  const [hrOpen, setHrOpen] = useState(false);
  const [hrForm, setHrForm] = useState<{ id?: number; finalDecision: 'ADJUST' | 'KEEP'; remark: string }>({
    finalDecision: 'ADJUST',
    remark: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.employeeName) params.employeeName = query.employeeName;
      if (query.status) params.status = query.status;
      const res = await hrAttendanceAppealApi.page(params);
      setRows(res.rows || []);
      setTotal(res.total || 0);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载考勤申诉失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setFormData(emptyForm());
    setFormOpen(true);
  };

  const openDetail = async (row: HrAttendanceAppeal) => {
    if (!row.id) return;
    try {
      const data = await hrAttendanceAppealApi.detail(row.id);
      setDetail(data);
      setDetailOpen(true);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载详情失败'));
    }
  };

  const submitAppeal = async () => {
    if (!formData.attendanceDate) {
      toast.error('请选择考勤日期');
      return;
    }
    if (!formData.appealDetail?.trim()) {
      toast.error('请填写申诉详情');
      return;
    }
    try {
      await hrAttendanceAppealApi.submit(formData);
      toast.success('已提交申诉');
      setFormOpen(false);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '提交失败'));
    }
  };

  const handleCancel = async () => {
    if (!pendingCancel?.id) return;
    try {
      await hrAttendanceAppealApi.cancel(pendingCancel.id);
      toast.success('已撤回');
      setPendingCancel(null);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '撤回失败'));
    }
  };

  const openManagerReview = (row: HrAttendanceAppeal) => {
    setManagerForm({ id: row.id, pass: true, remark: '' });
    setManagerOpen(true);
  };

  const submitManagerReview = async () => {
    if (!managerForm.id) return;
    try {
      await hrAttendanceAppealApi.managerReview(managerForm.id, {
        pass: managerForm.pass,
        remark: managerForm.remark || undefined,
      });
      toast.success('已审核');
      setManagerOpen(false);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '审核失败'));
    }
  };

  const openHrReview = (row: HrAttendanceAppeal) => {
    setHrForm({ id: row.id, finalDecision: 'ADJUST', remark: '' });
    setHrOpen(true);
  };

  const submitHrReview = async () => {
    if (!hrForm.id) return;
    try {
      await hrAttendanceAppealApi.hrReview(hrForm.id, {
        finalDecision: hrForm.finalDecision,
        remark: hrForm.remark || undefined,
      });
      toast.success('已复核');
      setHrOpen(false);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '复核失败'));
    }
  };

  const filters = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">员工姓名</Label>
        <Input
          value={query.employeeName}
          onChange={(e) => setQuery((q) => ({ ...q, employeeName: e.target.value }))}
          placeholder="搜索员工"
          className="w-44"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">状态</Label>
        <Select value={query.status} onValueChange={(v) => setQuery((q) => ({ ...q, status: v === '__all' ? '' : v }))}>
          <SelectTrigger className="w-40"><SelectValue placeholder="全部" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">全部</SelectItem>
            {(Object.keys(STATUS_LABELS) as AttendanceAppealStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button variant="outline" onClick={() => setQuery((q) => ({ ...q, pageNum: 1 }))}>
        <RefreshCw className="mr-1 h-4 w-4" />查询
      </Button>
      <Button onClick={openCreate}>
        <Plus className="mr-1 h-4 w-4" />提交申诉
      </Button>
    </div>
  );

  const reviewableStatuses = useMemo(() => new Set<AttendanceAppealStatus>(['MANAGER_REVIEWING', 'HR_REVIEWING']), []);

  const table = (
    <TableSurfaceCard>
      <TableHeader>
        <tr>
          <TableHead>员工</TableHead>
          <TableHead>考勤日期</TableHead>
          <TableHead>申诉原因</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>提交时间</TableHead>
          <TableActionHead />
        </tr>
      </TableHeader>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
              <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="py-10 text-center text-sm text-slate-400">暂无数据</td>
          </tr>
        ) : (
          rows.map((row) => {
            const status = STATUS_LABELS[row.status || 'DRAFT'];
            const isReviewable = canEdit && row.status && reviewableStatuses.has(row.status);
            return (
              <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3 text-sm">{row.employeeName || '-'}</td>
                <td className="px-4 py-3 text-sm">{row.attendanceDate || '-'}</td>
                <td className="px-4 py-3 text-sm">{REASON_LABELS[row.appealReason || 'OTHER']}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${status.cls}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{formatDateTimeDisplay(row.createTime)}</td>
                <td className="px-4 py-3">
                  <TableRowActions
                    actions={[
                      { key: 'detail', label: '查看', semantic: 'view', onClick: () => void openDetail(row) },
                      ...(isReviewable && row.status === 'MANAGER_REVIEWING'
                        ? ([{ key: 'mreview', label: '主管审核', semantic: 'confirm' as const, onClick: () => openManagerReview(row) }])
                        : []),
                      ...(isReviewable && row.status === 'HR_REVIEWING'
                        ? ([{ key: 'hreview', label: 'HR 复核', semantic: 'confirm' as const, onClick: () => openHrReview(row) }])
                        : []),
                      ...(row.status === 'SUBMITTED' || row.status === 'MANAGER_REVIEWING'
                        ? ([{ key: 'cancel', label: '撤回', semantic: 'reset' as const, onClick: () => setPendingCancel(row) }])
                        : []),
                    ]}
                  />
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </TableSurfaceCard>
  );

  const pagination = (
    <div className="flex justify-end">
      <Pagination
        page={query.pageNum}
        pageSize={query.pageSize}
        total={total}
        onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
        onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
      />
    </div>
  );

  return (
    <>
      <TablePageLayout filters={filters} table={table} pagination={pagination} />

      <BaseDialog
        open={formOpen}
        title="提交考勤异常申诉"
        onClose={() => setFormOpen(false)}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={() => void submitAppeal()}>提交</Button>
          </div>
        )}
      >
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>考勤日期 *</Label>
              <DatePicker
                value={formData.attendanceDate || ''}
                onChange={(e) => setFormData((f) => ({ ...f, attendanceDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>申诉原因</Label>
              <Select
                value={formData.appealReason || 'FORGOT_CLOCK'}
                onValueChange={(v) => setFormData((f) => ({ ...f, appealReason: v as AttendanceAppealReason }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(REASON_LABELS) as AttendanceAppealReason[]).map((k) => (
                    <SelectItem key={k} value={k}>{REASON_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>期望上班时间</Label>
              <DatePicker
                type="datetime-local"
                value={formData.expectedClockIn || ''}
                onChange={(e) => setFormData((f) => ({ ...f, expectedClockIn: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>期望下班时间</Label>
              <DatePicker
                type="datetime-local"
                value={formData.expectedClockOut || ''}
                onChange={(e) => setFormData((f) => ({ ...f, expectedClockOut: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>申诉详情 *</Label>
            <Textarea
              rows={4}
              value={formData.appealDetail || ''}
              onChange={(e) => setFormData((f) => ({ ...f, appealDetail: e.target.value }))}
              placeholder="请详细说明事由"
            />
          </div>
          <div className="space-y-1">
            <Label>证明附件</Label>
            <FileUpload
              value={formData.evidenceUrl || ''}
              onChange={(value) => setFormData((f) => ({ ...f, evidenceUrl: value }))}
              maxCount={3}
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={detailOpen}
        title="申诉详情"
        onClose={() => setDetailOpen(false)}
        width="wide"
      >
        {detail ? (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {JSON.stringify(detail, null, 2)}
          </pre>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={managerOpen}
        title="主管审核"
        onClose={() => setManagerOpen(false)}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setManagerOpen(false)}>取消</Button>
            <Button onClick={() => void submitManagerReview()}>确认</Button>
          </div>
        )}
      >
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>审核结论</Label>
            <Select
              value={managerForm.pass ? 'PASS' : 'REJECT'}
              onValueChange={(v) => setManagerForm((f) => ({ ...f, pass: v === 'PASS' }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PASS">同意，转 HR 复核</SelectItem>
                <SelectItem value="REJECT">驳回</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>审核意见</Label>
            <Textarea
              rows={3}
              value={managerForm.remark}
              onChange={(e) => setManagerForm((f) => ({ ...f, remark: e.target.value }))}
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={hrOpen}
        title="HR 复核"
        onClose={() => setHrOpen(false)}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setHrOpen(false)}>取消</Button>
            <Button onClick={() => void submitHrReview()}>确认</Button>
          </div>
        )}
      >
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>最终判定</Label>
            <Select
              value={hrForm.finalDecision}
              onValueChange={(v) => setHrForm((f) => ({ ...f, finalDecision: v as 'ADJUST' | 'KEEP' }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADJUST">改写考勤记录（同意申诉）</SelectItem>
                <SelectItem value="KEEP">保留原记录（驳回申诉）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>HR 复核意见</Label>
            <Textarea
              rows={3}
              value={hrForm.remark}
              onChange={(e) => setHrForm((f) => ({ ...f, remark: e.target.value }))}
            />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={!!pendingCancel}
        title="撤回申诉"
        message={`确认撤回「${pendingCancel?.attendanceDate}」的申诉？撤回后流程将终止。`}
        danger
        onCancel={() => setPendingCancel(null)}
        onConfirm={handleCancel}
      />
    </>
  );
};

export default HrAttendanceAppealPage;
