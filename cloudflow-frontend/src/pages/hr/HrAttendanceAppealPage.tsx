import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Check, Eye, LoaderCircle, Plus, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DatePicker,
  EmployeeSelector,
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
import AttachmentLinks from '@/components/AttachmentLinks';
import FileUpload from '@/components/FileUpload';
import {
  hrAttendanceAppealApi,
  type AttendanceAppealStatus,
  type AttendanceAppealDecision,
  type HrAttendanceAppeal,
} from '@/services/api/hr/batch2';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeDisplay, toBackendDateString } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { ruleGet } from '@/services/api/hr/rules';
import { getCurrentHrEmployee } from '@/services/api/hr/employee';
import './admin-hr.css';

const emptyForm = (): HrAttendanceAppeal => ({
  attendanceDate: new Date().toLocaleDateString('sv-SE'),
  exceptionType: 'FORGOT_CLOCK',
  reason: '',
  evidenceUrls: [],
  expectedCheckIn: '',
  expectedCheckOut: '',
});

const StatusBadge: React.FC<{ appeal: HrAttendanceAppeal }> = ({ appeal }) => (
  <DictBadge dictType="hr_attendance_appeal_status" value={appeal.status === 'PENDING'
    ? appeal.managerId == null ? 'MANAGER_REVIEWING' : 'HR_REVIEWING'
    : appeal.status || 'DRAFT'} />
);
const appealStatuses = new Set<AttendanceAppealStatus>(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
const exceptionNames: Record<string, string> = {
  NORMAL: '正常', LATE: '迟到', EARLY_EXIT: '早退', LATE_AND_EARLY: '迟到且早退', HALF_DAY: '半天',
  ABSENT: '缺勤', LEAVE: '请假', HOLIDAY: '节假日', REST: '休息', BUSINESS_TRIP: '出差', PENDING: '待打卡', MISSING_PUNCH: '缺卡',
};

const DetailField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
    <div className="text-[11px] font-medium text-cf-faint">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-cf-title">{value || '-'}</div>
  </div>
);

const HrAttendanceAppealPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('hr:attendance:edit');
  const canSubmit = hasPermission('hr:attendance:add');
  const canReadEmployee = hasPermission('hr:employees:view');
  const [ownEmployeeId, setOwnEmployeeId] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    setOwnEmployeeId(null);
    if (canReadEmployee) void getCurrentHrEmployee().then(employee => {
      if (active) setOwnEmployeeId(employee?.id ?? null);
    }).catch(() => { if (active) setOwnEmployeeId(null); });
    return () => { active = false; };
  }, [canReadEmployee, user?.id, user?.tenantId]);
  const appealStatusDict = useDict('hr_attendance_appeal_status');
  const exceptionTypeDict = useDict('hr_attendance_appeal_reason');

  const [rows, setRows] = useState<HrAttendanceAppeal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ keyword: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<HrAttendanceAppeal>(emptyForm);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<HrAttendanceAppeal | null>(null);

  const [pendingCancel, setPendingCancel] = useState<HrAttendanceAppeal | null>(null);

  const [managerOpen, setManagerOpen] = useState(false);
  const [managerForm, setManagerForm] = useState<{ id?: number; pass: boolean; remark: string }>({ pass: true, remark: '' });

  const [hrOpen, setHrOpen] = useState(false);
  const [hrForm, setHrForm] = useState<{ id?: number; finalDecision: AttendanceAppealDecision; remark: string }>({
    finalDecision: 'REWRITE',
    remark: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.keyword) params.keyword = query.keyword;
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
      setDetail(data ?? row);
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
    if (!formData.reason?.trim()) {
      toast.error('请填写申诉详情');
      return;
    }
    try {
      if (!formData.employeeId) {
        toast.error('请选择员工');
        return;
      }
      const records = await ruleGet('/attendance/records', { employeeId: formData.employeeId });
      const record = records.find(row => String(row.employeeId) === String(formData.employeeId) && row.attendanceDate === formData.attendanceDate);
      if (!record) {
        toast.error('所选员工当天没有日考勤结论，请先完成考勤计算');
        return;
      }
      await hrAttendanceAppealApi.submit({
        employeeId: formData.employeeId, attendanceDate: formData.attendanceDate, attendanceRecordId: record.id,
        exceptionType: formData.exceptionType || record.status, reason: formData.reason,
        evidenceUrls: formData.evidenceUrls,
        expectedCheckIn: formData.expectedCheckIn ? toBackendDateString(formData.expectedCheckIn) : undefined,
        expectedCheckOut: formData.expectedCheckOut ? toBackendDateString(formData.expectedCheckOut) : undefined,
      });
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
    setHrForm({ id: row.id, finalDecision: 'REWRITE', remark: '' });
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

  const hasFilters = Boolean(query.keyword || query.status);

  const reviewingCount = rows.filter((row) => row.status === 'PENDING' && row.managerId != null).length;
  const completedCount = rows.filter((row) => row.status === 'APPROVED' || row.status === 'REJECTED').length;
  const draftCount = rows.filter((row) => row.status === 'DRAFT' || row.status === 'PENDING' && row.managerId == null).length;

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
    <>
      <section className="admin-source-page admin-hr-attendance-appeal-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">attendance appeal</p>
                  <h2>考勤申诉</h2>
                  <span>处理员工考勤异常申诉、主管审核与 HR 复核。</span>
                </div>
                <div className="admin-source-controls">
                  {canSubmit ? (
                    <Button size="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4" />提交申诉
                    </Button>
                  ) : null}
                </div>
              </header>
        
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <span className="admin-source-stat-icon"><LoaderCircle size={18} /></span>
                  <div>
                    <p>申诉总数</p>
                    <strong>{total}</strong>
                    <span>当前查询范围</span>
                  </div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <span className="admin-source-stat-icon"><RotateCcw size={18} /></span>
                  <div>
                    <p>待推进</p>
                    <strong>{draftCount}</strong>
                    <span>草稿或待主管审核</span>
                  </div>
                </article>
                <article className="card admin-source-stat admin-source-tone-violet">
                  <span className="admin-source-stat-icon"><Check size={18} /></span>
                  <div>
                    <p>审核中</p>
                    <strong>{reviewingCount}</strong>
                    <span>主管已通过，待 HR 复核</span>
                  </div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <span className="admin-source-stat-icon"><Check size={18} /></span>
                  <div>
                    <p>已完结</p>
                    <strong>{completedCount}</strong>
                    <span>通过或驳回</span>
                  </div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <form
                className="admin-users-filter-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  setQuery((q) => ({ ...q, pageNum: 1 }));
                }}
              >
                <label>
                  <span>员工</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      value={query.keyword}
                      onChange={(event) => setQuery((q) => ({ ...q, keyword: event.target.value, pageNum: 1 }))}
                      className="cf-control"
                      placeholder="搜索员工姓名"
                    />
                  </div>
                </label>
                <label>
                  <span>状态</span>
                  <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
                    <SelectTrigger className="cf-control"><SelectValue placeholder="全部状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部状态</SelectItem>
                      {[{ value: 'PENDING', label: '待处理' }, ...appealStatusDict.getOptions().filter(opt => opt.value !== 'PENDING' && appealStatuses.has(opt.value as AttendanceAppealStatus))].map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="admin-users-toolbar-actions">
                  <Button type="submit" size="sm">查询</Button>
                  {hasFilters ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, keyword: '', status: '' }))}>
                      <RotateCcw className="h-4 w-4" />清空条件
                    </Button>
                  ) : null}
                  <span className="admin-users-filter-count">共 {total} 条</span>
                </div>
              </form>
            </section>
          }
          table={
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[840px]">
                <thead>
                  <tr>
                    <th>员工</th>
                    <th>考勤日期</th>
                    <th>申诉原因</th>
                    <th>状态</th>
                    <th>提交时间</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-cf-faint">
                        <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-cf-faint">暂无数据</td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const isReviewable = canEdit && row.status === 'PENDING';
        
                      return (
                        <tr key={row.id}>
                          <td className="text-sm">{row.employeeName || '-'}</td>
                          <td className="text-sm">{row.attendanceDate || '-'}</td>
                          <td className="text-sm">{row.reason || exceptionTypeDict.getLabel(String(row.exceptionType || 'OTHER'))}</td>
                          <td><StatusBadge appeal={row} /></td>
                          <td className="text-xs text-cf-faint">{formatDateTimeDisplay(row.createTime)}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button type="button" data-tooltip="查看" aria-label="查看" onClick={() => void openDetail(row)}>
                                <Eye size={15} />
                              </button>
                              {isReviewable && row.managerId == null ? (
                                <button type="button" data-tooltip="主管审核" aria-label="主管审核" onClick={() => openManagerReview(row)}>
                                  <Check size={15} />
                                </button>
                              ) : null}
                              {isReviewable && row.managerId != null ? (
                                <button type="button" data-tooltip="HR 复核" aria-label="HR 复核" onClick={() => openHrReview(row)}>
                                  <Check size={15} />
                                </button>
                              ) : null}
                              {canEdit && ownEmployeeId != null && String(row.employeeId) === String(ownEmployeeId) && ['DRAFT', 'PENDING'].includes(row.status || '') ? (
                                <button type="button" data-tooltip="撤回" aria-label="撤回" onClick={() => setPendingCancel(row)}>
                                  <RotateCcw size={15} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                </table>
              </div>
            </InnerTableSurface>
          }
          pagination={pagination}
        />
      </section>

      <BaseDialog
        open={formOpen}
        title="提交考勤异常申诉"
        onClose={() => setFormOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={() => void submitAppeal()}>提交</Button>
          </div>
        )}
      >
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>员工 *</Label>
              <EmployeeSelector single value={formData.employeeId} onChange={employeeId => setFormData(f => ({ ...f, employeeId: employeeId == null ? undefined : Number(employeeId) }))} />
            </div>
            <div className="admin-dialog-field">
              <Label>考勤日期 *</Label>
              <DatePicker
                aria-label="考勤日期"
                value={formData.attendanceDate || ''}
                onChange={(e) => setFormData((f) => ({ ...f, attendanceDate: e.target.value }))}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>申诉原因</Label>
              <Select
                value={formData.exceptionType || 'FORGOT_CLOCK'}
                onValueChange={(v) => setFormData((f) => ({ ...f, exceptionType: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {exceptionTypeDict.getOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>期望上班时间</Label>
              <DatePicker
                type="datetime-local"
                aria-label="期望上班时间"
                value={formData.expectedCheckIn || ''}
                onChange={(e) => setFormData((f) => ({ ...f, expectedCheckIn: e.target.value }))}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>期望下班时间</Label>
              <DatePicker
                type="datetime-local"
                aria-label="期望下班时间"
                value={formData.expectedCheckOut || ''}
                onChange={(e) => setFormData((f) => ({ ...f, expectedCheckOut: e.target.value }))}
              />
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>申诉详情 *</Label>
            <Textarea
              rows={4}
              aria-label="申诉详情"
              value={formData.reason || ''}
              onChange={(e) => setFormData((f) => ({ ...f, reason: e.target.value }))}
              placeholder="请详细说明事由"
            />
          </div>
          <div className="admin-dialog-field">
            <Label>证明附件</Label>
            <FileUpload
              value={(formData.evidenceUrls || []).join(',')}
              onChange={(value) => setFormData((f) => ({ ...f, evidenceUrls: value.split(',').map(item => item.trim()).filter(Boolean) }))}
              maxCount={3}
            />
          </div>
        </>
      </BaseDialog>

      <BaseDialog
        open={detailOpen}
        title="申诉详情"
        onClose={() => setDetailOpen(false)}
        width="wide"
        headerAside={detail ? <StatusBadge appeal={detail} /> : null}
        bodyClassName="admin-dialog-stack"
        footer={<Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button>}
      >
        {detail ? (
          <div className="admin-source-content-grid">
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label="员工" value={detail.employeeName} />
              <DetailField label="考勤日期" value={detail.attendanceDate} />
              <DetailField label="异常类型" value={exceptionNames[detail.exceptionType || ''] || exceptionTypeDict.getLabel(String(detail.exceptionType || 'OTHER'))} />
              <DetailField label="期望上班时间" value={detail.expectedCheckIn ? formatDateTimeDisplay(detail.expectedCheckIn) : '-'} />
              <DetailField label="期望下班时间" value={detail.expectedCheckOut ? formatDateTimeDisplay(detail.expectedCheckOut) : '-'} />
              <DetailField label="提交时间" value={formatDateTimeDisplay(detail.createTime)} />
              <DetailField label="主管意见" value={detail.managerRemark} />

              <DetailField label="HR 意见" value={detail.hrRemark} />
              <DetailField label="HR 复核时间" value={detail.decidedTime ? formatDateTimeDisplay(detail.decidedTime) : '-'} />
              <DetailField label="最终判定" value={detail.finalDecision === 'REWRITE' ? '改写考勤记录' : detail.finalDecision === 'REJECT' ? '保留原记录（驳回申诉）' : detail.finalDecision === 'IGNORE' ? '保留原记录（同意申诉）' : '-'} />
            </div>
            <section className="card admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>申诉详情</h3>
                  <span>员工提交的异常说明</span>
                </div>
              </div>
              <div>
                <div className="text-sm leading-6 text-cf-body">{detail.reason || '-'}</div>
              </div>
            </section>
            <section className="card admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>证明附件</h3>
                  <span>申诉相关材料</span>
                </div>
              </div>
              <div>
                <AttachmentLinks value={(detail.evidenceUrls || []).join(',')} downloadContext={{ bizType: 'HR_ATTENDANCE_APPEAL', bizId: String(detail.id) }} />
              </div>
            </section>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={managerOpen}
        title="主管审核"
        onClose={() => setManagerOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setManagerOpen(false)}>取消</Button>
            <Button onClick={() => void submitManagerReview()}>确认</Button>
          </div>
        )}
      >
        <>
          <div className="admin-dialog-field">
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
          <div className="admin-dialog-field">
            <Label>审核意见</Label>
            <Textarea
              rows={3}
              value={managerForm.remark}
              onChange={(e) => setManagerForm((f) => ({ ...f, remark: e.target.value }))}
            />
          </div>
        </>
      </BaseDialog>

      <BaseDialog
        open={hrOpen}
        title="HR 复核"
        onClose={() => setHrOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setHrOpen(false)}>取消</Button>
            <Button onClick={() => void submitHrReview()}>确认</Button>
          </div>
        )}
      >
        <>
          <div className="admin-dialog-field">
            <Label>最终判定</Label>
            <Select
              value={hrForm.finalDecision}
              onValueChange={(v) => setHrForm((f) => ({ ...f, finalDecision: v as AttendanceAppealDecision }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="REWRITE">改写考勤记录（同意申诉）</SelectItem>
                <SelectItem value="REJECT">保留原记录（驳回申诉）</SelectItem>
                <SelectItem value="IGNORE">保留原记录（同意申诉）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field">
            <Label>HR 复核意见</Label>
            <Textarea
              rows={3}
              value={hrForm.remark}
              onChange={(e) => setHrForm((f) => ({ ...f, remark: e.target.value }))}
            />
          </div>
        </>
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
