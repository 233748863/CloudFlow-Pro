import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { LoaderCircle, Plus, RotateCcw } from 'lucide-react';
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
import { FilterBar } from '@/components/layout';
import AttachmentLinks from '@/components/AttachmentLinks';
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
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';

const emptyForm = (): HrAttendanceAppeal => ({
  attendanceDate: new Date().toISOString().slice(0, 10),
  appealReason: 'FORGOT_CLOCK',
  appealDetail: '',
  evidenceUrl: '',
  expectedClockIn: '',
  expectedClockOut: '',
});

const StatusBadge: React.FC<{ status?: AttendanceAppealStatus }> = ({ status }) => (
  <DictBadge dictType="hr_attendance_appeal_status" value={String(status || 'DRAFT')} />
);

const DetailField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
  </div>
);

const HrAttendanceAppealPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:attendance:edit') ?? true;
  const appealStatusDict = useDict('hr_attendance_appeal_status');
  const appealReasonDict = useDict('hr_attendance_appeal_reason');

  const [rows, setRows] = useState<HrAttendanceAppeal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ employeeName: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<HrAttendanceAppeal>(emptyForm);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<HrAttendanceAppeal | null>(null);

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
      setDetail((data as HrAttendanceAppeal) ?? row);
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

  const hasFilters = Boolean(query.employeeName || query.status);

  const filters = (
    <FilterBar
      search={{
        value: query.employeeName,
        onChange: (value) => setQuery((q) => ({ ...q, employeeName: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '搜索员工姓名',
        widthClassName: 'w-full sm:w-[220px]',
      }}
      filters={[
        <div key="status" className="w-full sm:w-40">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {appealStatusDict.getOptions().map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, employeeName: '', status: '' }))}>
                <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
              </Button>,
            ]
          : []),
        ...(canEdit
          ? [
              <Button key="add" size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />提交申诉
              </Button>,
            ]
          : []),
      ]}
    />
  );

  const reviewableStatuses = useMemo(() => new Set<AttendanceAppealStatus>(['MANAGER_REVIEWING', 'HR_REVIEWING']), []);

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>员工</TableHead>
              <TableHead>考勤日期</TableHead>
              <TableHead>申诉原因</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>提交时间</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">暂无数据</td>
              </tr>
            ) : (
              rows.map((row) => {
                const isReviewable = canEdit && row.status && reviewableStatuses.has(row.status);
                return (
                  <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 text-sm">{row.employeeName || '-'}</td>
                    <td className="px-4 py-3 text-sm">{row.attendanceDate || '-'}</td>
                    <td className="px-4 py-3 text-sm">{appealReasonDict.getLabel(String(row.appealReason || 'OTHER'))}</td>
                    <td className="px-4 py-3 text-sm"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTimeDisplay(row.createTime)}</td>
                    <td className="px-4 py-3 text-right">
                      <TableRowActions
                        align="end"
                        actions={[
                          { key: 'detail', label: '查看', semantic: 'view', onClick: () => void openDetail(row) },
                          ...(isReviewable && row.status === 'MANAGER_REVIEWING'
                            ? ([{ key: 'mreview', label: '主管审核', semantic: 'confirm' as const, permissionKey: 'hr:attendance:edit', onClick: () => openManagerReview(row) }])
                            : []),
                          ...(isReviewable && row.status === 'HR_REVIEWING'
                            ? ([{ key: 'hreview', label: 'HR 复核', semantic: 'confirm' as const, permissionKey: 'hr:attendance:edit', onClick: () => openHrReview(row) }])
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
                  {appealReasonDict.getOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
        headerAside={detail ? <StatusBadge status={detail.status} /> : null}
        footer={<Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button>}
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label="员工" value={detail.employeeName} />
              <DetailField label="考勤日期" value={detail.attendanceDate} />
              <DetailField label="申诉原因" value={appealReasonDict.getLabel(String(detail.appealReason || 'OTHER'))} />
              <DetailField label="期望上班时间" value={detail.expectedClockIn ? formatDateTimeDisplay(detail.expectedClockIn) : '-'} />
              <DetailField label="期望下班时间" value={detail.expectedClockOut ? formatDateTimeDisplay(detail.expectedClockOut) : '-'} />
              <DetailField label="提交时间" value={formatDateTimeDisplay(detail.createTime)} />
              <DetailField label="主管意见" value={detail.managerRemark} />
              <DetailField label="主管审核时间" value={detail.managerReviewTime ? formatDateTimeDisplay(detail.managerReviewTime) : '-'} />
              <DetailField label="HR 意见" value={detail.hrRemark} />
              <DetailField label="HR 复核时间" value={detail.hrReviewTime ? formatDateTimeDisplay(detail.hrReviewTime) : '-'} />
              <DetailField label="最终判定" value={detail.finalDecision === 'ADJUST' ? '改写考勤记录' : detail.finalDecision === 'KEEP' ? '保留原记录' : '-'} />
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">申诉详情</div>
              <div className="text-sm leading-6 text-slate-700 dark:text-slate-200">{detail.appealDetail || '-'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">证明附件</div>
              <AttachmentLinks value={detail.evidenceUrl} />
            </div>
          </div>
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
    </div>
  );
};

export default HrAttendanceAppealPage;
